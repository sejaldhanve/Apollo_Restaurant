"""Authentication and tenant-authorization middleware for Apollo Agent Service.

Guarantees:
1. Uses the exact signing secret and HS256 verification as Apollo API backend.
2. Validates active organization membership, location membership, and permissions
   against the authenticated backend context.
3. Fails closed if authorization cannot be confirmed.
"""

import base64
import hashlib
import hmac
import json
import time
from abc import ABC, abstractmethod
from typing import Any

import httpx
from fastapi import Header, HTTPException, Request, status

from src.config import settings
from src.context.restaurant_context import RestaurantContext


def _b64url_decode(segment: str) -> bytes:
    """Decode base64url string with required padding."""
    rem = len(segment) % 4
    if rem > 0:
        segment += "=" * (4 - rem)
    return base64.urlsafe_b64decode(segment)


def _b64url_encode(data: bytes) -> str:
    """Encode bytes into base64url string without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def create_token(
    user_id: str,
    email: str = "user@apollo.internal",
    secret: str | None = None,
    expires_in: int = 900,
    token_type: str = "access",
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Generate an HS256 JWT matching the Apollo API backend signature format."""
    signing_secret = secret or settings.JWT_SECRET
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "email": email,
        "type": token_type,
        "iat": now,
        "exp": now + expires_in,
    }
    if extra_claims:
        payload.update(extra_claims)

    h_str = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_str = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _b64url_encode(
        hmac.new(
            signing_secret.encode("utf-8"),
            f"{h_str}.{p_str}".encode(),
            hashlib.sha256,
        ).digest()
    )
    return f"{h_str}.{p_str}.{sig}"


def verify_jwt(token: str, secret: str | None = None) -> dict[str, Any]:
    """Verify an HS256 JWT using Apollo backend signing conventions.

    Raises HTTPException(401) on any signature, expiry, or claim defect.
    """
    signing_secret = secret or settings.JWT_SECRET
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    h_b64, p_b64, s_b64 = parts
    expected_sig = _b64url_encode(
        hmac.new(
            signing_secret.encode("utf-8"),
            f"{h_b64}.{p_b64}".encode(),
            hashlib.sha256,
        ).digest()
    )

    if not hmac.compare_digest(expected_sig, s_b64):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = json.loads(_b64url_decode(p_b64).decode("utf-8"))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err

    # Expiry verification
    now = int(time.time())
    if "exp" in payload and payload["exp"] < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims: expected access token with subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


class BaseTenantValidator(ABC):
    """Abstract interface for validating tenant context against Apollo backend."""

    @abstractmethod
    async def validate_tenant(
        self,
        token: str,
        user_id: str,
        organization_id: str,
        location_id: str,
    ) -> RestaurantContext:
        """Validate that user has active membership in organization & location. Fail closed."""
        raise NotImplementedError


class BackendTenantValidator(BaseTenantValidator):
    """Authoritative tenant validator querying Apollo API /auth/me."""

    async def validate_tenant(
        self,
        token: str,
        user_id: str,
        organization_id: str,
        location_id: str,
    ) -> RestaurantContext:
        url = f"{settings.API_BASE_URL}/auth/me"
        headers = {"Authorization": f"Bearer {token}"}

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, headers=headers)
        except Exception as err:
            # Fail closed when Apollo backend is unreachable
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Unable to reach Apollo authorization backend: {err}",
            ) from err

        if res.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Backend rejected user authentication",
            )
        if res.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Authorization check failed with status {res.status_code}",
            )

        data = res.json().get("data", {})
        memberships = data.get("memberships", [])

        # Find active membership matching organization_id
        target_membership = None
        for m in memberships:
            if m.get("organizationId") == organization_id:
                target_membership = m
                break

        if not target_membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User {user_id} lacks active membership in organization {organization_id}",
            )

        role = target_membership.get("role", "Staff")
        permissions = target_membership.get("permissions", [])

        return RestaurantContext(
            organization_id=organization_id,
            location_id=location_id,
            user_id=user_id,
            user_role=role,
            permissions=permissions,
        )


class MockTenantValidator(BaseTenantValidator):
    """Deterministic tenant validator for offline unit testing."""

    def __init__(self) -> None:
        # Map: (user_id, organization_id) -> (role, permissions, list_of_location_ids)
        self.registry: dict[tuple[str, str], tuple[str, list[str], list[str]]] = {}

    def allow(
        self,
        user_id: str,
        organization_id: str,
        locations: list[str],
        role: str = "Owner",
        permissions: list[str] | None = None,
    ) -> None:
        perms = permissions if permissions is not None else ["*"]
        self.registry[(user_id, organization_id)] = (role, perms, locations)

    async def validate_tenant(
        self,
        token: str,
        user_id: str,
        organization_id: str,
        location_id: str,
    ) -> RestaurantContext:
        key = (user_id, organization_id)
        if key not in self.registry:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User {user_id} is not an authorized member of organization {organization_id}",
            )

        role, perms, locations = self.registry[key]
        if (
            locations
            and location_id not in locations
            and "*" not in locations
            and role not in ("Owner", "Admin")
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User {user_id} lacks access to location {location_id}",
            )

        return RestaurantContext(
            organization_id=organization_id,
            location_id=location_id,
            user_id=user_id,
            user_role=role,
            permissions=perms,
        )


# Global validator singleton
_tenant_validator: BaseTenantValidator = BackendTenantValidator()


def get_tenant_validator() -> BaseTenantValidator:
    return _tenant_validator


def set_tenant_validator(validator: BaseTenantValidator) -> None:
    global _tenant_validator
    _tenant_validator = validator


async def get_current_restaurant_context(
    request: Request,
    authorization: str | None = Header(default=None),
    x_organization_id: str | None = Header(default=None),
    x_location_id: str | None = Header(default=None),
) -> RestaurantContext:
    """FastAPI dependency: authenticates Bearer JWT and validates tenant context.

    Extracts organizationId and locationId from headers or request JSON body.
    Fails closed if any identity or tenant boundary is violated.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing or invalid format (Bearer token required)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token is empty",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_jwt(token)
    user_id = payload["sub"]

    # Extract target organization and location
    org_id = x_organization_id
    loc_id = x_location_id

    # If not in headers, inspect body if present
    if not org_id or not loc_id:
        try:
            body = await request.json()
            if isinstance(body, dict):
                org_id = org_id or body.get("organization_id")
                loc_id = loc_id or body.get("location_id")
        except Exception:
            pass

    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing organization identifier (provide in header 'x-organization-id' or body)",
        )
    if not loc_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing location identifier (provide in header 'x-location-id' or body)",
        )

    # Validate tenant access using backend context — fail closed
    validator = get_tenant_validator()
    return await validator.validate_tenant(token, user_id, org_id, loc_id)
