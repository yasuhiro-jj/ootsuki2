"""Direct menu existence helpers for short questions like "中生ビールある？"."""

from typing import Any, List


def is_direct_menu_existence_question(message: str) -> bool:
    """Return True for short menu availability questions."""
    if not message:
        return False

    normalized = message.strip().lower()
    if any(word in normalized for word in ["つまみ", "おつまみ", "合う料理", "合うもの"]):
        return False

    menu_terms = [
        "ビール",
        "生ビール",
        "中生",
        "大生",
        "小生",
        "瓶ビール",
        "メガビール",
        "ノンアル",
        "日本酒",
        "焼酎",
        "ハイボール",
        "酎ハイ",
        "ワイン",
        "ソフトドリンク",
    ]
    existence_terms = [
        "ある",
        "あります",
        "ございます",
        "置いて",
        "飲める",
        "飲めます",
        "食べられる",
        "食べれます",
    ]

    return any(term in normalized for term in menu_terms) and any(
        term in normalized for term in existence_terms
    )


def format_direct_menu_existence_answer(items: List[Any]) -> str:
    """Format menu lookup results as a compact conversational answer."""
    if not items:
        return "すみません、そのメニューは今のメニューDBでは確認できませんでした。別名で登録されている可能性もあります。"

    first = items[0]
    name = getattr(first, "name", "") or "そのメニュー"
    price = getattr(first, "price", None)
    price_text = f"（{int(price):,}円）" if isinstance(price, (int, float)) and price > 0 else ""

    if len(items) == 1:
        return f"はい、{name}{price_text}ございます。"

    names = []
    for item in items[:5]:
        item_name = getattr(item, "name", "")
        item_price = getattr(item, "price", None)
        if item_name:
            suffix = f"（{int(item_price):,}円）" if isinstance(item_price, (int, float)) and item_price > 0 else ""
            names.append(f"{item_name}{suffix}")

    return "はい、ございます。該当しそうなメニューは " + "、".join(names) + " です。"
