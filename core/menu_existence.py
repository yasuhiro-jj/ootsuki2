"""Direct menu existence helpers for short questions like "中生ビールある？"."""

from typing import Any, List

SNACK_RECOMMENDATION_TERMS = [
    "つまみ",
    "おつまみ",
    "合う料理",
    "合うもの",
    "合うつまみ",
    "肴",
]

MENU_EXISTENCE_TERMS = [
    "ある",
    "あります",
    "ございます",
    "置いて",
    "置いてます",
    "置いてる",
    "飲める",
    "飲めます",
    "食べられる",
    "食べれます",
]

MENU_PRODUCT_TERMS = [
    "ビール",
    "生ビール",
    "中生",
    "大生",
    "小生",
    "瓶ビール",
    "メガビール",
    "ノンアル",
    "レモンサワー",
    "サワー",
    "酎ハイ",
    "チューハイ",
    "レモン酎ハイ",
    "日本酒",
    "焼酎",
    "ハイボール",
    "ワイン",
    "ソフトドリンク",
    "刺身",
    "お刺身",
    "刺身盛り合わせ",
    "刺身盛合",
    "刺身定食",
    "唐揚",
    "唐揚げ",
    "唐揚げ定食",
    "定食",
    "せんべろセット",
    "せんべろセットA",
]


def is_direct_menu_existence_question(message: str) -> bool:
    """Return True for short menu availability questions."""
    if not message:
        return False

    normalized = message.strip().lower()
    if any(word in normalized for word in SNACK_RECOMMENDATION_TERMS):
        return False

    return any(term in normalized for term in MENU_PRODUCT_TERMS) and any(
        term in normalized for term in MENU_EXISTENCE_TERMS
    )


def format_direct_menu_existence_answer(items: List[Any]) -> str:
    """Format menu lookup results as a compact conversational answer."""
    if not items:
        return "すみません、そのメニューは今のメニューDBでは確認できませんでした。別名で登録されている可能性もあります。"

    first = items[0]
    name = getattr(first, "name", "") or "そのメニュー"
    price = getattr(first, "price", None)
    price_text = f"（{int(price):,}円）" if isinstance(price, (int, float)) and price > 0 else ""
    match_rank = int(getattr(first, "match_rank", 1) or 1)
    requested_name = str(getattr(first, "requested_name", "") or "").strip()

    if match_rank <= 3 and len(items) == 1:
        return f"はい、{name}{price_text}ありますよ。"

    if match_rank <= 3 and name:
        return f"はい、{name}{price_text}ありますよ。"

    names = []
    for item in items[:3]:
        item_name = getattr(item, "name", "")
        item_price = getattr(item, "price", None)
        if item_name:
            suffix = f"（{int(item_price):,}円）" if isinstance(item_price, (int, float)) and item_price > 0 else ""
            names.append(f"{item_name}{suffix}")

    if names:
        if requested_name:
            return f"{requested_name}という商品は確認できませんでした。関連する商品では、" + "、".join(names) + "があります。"
        return "完全一致する商品は確認できませんでした。関連する商品では、" + "、".join(names) + "があります。"

    return "はい、ございます。" + "、".join(names) + " があります。"
