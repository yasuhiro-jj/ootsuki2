"""
Intent classification helpers for the ootsuki2 chatbot.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class IntentType(Enum):
    QUESTION = "question"
    PROPOSAL = "proposal"
    COMPARISON = "comparison"
    TROUBLE = "trouble"
    SMALLTALK = "smalltalk"
    UNKNOWN = "unknown"


@dataclass
class IntentResult:
    intent: IntentType
    confidence: float
    reason: str
    topic: str
    user_type: str


class IntentClassifier:
    """Rule-based classifier to keep intent handling explicit and stable."""

    _PROPOSAL_PATTERNS = (
        "おすすめ",
        "提案",
        "どうしたら",
        "どれがいい",
        "選んで",
        "考えて",
        "プラン",
        "向いてる",
    )
    _COMPARISON_PATTERNS = (
        "比較",
        "違い",
        "どっち",
        "どちら",
        "better",
        "vs",
    )
    _TROUBLE_PATTERNS = (
        "困",
        "トラブル",
        "うまくいか",
        "できない",
        "エラー",
        "不具合",
        "心配",
        "不安",
        "教えてほしい",
        "わからない",
    )
    _SMALLTALK_PATTERNS = (
        "こんにちは",
        "こんばんは",
        "おはよう",
        "ありがとう",
        "雑談",
        "元気",
        "お疲れ",
    )
    _QUESTION_PATTERNS = (
        "?",
        "？",
        "何",
        "いつ",
        "どこ",
        "なぜ",
        "どう",
        "ありますか",
        "できますか",
        "ですか",
        "ますか",
    )

    def classify(self, user_input: str) -> IntentResult:
        text = (user_input or "").strip()
        normalized = text.lower()

        if not text:
            return IntentResult(
                intent=IntentType.UNKNOWN,
                confidence=0.0,
                reason="empty_input",
                topic="general",
                user_type="unknown",
            )

        topic = self.extract_topic(text)
        user_type = self._detect_user_type(text)

        if self._contains_any(normalized, self._TROUBLE_PATTERNS):
            return IntentResult(IntentType.TROUBLE, 0.85, "trouble_pattern", topic, user_type)
        if self._contains_any(normalized, self._COMPARISON_PATTERNS):
            return IntentResult(IntentType.COMPARISON, 0.9, "comparison_pattern", topic, user_type)
        if self._contains_any(normalized, self._PROPOSAL_PATTERNS):
            return IntentResult(IntentType.PROPOSAL, 0.88, "proposal_pattern", topic, user_type)
        if self._contains_any(normalized, self._SMALLTALK_PATTERNS):
            return IntentResult(IntentType.SMALLTALK, 0.82, "smalltalk_pattern", topic, user_type)
        if self._contains_any(text, self._QUESTION_PATTERNS):
            return IntentResult(IntentType.QUESTION, 0.75, "question_pattern", topic, user_type)

        return IntentResult(IntentType.UNKNOWN, 0.35, "fallback_unknown", topic, user_type)

    def extract_topic(self, user_input: str) -> str:
        text = (user_input or "").strip()
        if not text:
            return "general"

        keywords = re.findall(r"[A-Za-z0-9ぁ-んァ-ヶ一-龠ー]{2,}", text)
        if not keywords:
            return "general"

        stop_words = {
            "です", "ます", "する", "したい", "について", "これ", "それ", "どれ",
            "どう", "何", "ある", "いる", "こと", "教えて", "ください",
        }
        filtered = [word for word in keywords if word not in stop_words]
        return (filtered[0] if filtered else keywords[0])[:50]

    def _detect_user_type(self, user_input: str) -> str:
        if any(token in user_input for token in ("初めて", "はじめて", "初回", "初訪問")):
            return "new_user"
        if any(token in user_input for token in ("いつも", "前にも", "前回", "常連")):
            return "repeat_user"
        return "general"

    @staticmethod
    def _contains_any(text: str, patterns: tuple[str, ...]) -> bool:
        return any(pattern in text for pattern in patterns)
