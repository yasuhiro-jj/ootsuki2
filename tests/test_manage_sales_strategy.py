import json
import tempfile
import unittest
from pathlib import Path

from scripts.manage_sales_strategy import _load_json


class ManageSalesStrategyScriptTests(unittest.TestCase):
    def test_load_json_accepts_utf8_bom(self):
        payload = {"strategy_id": "production_smoke_test_001"}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "strategy.json"
            path.write_text(json.dumps(payload), encoding="utf-8-sig")

            loaded = _load_json(str(path))

        self.assertEqual(loaded["strategy_id"], "production_smoke_test_001")


if __name__ == "__main__":
    unittest.main()
