import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_public_knowledge_snapshot import SnapshotError, build_snapshot


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class PublicKnowledgeSnapshotTests(unittest.TestCase):
    def write_valid_sync_outputs(self, sync_dir: Path):
        public_report = {
            "menu": {
                "included_count": 47,
                "excluded_count": 936,
                "excluded_reasons": {"not_ai_public": 936},
                "warnings": [{"code": "menu.public_duplicate_name", "message": "duplicate"}],
            },
            "store_faq": {
                "included_count": 1,
                "excluded_count": 2,
                "excluded_reasons": {"not_answer_allowed": 2},
                "warnings": [],
            },
        }
        write_json(
            sync_dir / "report.json",
            {
                "mode": "dry-run",
                "target": "all",
                "menu_count": 983,
                "store_count": 3,
                "public_menu_count": 47,
                "public_store_faq_count": 1,
                "error_count": 0,
                "warning_count": 3,
            },
        )
        write_text(sync_dir / "menu.public.jsonl", '{"name":"生ビール","price":650}\n')
        write_text(
            sync_dir / "store_faq.public.jsonl",
            '{"key":"営業時間","answer":"11時から営業しています。"}\n',
        )
        write_json(sync_dir / "public_knowledge_report.json", public_report)

    def test_builds_snapshot_from_validated_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            sync_dir = Path(tmp) / "sync"
            snapshot_dir = Path(tmp) / "snapshot"
            self.write_valid_sync_outputs(sync_dir)

            result = build_snapshot(sync_dir=sync_dir, snapshot_dir=snapshot_dir)

            self.assertEqual(result["public_menu_count"], 47)
            self.assertEqual(result["public_store_faq_count"], 1)
            self.assertTrue((snapshot_dir / "menu.public.jsonl").exists())
            self.assertTrue((snapshot_dir / "store_faq.public.jsonl").exists())
            self.assertTrue((snapshot_dir / "public_knowledge_report.json").exists())
            manifest = json.loads((snapshot_dir / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["public_menu_count"], 47)
            self.assertEqual(manifest["public_store_faq_count"], 1)
            self.assertEqual(manifest["files"]["menu"], "menu.public.jsonl")

    def test_refuses_snapshot_when_validation_has_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            sync_dir = Path(tmp) / "sync"
            snapshot_dir = Path(tmp) / "snapshot"
            self.write_valid_sync_outputs(sync_dir)
            write_json(sync_dir / "report.json", {"error_count": 1})

            with self.assertRaises(SnapshotError):
                build_snapshot(sync_dir=sync_dir, snapshot_dir=snapshot_dir)

            self.assertFalse(snapshot_dir.exists())

    def test_refuses_snapshot_when_required_public_file_is_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            sync_dir = Path(tmp) / "sync"
            snapshot_dir = Path(tmp) / "snapshot"
            self.write_valid_sync_outputs(sync_dir)
            (sync_dir / "store_faq.public.jsonl").unlink()

            with self.assertRaises(SnapshotError):
                build_snapshot(sync_dir=sync_dir, snapshot_dir=snapshot_dir)


if __name__ == "__main__":
    unittest.main()
