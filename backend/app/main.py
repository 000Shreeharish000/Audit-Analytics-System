from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api import auth, dataset, explain, governance, graph, ingest, investigation, manual_audit, pathways, regintel, report_draft, rules, system_state
from app.dependencies import get_container
from app.security.api_guard import (
    RateLimitMiddleware,
    RequestContextMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)


def create_app() -> FastAPI:
    container = get_container()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        container.audit_logger.log(
            "service_started",
            actor="system",
            details={"app": container.settings.app_name},
        )
        yield

    app = FastAPI(
        title=container.settings.app_name,
        version=container.settings.app_version,
        description=(
            "Enterprise governance intelligence backend for digital-twin decision "
            "reasoning and control-bypass pathway detection."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=container.settings.allowed_hosts)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        RequestSizeLimitMiddleware,
        max_size_mb=container.settings.max_request_size_mb,
    )
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=container.settings.rate_limit_per_minute,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=container.settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(ingest.router)
    app.include_router(dataset.router)
    app.include_router(governance.router)
    app.include_router(graph.router)
    app.include_router(rules.router)
    app.include_router(pathways.router)
    app.include_router(investigation.router)
    app.include_router(explain.router)
    app.include_router(system_state.router)
    app.include_router(manual_audit.router)
    app.include_router(report_draft.router)
    app.include_router(regintel.router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {
            "status": "ok",
            "mode": "hybrid" if container.model_governor.external_enabled() else "air-gapped",
            "version": container.settings.app_version,
        }

    return app


app = create_app()
