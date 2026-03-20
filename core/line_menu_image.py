"""
LINE Messaging API 向けの画像メッセージペイロードを組み立てる。

Messaging API の reply/push でそのまま messages に渡せる dict のリストを返す。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def line_image_message(original_url: str, preview_url: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "image",
        "originalContentUrl": original_url,
        "previewImageUrl": preview_url or original_url,
    }


def line_text_message(text: str) -> Dict[str, Any]:
    return {"type": "text", "text": text[:5000]}


def build_line_reply_messages(
    text_plain: str,
    image_url: Optional[str],
) -> Optional[List[Dict[str, Any]]]:
    """
    テキスト + 画像の messages 配列。image_url が無ければ None。
    """
    if not image_url:
        return None
    out: List[Dict[str, Any]] = []
    if text_plain:
        out.append(line_text_message(text_plain))
    out.append(line_image_message(image_url))
    return out
