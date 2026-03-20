"""
メニュー画像URLの形式チェックと到達性検証（直接画像URLのみ許可）。
"""

from __future__ import annotations

import re
from typing import Tuple
from urllib.parse import urlparse

import httpx

# 閲覧ページ・共有ページとして不適切なホスト（画像直リンクではない）
_BLOCKED_HOST_FRAGMENTS = (
    "drive.google.com",
    "docs.google.com",
    "photos.google.com",
    "dropbox.com",
    "www.dropbox.com",
    "onedrive.live.com",
    "sharepoint.com",
)

# パス上でよくある画像拡張子
_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg")


def _host_blocked(url: str) -> bool:
    try:
        host = (urlparse(url).netloc or "").lower()
    except Exception:
        return True
    return any(b in host for b in _BLOCKED_HOST_FRAGMENTS)


def is_direct_image_url_candidate(url: str) -> Tuple[bool, str]:
    """
    直接画像URLとして許容する候補か（到達性は別途 validate）。
    - https のみ
    - Google Drive 等の閲覧用ホストは不可
    - パスが画像拡張子で終わる、または wp-content/uploads 等の一般的な静的パス
    """
    if not url or not str(url).strip():
        return False, "empty"
    u = str(url).strip()
    if not u.startswith("https://"):
        return False, "not_https"
    if _host_blocked(u):
        return False, "blocked_host"
    try:
        path = (urlparse(u).path or "").lower()
    except Exception:
        return False, "parse_error"
    if any(path.endswith(ext) for ext in _IMAGE_EXT):
        return True, "ok"
    # 拡張子なしでも WordPress 等の uploads パスは HEAD で image/* を確認する
    if "/wp-content/" in path or "/uploads/" in path:
        return True, "ok_static_path"
    return False, "not_direct_image_url"


def validate_image_url_reachable(url: str, timeout: float = 5.0) -> Tuple[bool, str]:
    """
    HEAD で image/* なら成功。それ以外は Range GET で image/* を確認。
    """
    headers = {
        "User-Agent": "ootsuki2-menu-image-check/1.0",
        "Accept": "image/*,*/*;q=0.8",
    }
    try:
        with httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            limits=httpx.Limits(max_redirects=5),
        ) as client:
            r = client.head(url, headers=headers)
            if 200 <= r.status_code < 300:
                ct = (r.headers.get("content-type") or "").lower()
                if ct.startswith("image/"):
                    return True, "ok_head"

            r2 = client.get(
                url,
                headers={**headers, "Range": "bytes=0-8191"},
            )
            if r2.status_code not in (200, 206):
                return False, f"http_{r2.status_code}"
            ct2 = (r2.headers.get("content-type") or "").lower()
            if not ct2.startswith("image/"):
                return False, f"bad_content_type:{ct2 or 'none'}"
            return True, "ok_get"

    except httpx.TimeoutException:
        return False, "timeout"
    except httpx.RequestError as e:
        return False, f"request_error:{e!s}"


def html_to_plain_for_line(text: str) -> str:
    """LINE 用に HTML タグを除いたプレーンテキスト。"""
    if not text:
        return ""
    t = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&")
    return t.strip()
