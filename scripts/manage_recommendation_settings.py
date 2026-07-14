"""CLI helper for protected recommendation settings admin API calls."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

ADMIN_API_KEY_ENV = "ADMIN_API_KEY"
ADMIN_API_URL_ENV = "OOTSUKI_API_URL"
ADMIN_API_KEY_HEADER = "X-Admin-API-Key"
DEFAULT_API_URL = "http://localhost:8000"


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage recommendation settings.")
    parser.add_argument(
        "--api-url",
        default=os.getenv(ADMIN_API_URL_ENV, DEFAULT_API_URL),
        help=f"Base API URL. Defaults to ${ADMIN_API_URL_ENV} or {DEFAULT_API_URL}.",
    )
    parser.add_argument("--strategy-id", default="")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("show")

    update_parser = subparsers.add_parser("update")
    update_parser.add_argument("--file", required=True)

    subparsers.add_parser("reset")
    subparsers.add_parser("performance")

    args = parser.parse_args()
    api_key = _require_api_key()
    if not api_key:
        return 2

    base_url = str(args.api_url).rstrip("/")
    strategy_id = str(args.strategy_id or "").strip()
    try:
        if args.command == "show":
            response = _request("GET", _settings_url(base_url, strategy_id), api_key)
        elif args.command == "update":
            response = _request(
                "PUT",
                _settings_url(base_url, strategy_id),
                api_key,
                _load_json(args.file),
            )
        elif args.command == "reset":
            response = _request("POST", f"{_settings_url(base_url, strategy_id)}/reset", api_key)
        elif args.command == "performance":
            response = _request("GET", _performance_url(base_url, strategy_id), api_key)
        else:
            parser.error(f"unknown command: {args.command}")
            return 2
    except urllib.error.HTTPError as exc:
        _print_http_error(exc)
        return 1
    except urllib.error.URLError as exc:
        print(f"ERROR: request failed: {exc.reason}", file=sys.stderr)
        return 1

    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


def _settings_url(base_url: str, strategy_id: str = "") -> str:
    if strategy_id:
        quoted = urllib.parse.quote(strategy_id, safe="")
        return f"{base_url}/admin/ai-manager/sales-strategies/{quoted}/recommendation-settings"
    return f"{base_url}/admin/ai-manager/recommendation-settings"


def _performance_url(base_url: str, strategy_id: str = "") -> str:
    url = f"{base_url}/admin/ai-manager/recommendation-performance"
    if strategy_id:
        return f"{url}?strategy_id={urllib.parse.quote(strategy_id, safe='')}"
    return url


def _require_api_key() -> str:
    api_key = os.getenv(ADMIN_API_KEY_ENV, "").strip()
    if not api_key:
        print(f"ERROR: {ADMIN_API_KEY_ENV} is not set.", file=sys.stderr)
        return ""
    return api_key


def _load_json(path: str) -> Dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _request(
    method: str,
    url: str,
    api_key: str,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    body = None
    headers = {ADMIN_API_KEY_HEADER: api_key}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        response_body = response.read().decode("utf-8")
    if not response_body:
        return {}
    return json.loads(response_body)


def _print_http_error(exc: urllib.error.HTTPError) -> None:
    try:
        body = exc.read().decode("utf-8")
        detail = json.loads(body)
    except Exception:
        detail = {"detail": exc.reason}
    print(
        json.dumps(
            {
                "status": exc.code,
                "error": detail.get("detail", "request failed")
                if isinstance(detail, dict)
                else "request failed",
            },
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )


if __name__ == "__main__":
    raise SystemExit(main())
