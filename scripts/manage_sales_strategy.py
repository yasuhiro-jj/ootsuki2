"""CLI helper for protected sales strategy admin API calls."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

ADMIN_API_KEY_ENV = "ADMIN_API_KEY"
ADMIN_API_URL_ENV = "OOTSUKI_API_URL"
ADMIN_API_KEY_HEADER = "X-Admin-API-Key"
DEFAULT_API_URL = "http://localhost:8000"


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage Ootsuki sales strategies.")
    parser.add_argument(
        "--api-url",
        default=os.getenv(ADMIN_API_URL_ENV, DEFAULT_API_URL),
        help=f"Base API URL. Defaults to ${ADMIN_API_URL_ENV} or {DEFAULT_API_URL}.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list")
    subparsers.add_parser("current")

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("strategy_id")

    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("--file", required=True)

    update_parser = subparsers.add_parser("update")
    update_parser.add_argument("strategy_id")
    update_parser.add_argument("--file", required=True)

    activate_parser = subparsers.add_parser("activate")
    activate_parser.add_argument("strategy_id")

    deactivate_parser = subparsers.add_parser("deactivate")
    deactivate_parser.add_argument("strategy_id")

    args = parser.parse_args()
    api_key = _require_api_key()
    if not api_key:
        return 2

    base_url = str(args.api_url).rstrip("/")
    try:
        if args.command == "list":
            response = _request("GET", f"{base_url}/admin/ai-manager/sales-strategies", api_key)
        elif args.command == "current":
            response = _request(
                "GET", f"{base_url}/admin/ai-manager/sales-strategies/current", api_key
            )
        elif args.command == "get":
            response = _request(
                "GET",
                f"{base_url}/admin/ai-manager/sales-strategies/{args.strategy_id}",
                api_key,
            )
        elif args.command == "create":
            response = _request(
                "POST",
                f"{base_url}/admin/ai-manager/sales-strategies",
                api_key,
                _load_json(args.file),
            )
        elif args.command == "update":
            response = _request(
                "PUT",
                f"{base_url}/admin/ai-manager/sales-strategies/{args.strategy_id}",
                api_key,
                _load_json(args.file),
            )
        elif args.command == "activate":
            response = _request(
                "POST",
                f"{base_url}/admin/ai-manager/sales-strategies/{args.strategy_id}/activate",
                api_key,
            )
        elif args.command == "deactivate":
            response = _request(
                "POST",
                f"{base_url}/admin/ai-manager/sales-strategies/{args.strategy_id}/deactivate",
                api_key,
            )
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


def _require_api_key() -> str:
    api_key = os.getenv(ADMIN_API_KEY_ENV, "").strip()
    if not api_key:
        print(f"ERROR: {ADMIN_API_KEY_ENV} is not set.", file=sys.stderr)
        return ""
    return api_key


def _load_json(path: str) -> Dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


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
