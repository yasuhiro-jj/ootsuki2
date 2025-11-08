"""
クロスセル機能 - サンプルコード

明日の実装用に、主要なコードをここにまとめています。
コピー＆ペーストで使用してください。
"""

# =========================================
# 1. notion_client.py に追加するメソッド
# =========================================

def get_cross_sell_recommendations(
    self,
    page_id: str,
    limit: int = 3
) -> List[Dict[str, Any]]:
    """
    クロスセル推薦メニューを取得
    
    Args:
        page_id: メニューページのID（NotionのページID）
        limit: 取得する推薦数（デフォルト: 3）
    
    Returns:
        推薦メニューのリスト
        [
            {
                "id": "notion_page_id",
                "name": "唐揚げ",
                "price": 680,
                "short_desc": "サクサクで美味しい",
                "suggest_message": "お酒と一緒にどうぞ",
                "priority": 5
            },
            ...
        ]
    """
    try:
        if not self.client:
            logger.warning("[CrossSell] Notionクライアント未初期化")
            return []
        
        # ページ情報を取得
        page = self.client.pages.retrieve(page_id)
        properties = page.get("properties", {})
        
        # 「一緒におすすめ」Relationを取得
        recommendations = []
        if "一緒におすすめ" in properties:
            relation_array = properties["一緒におすすめ"].get("relation", [])
            
            logger.info(f"[CrossSell] {len(relation_array)}件の関連を検出")
            
            for rel in relation_array[:limit]:
                rel_id = rel.get("id")
                if rel_id:
                    try:
                        # 関連メニューの詳細を取得
                        rel_page = self.client.pages.retrieve(rel_id)
                        rel_props = rel_page.get("properties", {})
                        
                        recommendation = {
                            "id": rel_id,
                            "name": self._extract_property_value(rel_page, "Name"),
                            "price": self._extract_property_value(rel_page, "Price", 0),
                            "short_desc": self._extract_property_value(rel_page, "一言紹介"),
                            "suggest_message": self._extract_property_value(rel_page, "提案メッセージ"),
                            "priority": self._extract_property_value(rel_page, "おすすめ優先度", 0)
                        }
                        recommendations.append(recommendation)
                        logger.info(f"[CrossSell] 推薦取得: {recommendation['name']}")
                    
                    except Exception as e:
                        logger.error(f"[CrossSell] 関連ページ取得エラー: {e}")
                        continue
        else:
            logger.info("[CrossSell] 「一緒におすすめ」プロパティなし")
        
        # 優先度でソート（高い順）
        recommendations.sort(key=lambda x: x.get("priority", 0), reverse=True)
        
        logger.info(f"[CrossSell] 最終的に{len(recommendations)}件の推薦を返却")
        return recommendations[:limit]
    
    except Exception as e:
        logger.error(f"[CrossSell] 推薦取得エラー: {e}")
        import traceback
        logger.error(f"[CrossSell] トレースバック: {traceback.format_exc()}")
        return []


# =========================================
# 2. simple_graph_engine.py の general_response に追加
# =========================================

