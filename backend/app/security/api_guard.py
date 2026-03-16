from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Deque, Dict
from uuid import uuid4

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 120) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self._requests: Dict[str, Deque[datetime]] = defaultdict(deque)
        self._lock = Lock()

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        client_ip = request.client.host if request.client else "unknown"
        route_key = f"{client_ip}:{request.method}:{request.url.path}"
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=1)

        with self._lock:
            queue = self._requests[route_key]
            while queue and queue[0] < window_start:
                queue.popleft()
            if len(queue) >= self.requests_per_minute:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded"},
                )
            queue.append(now)

        return await call_next(request)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_size_mb: int = 5) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.max_size_bytes = max_size_mb * 1024 * 1024

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size_bytes:
            return JSONResponse(status_code=413, content={"detail": "Payload too large"})
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        return response


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        request_id = request.headers.get("X-Request-ID", str(uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

