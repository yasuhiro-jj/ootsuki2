import os
import ast
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from core.security.admin_auth import (
    ADMIN_API_KEY_ENV,
    ADMIN_API_KEY_HEADER,
    require_admin_api_key,
)


def make_client() -> TestClient:
    app = FastAPI()

    @app.get("/admin/check", dependencies=[Depends(require_admin_api_key)])
    def check_admin_auth():
        return {"ok": True}

    @app.get("/health")
    def health_check():
        return {"status": "healthy"}

    return TestClient(app)


class AdminAuthTests(unittest.TestCase):
    def test_correct_admin_api_key_allows_request(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: "test-admin-api-key"}, clear=False):
            response = client.get(
                "/admin/check",
                headers={ADMIN_API_KEY_HEADER: "test-admin-api-key"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})

    def test_missing_admin_api_key_header_returns_401(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: "test-admin-api-key"}, clear=False):
            response = client.get("/admin/check")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Unauthorized"})
        self.assertNotIn("test-admin-api-key", response.text)

    def test_blank_admin_api_key_header_returns_401(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: "test-admin-api-key"}, clear=False):
            response = client.get(
                "/admin/check",
                headers={ADMIN_API_KEY_HEADER: " "},
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Unauthorized"})

    def test_wrong_admin_api_key_header_returns_401(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: "test-admin-api-key"}, clear=False):
            response = client.get(
                "/admin/check",
                headers={ADMIN_API_KEY_HEADER: "wrong-admin-api-key"},
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Unauthorized"})
        self.assertNotIn("wrong-admin-api-key", response.text)

    def test_other_header_name_is_not_accepted(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: "test-admin-api-key"}, clear=False):
            response = client.get(
                "/admin/check",
                headers={"X-Api-Key": "test-admin-api-key"},
            )

        self.assertEqual(response.status_code, 401)

    def test_query_parameter_key_is_not_accepted(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: "test-admin-api-key"}, clear=False):
            response = client.get("/admin/check?admin_api_key=test-admin-api-key")

        self.assertEqual(response.status_code, 401)

    def test_unconfigured_admin_api_key_returns_503(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: ""}, clear=False):
            response = client.get(
                "/admin/check",
                headers={ADMIN_API_KEY_HEADER: "test-admin-api-key"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {"detail": "Admin API authentication is not configured"},
        )

    def test_public_health_route_does_not_require_admin_api_key(self):
        client = make_client()
        with patch.dict(os.environ, {ADMIN_API_KEY_ENV: ""}, clear=False):
            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "healthy"})

    def test_sales_strategy_admin_routes_require_dependency(self):
        source = Path("core/api.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        protected_paths = {
            "/admin/ai-manager/sales-strategies",
            "/admin/ai-manager/sales-strategies/current",
            "/admin/ai-manager/sales-strategies/{strategy_id}",
            "/admin/ai-manager/sales-strategies/{strategy_id}/activate",
            "/admin/ai-manager/sales-strategies/{strategy_id}/deactivate",
            "/admin/customer-memory/{anonymous_customer_id}",
        }
        found_paths = {}
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                if not isinstance(decorator.func, ast.Attribute):
                    continue
                if decorator.func.attr not in {"get", "post", "put"}:
                    continue
                if not decorator.args:
                    continue
                route_arg = decorator.args[0]
                if not isinstance(route_arg, ast.Constant):
                    continue
                route_path = route_arg.value
                if route_path not in protected_paths:
                    continue
                found_paths.setdefault(route_path, set()).add(decorator.func.attr)
                self.assertTrue(
                    any(keyword.arg == "dependencies" for keyword in decorator.keywords),
                    route_path,
                )

        self.assertEqual(set(found_paths), protected_paths)


if __name__ == "__main__":
    unittest.main()
