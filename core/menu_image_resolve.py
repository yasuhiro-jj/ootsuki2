"""
ユーザー発話に紐づくメニュー先頭1件の画像URLを解決し、到達性まで検証する。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional, Tuple

from .line_menu_image import build_line_reply_messages
from .menu_image_url import (
    html_to_plain_for_line,
    is_direct_image_url_candidate,
    validate_image_url_reachable,
)

if TYPE_CHECKING:
    from .menu_service import MenuService


def resolve_menu_image_for_chat(
    menu_service: Optional["MenuService"],
    user_message: str,
) -> Tuple[Optional[str], str]:
    """
    Returns:
        (image_url or None, log_line)
    """
    if not menu_service or not getattr(menu_service, "menu_db_id", None):
        return None, "[MenuImage] skip: no_menu_db"

    if not (user_message or "").strip():
        return None, "[MenuImage] skip: empty_user_message"

    items = menu_service.search_menu_items_by_query(user_message.strip(), limit=5)
    if not items:
        return None, "[MenuImage] skip: no_menu_match"

    first = items[0]
    mid = first.page_id or "unknown"
    mname = first.name or "unknown"
    raw = (first.image_url or "").strip() if first.image_url else ""

    if not raw:
        line = (
            f"[MenuImage] menu_id={mid} name={mname!r} resolved_url=- "
            f"result=FALLBACK:no_url_in_db"
        )
        return None, line

    ok_shape, shape_reason = is_direct_image_url_candidate(raw)
    if not ok_shape:
        line = (
            f"[MenuImage] menu_id={mid} name={mname!r} resolved_url={raw!r} "
            f"result=FALLBACK:bad_url_shape:{shape_reason}"
        )
        return None, line

    ok_net, net_reason = validate_image_url_reachable(raw)
    if not ok_net:
        line = (
            f"[MenuImage] menu_id={mid} name={mname!r} resolved_url={raw!r} "
            f"result=FALLBACK:unreachable:{net_reason}"
        )
        return None, line

    line = (
        f"[MenuImage] menu_id={mid} name={mname!r} resolved_url={raw!r} "
        f"result=SUCCESS:{net_reason}"
    )
    return raw, line


def attach_line_messages_if_image(
    final_message_html: str,
    image_url: Optional[str],
) -> Optional[List[dict]]:
    """フッター付き最終HTMLから LINE 用 messages を生成（画像があるときのみ）。"""
    if not image_url:
        return None
    plain = html_to_plain_for_line(final_message_html)
    return build_line_reply_messages(plain, image_url)
