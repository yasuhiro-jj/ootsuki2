"""Build an app-bundled public knowledge snapshot from validated sync outputs."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import sys
from typing import Any


SNAPSHOT_FILES = (
    "menu.public.jsonl",
    "store_faq.public.jsonl",
    "public_knowledge_report.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a public Notion knowledge snapshot after validation"
    )
    parser.add_argument("--sync-dir", default="outputs/notion_sync")
    parser.add_argument("--snapshot-dir", default="public_notion_knowledge")
    parser.add_argument("--report", default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sync_dir = Path(args.sync_dir)
    snapshot_dir = Path(args.snapshot_dir)
    try:
        result = build_snapshot(sync_dir=sync_dir, snapshot_dir=snapshot_dir)
    except SnapshotError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


class SnapshotError(RuntimeError):
    pass


def build_snapshot(*, sync_dir: Path, snapshot_dir: Path) -> dict[str, Any]:
    report_path = sync_dir / "report.json"
    if not report_path.exists():
        raise SnapshotError(f"Missing validation report: {report_path}")

    sync_report = _read_json(report_path)
    error_count = int(sync_report.get("error_count") or 0)
    if error_count:
        raise SnapshotError(
            f"Refusing to build public knowledge snapshot with {error_count} validation errors."
        )

    for file_name in SNAPSHOT_FILES:
        source = sync_dir / file_name
        if not source.exists():
            raise SnapshotError(f"Missing required sync output: {source}")

    snapshot_dir.mkdir(parents=True, exist_ok=True)
    updated_files: list[str] = []
    for file_name in SNAPSHOT_FILES:
        source = sync_dir / file_name
        destination = snapshot_dir / file_name
        shutil.copyfile(source, destination)
        updated_files.append(str(destination))

    public_report = _read_json(snapshot_dir / "public_knowledge_report.json")
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "notion-knowledge-sync",
        "mode": sync_report.get("mode", "dry-run"),
        "target": sync_report.get("target"),
        "menu_count": sync_report.get("menu_count", 0),
        "store_count": sync_report.get("store_count", 0),
        "public_menu_count": sync_report.get("public_menu_count", 0),
        "public_store_faq_count": sync_report.get("public_store_faq_count", 0),
        "error_count": error_count,
        "warning_count": int(sync_report.get("warning_count") or 0),
        "public_knowledge": public_report,
        "files": {
            "menu": "menu.public.jsonl",
            "store_faq": "store_faq.public.jsonl",
            "report": "public_knowledge_report.json",
        },
    }
    manifest_path = snapshot_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    updated_files.append(str(manifest_path))

    return {
        "snapshot_dir": str(snapshot_dir),
        "updated_files": updated_files,
        "public_menu_count": manifest["public_menu_count"],
        "public_store_faq_count": manifest["public_store_faq_count"],
        "excluded_reasons": {
            "menu": public_report.get("menu", {}).get("excluded_reasons", {}),
            "store_faq": public_report.get("store_faq", {}).get("excluded_reasons", {}),
        },
        "warnings": {
            "menu": public_report.get("menu", {}).get("warnings", []),
            "store_faq": public_report.get("store_faq", {}).get("warnings", []),
        },
        "manifest": str(manifest_path),
    }


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    raise SystemExit(main())
