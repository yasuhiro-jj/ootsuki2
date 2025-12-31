"""
LINE問い合わせリンク付与および不明キーワード記録用のユーティリティ
"""

from typing import Dict, Any, Optional

from config import LINE_CONTACT_URL, LINE_CONTACT_MESSAGE


def append_line_contact_link(message: str) -> str:
    """
    メッセージ末尾にLINE問い合わせリンク案内を付与する

    Args:
        message: 元のメッセージ

    Returns:
        LINEリンク付きメッセージ
    """
    return message + LINE_CONTACT_MESSAGE.format(url=LINE_CONTACT_URL)


def log_unknown_keyword_to_notion(
    *,
    question: str,
    context: Dict[str, Any],
    response: str,
    notion_client: Any,
    config: Any,
    session_id: Optional[str] = None,
) -> None:
    """
    不明キーワードをNotionの不明キーワードDBに記録する

    Args:
        question: ユーザーの質問内容
        context: コンテキスト情報（直近メッセージや状態など）
        response: ユーザーに返した最終レスポンス（LINEリンク付き）
        notion_client: NotionClientインスタンス
        config: ConfigLoaderインスタンス
        session_id: セッションID（任意）
    """
    if not notion_client or not config:
        return

    unknown_db_id = config.get("notion.database_ids.unknown_keywords_db")
    if not unknown_db_id:
        return

    from datetime import datetime

    try:
        # コンテキストは簡易的に文字列化して保存
        context_str = str(context)
        
        # 念のため長さを制限（Notionの1フィールド上限対策）
        max_response_length = 1900
        safe_response = response[:max_response_length] if len(response) > max_response_length else response

        notion_client.create_page(
            database_id=unknown_db_id,
            properties={
                "質問内容": {"title": [{"text": {"content": question}}]},
                "日時": {"date": {"start": datetime.now().isoformat()}},
                "セッションID": {
                    "rich_text": [{"text": {"content": session_id or ""}}]
                },
                "コンテキスト": {
                    "rich_text": [{"text": {"content": context_str}}]
                },
                "回答": {
                    "rich_text": [{"text": {"content": safe_response}}]
                },
                "ステータス": {"select": {"name": "未対応"}},
            },
        )
    except Exception:
        # Notionへの書き込み失敗は致命的ではないため握りつぶす
        # 実際のエラーログは呼び出し元で処理する
        return




