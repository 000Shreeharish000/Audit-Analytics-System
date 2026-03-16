from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import LoginRequest, LoginResponse, UserProfile, UserProvisionRequest
from app.security.rbac import require_roles

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    request: LoginRequest,
    container: RuntimeContainer = Depends(get_container),
) -> LoginResponse:
    token_payload = container.issue_access_token(request.username, request.password)
    if not token_payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if token_payload.get("error") == "account_locked":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked until {token_payload.get('locked_until')}",
        )

    return LoginResponse(
        access_token=token_payload["access_token"],
        role=token_payload["role"],
        expires_in_minutes=token_payload["expires_in_minutes"],
        locked_until=token_payload.get("locked_until"),
    )


@router.post("/users", response_model=UserProfile)
def provision_user(
    payload: UserProvisionRequest,
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> UserProfile:
    return container.provision_user(payload, actor=current_user["username"])


@router.get("/users", response_model=list[UserProfile])
def list_users(
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> list[UserProfile]:
    return container.list_user_profiles()
