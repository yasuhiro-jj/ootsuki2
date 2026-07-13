import unittest

from scripts.prod_chat_smoke import (
    DEFAULT_CASES,
    SmokeCase,
    SmokeRunner,
    TurnExpectation,
    count_sentences,
    evaluate_response,
    select_cases,
)


class FakeSmokeRunner(SmokeRunner):
    def __init__(self, responses):
        super().__init__("https://example.test")
        self.responses = list(responses)
        self.messages = []

    def create_session(self, customer_id=""):
        return "smoke-session"

    def chat(self, session_id, message, customer_id=""):
        self.messages.append((session_id, message, customer_id))
        return self.responses.pop(0)


class ProdChatSmokeTests(unittest.TestCase):
    def test_default_cases_include_core_conversations(self):
        case_ids = {case.case_id for case in DEFAULT_CASES}

        self.assertIn("recommendation_repeat", case_ids)
        self.assertIn("beer_order_followup", case_ids)
        self.assertIn("ambiguous_repeat_order", case_ids)
        self.assertIn("cancel_order", case_ids)
        self.assertIn("contextual_price", case_ids)
        self.assertIn("previous_price", case_ids)
        self.assertIn("accept_proposal", case_ids)
        self.assertIn("other_recommendation", case_ids)
        self.assertIn("what_available_contextual", case_ids)
        self.assertIn("business_hours", case_ids)
        self.assertIn("today_business", case_ids)
        self.assertIn("party_size_without_context", case_ids)
        self.assertIn("night_visit", case_ids)
        self.assertIn("reservation_start", case_ids)
        self.assertIn("reservation_correction", case_ids)
        self.assertIn("parking", case_ids)
        self.assertIn("payment", case_ids)
        self.assertIn("children", case_ids)
        self.assertIn("private_room", case_ids)
        self.assertIn("takeout", case_ids)

    def test_evaluate_response_accepts_expected_reply(self):
        failures = evaluate_response(
            "先ほどご案内した刺身定食がおすすめです。",
            TurnExpectation(
                contains_all=("先ほど", "刺身定食"),
                excludes=("LINE", "電話", "メニュー", "①"),
                max_sentences=3,
            ),
        )

        self.assertEqual(failures, [])

    def test_evaluate_response_rejects_long_menu_guidance(self):
        failures = evaluate_response(
            "刺身定食がおすすめです。LINEでどうぞ。電話もできます。メニューはこちらです。",
            TurnExpectation(
                contains_any=("刺身定食",),
                excludes=("LINE", "電話", "メニュー"),
                max_sentences=3,
            ),
        )

        self.assertTrue(any("forbidden" in failure for failure in failures))
        self.assertTrue(any("too many sentences" in failure for failure in failures))

    def test_count_sentences_handles_newlines(self):
        self.assertEqual(count_sentences("はい。\n日にちを教えてください。"), 2)

    def test_select_cases_filters_by_case_id(self):
        selected = select_cases(DEFAULT_CASES, ["business_hours"])

        self.assertEqual([case.case_id for case in selected], ["business_hours"])

    def test_runner_uses_same_session_for_case_turns(self):
        runner = FakeSmokeRunner(["はい、中生ビールありますよ。", "中生ビール1つですね。"])
        result = runner.run_case(
            SmokeCase(
                case_id="beer",
                messages=("生ビールある？", "じゃあ一つ"),
                expectations=(
                    TurnExpectation(contains_any=("生ビール",)),
                    TurnExpectation(contains_all=("1つ",)),
                ),
            )
        )

        self.assertTrue(result.passed)
        self.assertEqual(
            runner.messages,
            [
                ("smoke-session", "生ビールある？", ""),
                ("smoke-session", "じゃあ一つ", ""),
            ],
        )


if __name__ == "__main__":
    unittest.main()
