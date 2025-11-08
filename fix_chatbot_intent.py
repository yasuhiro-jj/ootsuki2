"""
チャットボットの意図理解を改善する修正案

ユーザーの自由入力を柔軟に処理できるようにします。
"""

# 修正案1: キーワードマッピングを追加

INTENT_KEYWORDS = {
    "menu_view": ["メニュー", "メニューを", "何がある", "どんな", "見せて", "教えて"],
    "recommend": ["おすすめ", "人気", "お勧め", "オススメ", "一押し"],
    "snack": ["つまみ", "おつまみ", "酒に合う", "肴"],
    "lunch": ["ランチ", "昼", "お昼", "ひる"],
    "dinner": ["夜", "ディナー", "晩", "夕食"],
    "alcohol": ["酒", "お酒", "アルコール", "飲み物", "ビール", "日本酒", "焼酎"],
}

def detect_intent_flexible(user_input: str) -> str:
    """
    ユーザー入力から意図を柔軟に検出
    
    Args:
        user_input: ユーザーの入力テキスト
    
    Returns:
        検出された意図
    """
    user_input_lower = user_input.lower()
    
    # キーワードマッチング
    for intent, keywords in INTENT_KEYWORDS.items():
        for keyword in keywords:
            if keyword in user_input_lower:
                return intent
    
    return "general"


# 修正案2: より柔軟なルーティング関数

def route_intent_improved(self, state: State) -> str:
    """
    改善版：意図判定（柔軟なマッチング）
    """
    last_message = state.get("messages", [])[-1] if state.get("messages") else ""
    
    # 1. 定義済み選択肢の完全一致（既存ロジック維持）
    if last_message in self.predefined_options:
        return "option_click"
    
    # 2. キーワードベースの柔軟なマッチング
    detected_intent = detect_intent_flexible(last_message)
    
    if detected_intent == "menu_view":
        # 「メニューを見る」系 → 食事メニュー表示
        return "food_flow"
    
    elif detected_intent == "recommend":
        # 「おすすめを教えて」系 → プロアクティブ推薦
        return "proactive_recommend"
    
    elif detected_intent == "snack":
        # 「お酒に合うつまみ」系 → アルコールフロー
        state["context"]["show_snacks"] = True
        return "alcohol_flow"
    
    elif detected_intent == "alcohol":
        # 「お酒」「ビール」系 → アルコールフロー
        return "alcohol_flow"
    
    elif detected_intent in ["lunch", "dinner"]:
        # ランチ・ディナー → 食事フロー
        return "food_flow"
    
    # 3. 既存のキーワード判定（フォールバック）
    if any(kw in last_message for kw in ["酒", "ビール", "飲み"]):
        return "alcohol_flow"
    
    if any(kw in last_message for kw in ["ランチ", "弁当", "定食"]):
        return "food_flow"
    
    # 4. それ以外は一般応答
    return "general"


# 修正案3: alcohol_flowでつまみ表示を追加

def alcohol_flow_improved(self, state: State) -> State:
    """
    改善版：アルコール案内ノード（つまみ対応）
    """
    logger.info("[Node] alcohol_flow")
    
    # つまみを強調するかチェック
    show_snacks = state.get("context", {}).get("show_snacks", False)
    
    if show_snacks:
        # つまみメニューを取得
        try:
            menu_db_id = self.config.get("notion.database_ids.menu_db")
            
            # "逸品料理"や"海鮮刺身"をつまみとして表示
            snack_menus = []
            
            for category in ["逸品料理", "海鮮刺身"]:
                menus = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value=category,
                    limit=5
                )
                snack_menus.extend(menus)
            
            if snack_menus:
                response_text = "🍶 お酒に合うつまみをご紹介します！\n\n"
                
                for menu in snack_menus[:8]:
                    name = menu.get("name", "")
                    price = menu.get("price", 0)
                    short_desc = menu.get("short_desc", "")
                    
                    response_text += f"• **{name}**"
                    if price > 0:
                        response_text += f" ¥{price:,}"
                    response_text += "\n"
                    if short_desc:
                        response_text += f"  {short_desc}\n"
                    response_text += "\n"
                
                state["response"] = response_text
                state["options"] = ["ビール", "日本酒", "焼酎", "その他のメニュー"]
                return state
        
        except Exception as e:
            logger.error(f"つまみメニュー取得エラー: {e}")
    
    # 通常のアルコールフロー（既存ロジック）
    state["response"] = "🍺 こちらにアルコールメニューございます。\n\nビール、日本酒、焼酎、ワインなど各種ございます。"
    state["options"] = ["ビール", "日本酒", "焼酎", "ワイン"]
    
    return state


# 修正案4: general_responseでもメニュー提示

def general_response_improved(self, state: State) -> State:
    """
    改善版：一般応答ノード（メニュー選択肢を表示）
    """
    logger.info("[Node] general_response")
    
    last_message = state.get("messages", [])[-1] if state.get("messages") else ""
    
    # 「メニュー」「おすすめ」などの単語があれば、それに対応した提案
    if "メニュー" in last_message:
        state["response"] = "メニューをご案内します！どのカテゴリをご覧になりますか？"
        state["options"] = [
            "ランチメニュー",
            "夜の定食",
            "お酒に合うつまみ",
            "おすすめを教えて"
        ]
    
    elif "おすすめ" in last_message:
        # プロアクティブ推薦にルーティング
        state["intent"] = "proactive_recommend"
        state["response"] = "本日のおすすめをご紹介します！"
        # 実際の推薦ロジックは proactive_recommend で処理
    
    else:
        # デフォルトの一般応答
        state["response"] = "かしこまりました。他にご質問があればお気軽にお声がけください。"
        state["options"] = [
            "メニューを見る",
            "おすすめを教えて",
            "お酒に合うつまみ"
        ]
    
    return state


print("""
================================================================================
チャットボット意図理解の改善方法
================================================================================

問題：
- ユーザーの自由入力（「お酒に合うつまみ」「おすすめを教えて」「メニューを見る」）
  が処理されず、「メニューが見つかりませんでした」エラーが表示される

原因：
- 選択肢の完全一致判定に依存
- キーワードベースのマッチングが不十分

解決策（このファイルに実装済み）：

1. INTENT_KEYWORDS: キーワードマッピングの追加
   - より多くの表現パターンに対応

2. detect_intent_flexible(): 柔軟な意図検出関数
   - キーワードマッチングで意図を検出

3. route_intent_improved(): 改善版ルーティング
   - 完全一致 → キーワードマッチング → フォールバックの順

4. alcohol_flow_improved(): つまみ表示対応
   - 「お酒に合うつまみ」に特化した応答

5. general_response_improved(): より適切な応答
   - 「メニュー」「おすすめ」に応じた選択肢表示

================================================================================
適用方法：
================================================================================

これらの関数を core/simple_graph_engine.py に統合してください。

または、エージェントモードで自動適用します。

================================================================================
""")