def general_response(self, state: State) -> State:
    """一般応答ノード（クロスセル対応版）"""
    logger.info("[Node] general_response")
    
    last_message = state.get("messages", [])[-1] if state.get("messages") else ""
    
    # 具体的なメニュー名が含まれているか確認
    menu_keywords = ["定食", "丼", "寿司", "刺身", "天ぷら", "焼き鳥", "唐揚げ", "ランチ"]
    is_menu_query = any(kw in last_message for kw in menu_keywords)
    
    # NotionクライアントとConfigがあればRAG検索を試みる
    context = ""
    matching_menus = []
    if is_menu_query and self.notion_client and self.config:
        try:
            menu_db_id = self.config.get("notion.database_ids.menu_db")
            if menu_db_id:
                # Notionで検索（簡易版）
                pages = self.notion_client.get_all_pages(menu_db_id)
                
                for page in pages[:30]:  # 最初の30件を検索
                    name = self.notion_client._extract_property_value(page, "Name")
                    if name and any(kw in name for kw in last_message.split()):
                        price = self.notion_client._extract_property_value(page, "Price", 0)
                        short_desc = self.notion_client._extract_property_value(page, "一言紹介")
                        matching_menus.append({
                            "id": page["id"],  # ページIDを保存（重要！）
                            "name": name,
                            "price": price,
                            "desc": short_desc
                        })
                
                if matching_menus:
                    context = "【該当するメニュー】\n"
                    for menu in matching_menus[:3]:
                        context += f"- {menu['name']}"
                        if menu['price'] > 0:
                            context += f" ¥{menu['price']:,}"
                        if menu['desc']:
                            context += f"\n  {menu['desc']}"
                        context += "\n"
                    
                    logger.info(f"[RAG] {len(matching_menus)}件のメニューを検出")
        except Exception as e:
            logger.error(f"RAG検索エラー: {e}")
    
    # ===== クロスセル推薦を取得 =====
    cross_sell_options = []
    if matching_menus and self.notion_client:
        try:
            # 最初のマッチしたメニューの推薦を取得
            first_menu = matching_menus[0]
            first_menu_id = first_menu.get("id")
            
            if first_menu_id:
                logger.info(f"[CrossSell] {first_menu['name']}の推薦を取得中...")
                recommendations = self.notion_client.get_cross_sell_recommendations(
                    page_id=first_menu_id,
                    limit=2
                )
                
                if recommendations:
                    context += "\n\n【一緒におすすめ】\n"
                    for rec in recommendations:
                        name = rec.get("name", "")
                        price = rec.get("price", 0)
                        message = rec.get("suggest_message", "")
                        
                        context += f"- {name}"
                        if price > 0:
                            context += f" ¥{price:,}"
                        if message:
                            context += f" - {message}"
                        context += "\n"
                        
                        # 選択肢として追加
                        cross_sell_options.append(f"{name}も注文")
                    
                    logger.info(f"[CrossSell] {len(recommendations)}件の推薦を追加")
                else:
                    logger.info(f"[CrossSell] {first_menu['name']}に推薦なし")
        except Exception as e:
            logger.error(f"[CrossSell] 取得エラー: {e}")
    
    # LLMを使用して人間味のある応答を生成
    if self.llm:
        try:
            # 人間味のあるシステムプロンプト（クロスセル対応）
            system_prompt = """あなたは小料理屋「おおつき」のスタッフです。
お客様の質問に温かく応答してください。

応答スタイル：
- メニューの特徴や魅力を褒める・強調する
- 「新鮮」「人気」「おすすめ」などのポジティブな言葉を使う
- 「私もおすすめです！」「ぜひどうぞ」など、スタッフの推薦を入れる
- 2-3文で応答（短すぎず、長すぎず）

【重要】「一緒におすすめ」がある場合は、自然に提案してください：
例：「刺身定食ございます。唐揚げもご一緒にいかがですか？お酒のつまみにもぴったりですよ！」
"""
            
            if context:
                system_prompt += f"\n\n{context}"
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=last_message)
            ]
            
            response = self.llm.invoke(messages)
            state["response"] = response.content
            
            # 選択肢を設定（クロスセル + 通常選択肢）
            if is_menu_query and cross_sell_options:
                state["options"] = cross_sell_options + [
                    "いいえ、結構です",
                    "他のメニューを見る"
                ]
            elif is_menu_query:
                state["options"] = [
                    "おすすめ定食はこちら",
                    "海鮮定食はこちら",
                    "メニューを見る"
                ]
            else:
                state["options"] = [
                    "メニューを見る",
                    "おすすめを教えて"
                ]
            
            logger.info(f"[LLM応答] {response.content[:50]}...")
        
        except Exception as e:
            logger.error(f"LLM応答生成エラー: {e}")
            state["response"] = "申し訳ございません。"
            state["options"] = ["メニューを見る"]
    else:
        state["response"] = "何かお探しですか？"
        state["options"] = ["メニューを見る", "おすすめを教えて"]
    
    return state


# =========================================
# 3. テスト用スクリプト（test_cross_sell.py）
# =========================================

"""
クロスセル機能のテストスクリプト

使用方法:
    conda activate campingrepare
    python test_cross_sell.py
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.notion_client import NotionClient
from core.config_loader import load_config

def test_cross_sell():
    print("=" * 60)
    print("🍣 クロスセル機能テスト")
    print("=" * 60)
    print()
    
    # 設定読み込み
    config = load_config("ootuki_restaurant")
    menu_db_id = config.get("notion.database_ids.menu_db")
    
    if not menu_db_id:
        print("❌ メニューDB IDが設定されていません")
        return
    
    # Notionクライアント初期化
    notion = NotionClient()
    
    if not notion.client:
        print("❌ Notion APIキーが設定されていません")
        return
    
    print("✅ Notionクライアント初期化完了")
    print()
    
    # 全メニューを取得
    print("📋 メニュー一覧を取得中...")
    pages = notion.get_all_pages(menu_db_id)
    
    print(f"✅ {len(pages)}件のメニューを取得")
    print()
    
    # 各メニューの推薦をテスト
    print("🔍 クロスセル推薦をテスト中...")
    print("-" * 60)
    
    for page in pages[:5]:  # 最初の5件をテスト
        name = notion._extract_property_value(page, "Name")
        page_id = page["id"]
        
        print(f"\n【{name}】")
        
        # 推薦を取得
        recommendations = notion.get_cross_sell_recommendations(page_id, limit=3)
        
        if recommendations:
            print(f"  一緒におすすめ:")
            for rec in recommendations:
                print(f"    • {rec['name']} ¥{rec['price']:,}")
                if rec.get('suggest_message'):
                    print(f"      → {rec['suggest_message']}")
        else:
            print("  一緒におすすめ: なし")
    
    print()
    print("-" * 60)
    print("✅ テスト完了")

if __name__ == "__main__":
    test_cross_sell()

