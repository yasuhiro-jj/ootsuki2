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
ADMIN_API_KEY_ENV = "ADMIN_API_KEY"
ADMIN_API_KEY_HEADER = "X-Admin-API-Key"
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
        case_id="ambiguous_repeat_order",
        messages=("生ビールある？", "じゃあ一つ", "もう一つ"),
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
            TurnExpectation(
                contains_all=("もう1つ",),
                contains_any=("生ビール", "中生ビール"),
                excludes=("つまみ", "おすすめ", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="cancel_order",
        messages=("生ビールある？", "じゃあ一つ", "やっぱりやめる"),
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
            TurnExpectation(
                contains_all=("取り消",),
                contains_any=("生ビール", "中生ビール"),
                excludes=("つまみ", "おすすめ", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="contextual_price",
        messages=("生ビールある？", "いくら？"),
        expectations=(
            TurnExpectation(
                contains_any=("生ビール", "中生ビール"),
                excludes=("つまみ", "おすすめ", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_all=("円",),
                contains_any=("生ビール", "中生ビール"),
                excludes=("つまみ", "おすすめ", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="previous_price",
        messages=("おすすめを教えて", "さっきのいくら？"),
        expectations=(
            TurnExpectation(
                contains_any=("刺身定食",),
                excludes=("LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_all=("円",),
                contains_any=("刺身定食",),
                excludes=("LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="accept_proposal",
        messages=("おすすめを教えて", "それでお願いします"),
        expectations=(
            TurnExpectation(
                contains_any=("刺身定食",),
                excludes=("LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_any=("刺身定食", "承り"),
                excludes=("LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="other_recommendation",
        messages=("おすすめを教えて", "他には？"),
        expectations=(
            TurnExpectation(
                contains_any=("刺身定食",),
                excludes=("LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_any=("唐揚げ定食",),
                excludes=("LINE", "電話", "メニュー", "①", "②", "③"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="what_available_contextual",
        messages=("おすすめを教えて", "何がある？"),
        expectations=(
            TurnExpectation(
                contains_any=("刺身定食",),
                excludes=("LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_any=("定食", "一品", "弁当"),
                excludes=("LINE", "電話", "①", "②", "③"),
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
        case_id="today_business",
        messages=("今日やってる？",),
        expectations=(
            TurnExpectation(
                contains_any=("11時", "17時", "営業"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="party_size_without_context",
        messages=("4人なんだけど",),
        expectations=(
            TurnExpectation(
                contains_any=("予約", "日にち", "時間"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="night_visit",
        messages=("夜行きたい",),
        expectations=(
            TurnExpectation(
                contains_any=("夜", "日にち", "人数"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
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
        case_id="reservation_correction",
        messages=("4人なんだけど", "予約じゃなくて質問です"),
        expectations=(
            TurnExpectation(
                contains_any=("予約", "日にち", "時間"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
            TurnExpectation(
                contains_any=("予約", "質問"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="parking",
        messages=("駐車場ありますか？",),
        expectations=(
            TurnExpectation(
                contains_any=("駐車", "停め"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="payment",
        messages=("支払い方法は？",),
        expectations=(
            TurnExpectation(
                contains_any=("支払い", "現金", "決済"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="children",
        messages=("子連れでも大丈夫？",),
        expectations=(
            TurnExpectation(
                contains_any=("子", "お子様", "利用"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="private_room",
        messages=("個室ありますか？",),
        expectations=(
            TurnExpectation(
                contains_any=("個室", "席"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        ),
    ),
    SmokeCase(
        case_id="takeout",
        messages=("テイクアウトできますか？",),
        expectations=(
            TurnExpectation(
                contains_any=("テイクアウト", "持ち帰り", "弁当"),
                excludes=("おすすめ", "刺身定食", "LINE", "電話"),
                max_sentences=3,
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
        "--customer-memory",
        action="store_true",
        help="Run customer memory smoke checks after chat smoke cases.",
    )
    parser.add_argument(
        "--with-customer-id",
        action="store_true",
        help="Attach one anonymous customer id to all regular smoke cases.",
    )
    parser.add_argument(
        "--admin-api-key",
        default=os.getenv(ADMIN_API_KEY_ENV, ""),
        help=f"Admin API key for customer memory checks. Defaults to ${ADMIN_API_KEY_ENV}.",
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
    smoke_customer_id = runner.identify_customer() if args.with_customer_id else ""

    try:
        for case in selected_cases:
            results.append(runner.run_case(case, customer_id=smoke_customer_id))
    except urllib.error.URLError as exc:
        print(f"ERROR: request failed: {exc.reason}", file=sys.stderr)
        return 1

    print_report(results)
    customer_memory_result: Optional[Dict[str, Any]] = None
    if args.customer_memory:
        customer_memory_result = runner.run_customer_memory_check(args.admin_api_key)
        print_customer_memory_report(customer_memory_result)
    if args.json_out:
        write_json_report(
            args.json_out,
            args.api_url,
            started_at,
            results,
            customer_memory_result=customer_memory_result,
        )
    all_passed = all(result.passed for result in results)
    if customer_memory_result is not None:
        all_passed = all_passed and bool(customer_memory_result.get("passed"))
    return 0 if all_passed else 1


class SmokeRunner:
    def __init__(self, api_url: str, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.api_url = api_url
        self.timeout = timeout

    def run_case(self, case: SmokeCase, customer_id: str = "") -> CaseResult:
        session_id = self.create_session(customer_id=customer_id)
        turns: List[TurnResult] = []
        for index, message in enumerate(case.messages):
            started = time.perf_counter()
            response = self.chat(session_id, message, customer_id=customer_id)
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

    def identify_customer(self, customer_id: str = "") -> str:
        response = self._request(
            "POST",
            "/customer-memory/identify",
            {"anonymous_customer_id": customer_id or None},
        )
        anonymous_customer_id = str(response.get("anonymous_customer_id") or "").strip()
        if not anonymous_customer_id:
            raise RuntimeError("/customer-memory/identify did not return anonymous_customer_id")
        return anonymous_customer_id

    def create_session(self, customer_id: str = "") -> str:
        payload: Dict[str, Any] = {}
        if customer_id:
            payload["customer_id"] = customer_id
        response = self._request("POST", "/session", payload)
        session_id = str(response.get("session_id") or "").strip()
        if not session_id:
            raise RuntimeError("/session did not return session_id")
        return session_id

    def chat(self, session_id: str, message: str, customer_id: str = "") -> str:
        payload: Dict[str, Any] = {
            "session_id": session_id,
            "message": message,
        }
        if customer_id:
            payload["customer_id"] = customer_id
        response = self._request(
            "POST",
            "/chat",
            payload,
        )
        return str(response.get("message") or "")

    def get_customer_memory(self, customer_id: str, admin_api_key: str) -> Dict[str, Any]:
        return self._request(
            "GET",
            f"/admin/customer-memory/{customer_id}",
            {},
            headers={ADMIN_API_KEY_HEADER: admin_api_key},
        )

    def run_customer_memory_check(self, admin_api_key: str) -> Dict[str, Any]:
        if not admin_api_key:
            return {"passed": False, "skipped": True, "reason": "missing_admin_api_key"}
        customer_id = self.identify_customer()
        order_case = SmokeCase(
            case_id="customer_order_memory",
            messages=("生ビールある？", "じゃあ一つ"),
        )
        recommendation_case = SmokeCase(
            case_id="customer_recommendation_memory",
            messages=("おすすめを教えて",),
        )
        cancel_case = SmokeCase(
            case_id="customer_order_cancel_memory",
            messages=("生ビールある？", "じゃあ一つ", "やっぱりやめる"),
        )
        cases = [
            self.run_case(order_case, customer_id=customer_id),
            self.run_case(recommendation_case, customer_id=customer_id),
            self.run_case(cancel_case, customer_id=customer_id),
        ]
        memory = self.get_customer_memory(customer_id, admin_api_key)
        last_ordered = memory.get("last_ordered_items") or []
        last_recommended = memory.get("last_recommended_items") or []
        avoided = memory.get("avoided_items") or []
        failures = []
        if not memory.get("linked_session_count"):
            failures.append("linked_session_count is empty")
        if not any("生ビール" in str(item) for item in last_ordered):
            failures.append("last_ordered_items does not include beer")
        if not any("刺身定食" in str(item) for item in last_recommended):
            failures.append("last_recommended_items does not include sashimi set")
        if any("生ビール" in str(item) for item in avoided):
            failures.append("cancelled beer was added to avoided_items")
        return {
            "passed": not failures and all(case.passed for case in cases),
            "skipped": False,
            "anonymous_customer_id": customer_id,
            "failures": failures,
            "linked_session_count": memory.get("linked_session_count"),
            "last_ordered_items": last_ordered,
            "last_recommended_items": last_recommended,
            "avoided_items": avoided,
            "cases": [case.case_id for case in cases],
        }

    def _request(
        self,
        method: str,
        path: str,
        payload: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers = {"Content-Type": "application/json; charset=utf-8"}
        request_headers.update(headers or {})
        request = urllib.request.Request(
            f"{self.api_url}{path}",
            data=(body if method != "GET" else None),
            headers=request_headers,
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


def print_customer_memory_report(result: Dict[str, Any]) -> None:
    print("")
    print("customer_memory | result | details")
    print("--- | --- | ---")
    if result.get("skipped"):
        print(f"customer_memory | SKIP | {result.get('reason')}")
        return
    status = "OK" if result.get("passed") else "NG"
    details = {
        "anonymous_customer_id": result.get("anonymous_customer_id"),
        "linked_session_count": result.get("linked_session_count"),
        "last_ordered_items": result.get("last_ordered_items"),
        "last_recommended_items": result.get("last_recommended_items"),
        "failures": result.get("failures"),
    }
    print(f"customer_memory | {status} | {json.dumps(details, ensure_ascii=False)}")


def compact_cell(value: str) -> str:
    return " ".join(str(value).replace("|", "/").split())


def configure_output_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def write_json_report(
    path: str,
    api_url: str,
    started_at: str,
    results: Sequence[CaseResult],
    *,
    customer_memory_result: Optional[Dict[str, Any]] = None,
) -> None:
    payload = {
        "api_url": api_url,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "passed": all(result.passed for result in results)
        and (
            customer_memory_result is None
            or bool(customer_memory_result.get("passed"))
        ),
        "customer_memory": customer_memory_result,
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
