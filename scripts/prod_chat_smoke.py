"""Run production smoke checks against the Ootsuki chatbot API."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

API_URL_ENV = "OOTSUKI_API_URL"
DEFAULT_API_URL = "https://web-production-b22a1.up.railway.app"
DEFAULT_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class TurnExpectation:
    contains_any: Sequence[str] = ()
    contains_all: Sequence[str] = ()
    excludes: Sequence[str] = ()
    max_sentences: Optional[int] = None


@dataclass(frozen=True)
class SmokeCase:
    case_id: str
    messages: Sequence[str]
    expectations: Sequence[TurnExpectation] = field(default_factory=tuple)


@dataclass
class TurnResult:
    message: str
    response: str
    passed: bool
    failures: List[str]
    latency_ms: int


@dataclass
class CaseResult:
    case_id: str
    session_id: str
    passed: bool
    turns: List[TurnResult]


DEFAULT_CASES: Sequence[SmokeCase] = (
    SmokeCase(
        case_id="recommendation_repeat",
        messages=("おすすめを教えて", "おすすめを教えて"),
        expectations=(
            TurnExpectation(
                contains_any=("刺身定食",),
                excludes=("LINE", "電話", "メニュー", "①", "②", "③"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_all=("先ほど", "刺身定食"),
                excludes=("LINE", "電話", "メニュー", "①", "②", "③"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="beer_order_followup",
        messages=("生ビールある？", "じゃあ一つ"),
        expectations=(
            TurnExpectation(
                contains_any=("生ビール", "中生ビール"),
                excludes=("つまみ", "おすすめ", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_all=("1つ",),
                contains_any=("生ビール", "中生ビール"),
                excludes=("つまみ", "おすすめ", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="business_hours",
        messages=("営業時間は？",),
        expectations=(
            TurnExpectation(
                contains_all=("11時", "14時", "17時", "21時"),
                contains_any=("火曜日", "定休日"),
                excludes=("おすすめ", "LINE", "電話", "メニュー"),
                max_sentences=4,
            ),
        ),
    ),
    SmokeCase(
        case_id="reservation_start",
        messages=("予約できますか？", "20人です", "明日の夜です"),
        expectations=(
            TurnExpectation(
                contains_all=("予約", "日にち", "時間", "人数"),
                excludes=("LINE", "電話", "メニュー", "刺身", "おすすめ"),
                max_sentences=3,
            ),
            TurnExpectation(
                excludes=("LINE", "電話", "メニュー", "おすすめ"),
                max_sentences=5,
            ),
            TurnExpectation(
                excludes=("メニュー", "おすすめ"),
                max_sentences=5,
            ),
        ),
    ),
    SmokeCase(
        case_id="parking",
        messages=("駐車場ありますか？",),
        expectations=(
            TurnExpectation(
                contains_any=("駐車", "停め"),
                excludes=("おすすめ", "刺身定食"),
                max_sentences=5,
            ),
        ),
    ),
    SmokeCase(
        case_id="snack_recommendation",
        messages=("ビールに合うつまみは？",),
        expectations=(
            TurnExpectation(
                excludes=("LINE", "電話", "メニュー", "①", "②", "③", "以下から"),
                max_sentences=4,
            ),
        ),
    ),
)


def main() -> int:
    configure_output_encoding()
    parser = argparse.ArgumentParser(
        description="Run production smoke checks against the Ootsuki chatbot."
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv(API_URL_ENV, DEFAULT_API_URL),
        help=f"Base API URL. Defaults to ${API_URL_ENV} or {DEFAULT_API_URL}.",
    )
    parser.add_argument(
        "--case",
        action="append",
        dest="case_ids",
        help="Run only the selected case_id. Can be passed multiple times.",
    )
    parser.add_argument(
        "--json-out",
        help="Optional path for a JSON result report.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"HTTP timeout seconds. Defaults to {DEFAULT_TIMEOUT_SECONDS}.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List smoke case IDs and exit.",
    )
    args = parser.parse_args()

    if args.list:
        for case in DEFAULT_CASES:
            print(case.case_id)
        return 0

    selected_cases = select_cases(DEFAULT_CASES, args.case_ids)
    if not selected_cases:
        print("ERROR: no smoke cases selected.", file=sys.stderr)
        return 2

    runner = SmokeRunner(str(args.api_url).rstrip("/"), timeout=args.timeout)
    started_at = datetime.now(timezone.utc).isoformat()
    results: List[CaseResult] = []

    try:
        for case in selected_cases:
            results.append(runner.run_case(case))
    except urllib.error.URLError as exc:
        print(f"ERROR: request failed: {exc.reason}", file=sys.stderr)
        return 1

    print_report(results)
    if args.json_out:
        write_json_report(args.json_out, args.api_url, started_at, results)
    return 0 if all(result.passed for result in results) else 1


class SmokeRunner:
    def __init__(self, api_url: str, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.api_url = api_url
        self.timeout = timeout

    def run_case(self, case: SmokeCase) -> CaseResult:
        session_id = self.create_session()
        turns: List[TurnResult] = []
        for index, message in enumerate(case.messages):
            started = time.perf_counter()
            response = self.chat(session_id, message)
            latency_ms = int((time.perf_counter() - started) * 1000)
            expectation = (
                case.expectations[index]
                if index < len(case.expectations)
                else TurnExpectation()
            )
            failures = evaluate_response(response, expectation)
            turns.append(
                TurnResult(
                    message=message,
                    response=response,
                    passed=not failures,
                    failures=failures,
                    latency_ms=latency_ms,
                )
            )
        return CaseResult(
            case_id=case.case_id,
            session_id=session_id,
            passed=all(turn.passed for turn in turns),
            turns=turns,
        )

    def create_session(self) -> str:
        response = self._request("POST", "/session", {})
        session_id = str(response.get("session_id") or "").strip()
        if not session_id:
            raise RuntimeError("/session did not return session_id")
        return session_id

    def chat(self, session_id: str, message: str) -> str:
        response = self._request(
            "POST",
            "/chat",
            {
                "session_id": session_id,
                "message": message,
            },
        )
        return str(response.get("message") or "")

    def _request(self, method: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{self.api_url}{path}",
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method=method,
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            response_body = response.read().decode("utf-8")
        if not response_body:
            return {}
        return json.loads(response_body)


def select_cases(
    cases: Sequence[SmokeCase], selected_case_ids: Optional[Sequence[str]]
) -> List[SmokeCase]:
    if not selected_case_ids:
        return list(cases)
    selected = set(selected_case_ids)
    known = {case.case_id for case in cases}
    unknown = sorted(selected - known)
    if unknown:
        raise SystemExit(f"unknown smoke case_id: {', '.join(unknown)}")
    return [case for case in cases if case.case_id in selected]


def evaluate_response(response: str, expectation: TurnExpectation) -> List[str]:
    failures: List[str] = []
    if expectation.contains_any and not any(
        token in response for token in expectation.contains_any
    ):
        failures.append(f"missing any of: {', '.join(expectation.contains_any)}")
    for token in expectation.contains_all:
        if token not in response:
            failures.append(f"missing required token: {token}")
    for token in expectation.excludes:
        if token in response:
            failures.append(f"contains forbidden token: {token}")
    if expectation.max_sentences is not None:
        sentence_count = count_sentences(response)
        if sentence_count > expectation.max_sentences:
            failures.append(
                f"too many sentences: {sentence_count}>{expectation.max_sentences}"
            )
    return failures


def count_sentences(text: str) -> int:
    normalized = text.replace("\n", "。").replace("！", "。").replace("？", "。")
    return len([part for part in normalized.split("。") if part.strip()])


def print_report(results: Sequence[CaseResult]) -> None:
    print("case_id | turn | result | latency_ms | message | response")
    print("--- | ---: | --- | ---: | --- | ---")
    for result in results:
        for index, turn in enumerate(result.turns, start=1):
            status = "OK" if turn.passed else "NG"
            response = compact_cell(turn.response)
            print(
                f"{result.case_id} | {index} | {status} | {turn.latency_ms} | "
                f"{compact_cell(turn.message)} | {response}"
            )
            for failure in turn.failures:
                print(f"{result.case_id} | {index} | FAIL |  | {failure} | ")


def compact_cell(value: str) -> str:
    return " ".join(str(value).replace("|", "/").split())


def configure_output_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def write_json_report(
    path: str, api_url: str, started_at: str, results: Sequence[CaseResult]
) -> None:
    payload = {
        "api_url": api_url,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "passed": all(result.passed for result in results),
        "cases": [
            {
                "case_id": result.case_id,
                "session_id": result.session_id,
                "passed": result.passed,
                "turns": [
                    {
                        "message": turn.message,
                        "response": turn.response,
                        "passed": turn.passed,
                        "failures": turn.failures,
                        "latency_ms": turn.latency_ms,
                    }
                    for turn in result.turns
                ],
            }
            for result in results
        ],
    }
    report_path = Path(path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
