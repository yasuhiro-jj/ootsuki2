"""Read-only dry-run sync for Ootsuki Notion menu and store FAQ DBs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from core.notion_sync import DEFAULT_OUTPUT_DIR, sync_notion_knowledge


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only sync and validation for Ootsuki Notion knowledge DBs"
    )
    parser.add_argument(
        "--target",
        choices=("all", "menu", "store"),
        default="all",
        help="Which read-only sync target to run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Always enabled. The command never writes to Notion.",
    )
    parser.add_argument(
        "--menu-db",
        default=None,
        help="Override menu database ID. Defaults to env or known Ootsuki DB.",
    )
    parser.add_argument(
        "--store-db",
        default=None,
        help="Override store database ID. Defaults to env or known Ootsuki DB.",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for normalized JSONL and report output.",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Optional report path. Defaults to <output-dir>/report.json.",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv()
    args = parse_args()
    report = sync_notion_knowledge(
        target=args.target,
        menu_db_id=args.menu_db,
        store_db_id=args.store_db,
        output_dir=args.output_dir,
    )

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        report.outputs["report"] = str(report_path)

    print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))
    print("Dry-run only. This command did not modify Notion.")
    return 1 if report.error_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
