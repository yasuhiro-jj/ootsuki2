"""
おおつき飲食店 Notionデータベーススキーマ

Notionデータベースの構造定義
"""

from typing import Dict, Any

# メニューデータベースのスキーマ
MENU_DATABASE_SCHEMA = {
    "メニュー名": {
        "type": "title",
        "description": "料理名"
    },
    "カテゴリ": {
        "type": "select",
        "description": "テイクアウト/宴会/ランチ/ディナー",
        "options": ["テイクアウト", "宴会", "ランチ", "ディナー"]
    },
    "価格": {
        "type": "number",
        "description": "料理の価格（円）"
    },
    "説明": {
        "type": "rich_text",
        "description": "料理の詳細説明"
    },
    "アレルギー情報": {
        "type": "multi_select",
        "description": "アレルギー物質",
        "options": ["小麦", "卵", "乳", "そば", "エビ", "カニ"]
    },
    "画像URL": {
        "type": "url",
        "description": "料理写真のURL"
    },
    "人気度": {
        "type": "number",
        "description": "人気度（0-100）"
    },
    "季節限定": {
        "type": "checkbox",
        "description": "季節限定メニューかどうか"
    },
    "ベジタリアン対応": {
        "type": "checkbox",
        "description": "ベジタリアン対応かどうか"
    }
}

# 店舗情報データベースのスキーマ
STORE_DATABASE_SCHEMA = {
    "項目名": {
        "type": "title",
        "description": "情報の項目名"
    },
    "内容": {
        "type": "rich_text",
        "description": "情報の内容"
    },
    "カテゴリ": {
        "type": "select",
        "description": "情報のカテゴリ",
        "options": ["営業時間", "定休日", "アクセス", "特徴", "予約方法", "駐車場"]
    }
}

# 会話履歴データベースのスキーマ
CONVERSATION_DATABASE_SCHEMA = {
    "顧客ID": {
        "type": "title",
        "description": "匿名の顧客ID"
    },
    "質問内容": {
        "type": "rich_text",
        "description": "お客様の質問"
    },
    "回答内容": {
        "type": "rich_text",
        "description": "AIの回答"
    },
    "満足度": {
        "type": "number",
        "description": "満足度（1-5）"
    },
    "タイムスタンプ": {
        "type": "date",
        "description": "会話の日時"
    },
    "メニュー参照": {
        "type": "relation",
        "description": "関連するメニュー"
    }
}


def format_menu_for_rag(menu_data: Dict[str, Any]) -> str:
    """
    メニューデータをRAG用のテキストに整形
    
    Args:
        menu_data: Notionから取得したメニューデータ
    
    Returns:
        整形されたテキスト
    """
    parts = []
    
    # メニュー名
    if "メニュー名" in menu_data:
        parts.append(f"【{menu_data['メニュー名']}】")
    
    # カテゴリ
    if "カテゴリ" in menu_data:
        parts.append(f"カテゴリ: {menu_data['カテゴリ']}")
    
    # 価格
    if "価格" in menu_data:
        parts.append(f"価格: {menu_data['価格']:,}円")
    
    # 説明
    if "説明" in menu_data:
        parts.append(f"説明: {menu_data['説明']}")
    
    # アレルギー情報
    if "アレルギー情報" in menu_data and menu_data["アレルギー情報"]:
        allergens = ", ".join(menu_data["アレルギー情報"])
        parts.append(f"アレルギー: {allergens}")
    
    # 季節限定
    if menu_data.get("季節限定"):
        parts.append("※季節限定メニュー")
    
    # ベジタリアン対応
    if menu_data.get("ベジタリアン対応"):
        parts.append("※ベジタリアン対応")
    
    return "\n".join(parts)


def format_store_info_for_rag(store_data: Dict[str, Any]) -> str:
    """
    店舗情報をRAG用のテキストに整形
    
    Args:
        store_data: Notionから取得した店舗情報
    
    Returns:
        整形されたテキスト
    """
    parts = []
    
    # 項目名
    if "項目名" in store_data:
        parts.append(f"【{store_data['項目名']}】")
    
    # カテゴリ
    if "カテゴリ" in store_data:
        parts.append(f"種類: {store_data['カテゴリ']}")
    
    # 内容
    if "内容" in store_data:
        parts.append(store_data["内容"])
    
    return "\n".join(parts)

