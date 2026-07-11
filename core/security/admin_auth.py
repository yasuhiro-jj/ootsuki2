"""Admin API key authentication for sensitive management endpoints."""

from __future__ import annotations

import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException, status

ADMIN_API_KEY_ENV = "ADMIN_API_KEY"
ADMIN_API_KEY_HEADER = "X-Admin-API-Key"


def get_admin_api_key() -> str:
    return os.getenv(ADMIN_API_KEY_ENV, "").strip()


def require_admin_api_key(
    x_admin_api_key: Optional[str] = Header(default=None, alias=ADMIN_API_KEY_HEADER),
) -> None:
    expected_key = get_admin_api_key()
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API authentication is not configured",
        )

    provided_key = (x_admin_api_key or "").strip()
    if not provided_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )

    if not secrets.compare_digest(provided_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )

