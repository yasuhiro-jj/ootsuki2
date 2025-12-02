"""
クロスリフレクションエンジン

重要な応答（予約・価格問い合わせなど）に対して、
LLMによる自己レビューと改善を適用する機能
"""

from langchain_core.messages import SystemMessage, HumanMessage
from typing import Optional, Dict, Any
import logging
import re

logger = logging.getLogger(__name__)


class CrossReflectionEngine:
    """
    クロスリフレクションエンジン
    
    重要な応答に対して、LLMによる自己レビューと改善を適用
    """
    
    def __init__(self, llm, notion_client=None, menu_service=None, config=None):
        """
        Args:
            llm: ChatOpenAIインスタンス
            notion_client: NotionClientインスタンス（オプション、メニュー情報取得用）
            menu_service: MenuServiceインスタンス（オプション、メニュー検索用）
            config: ConfigLoaderインスタンス（オプション、設定取得用）
        """
        self.llm = llm
        self.notion_client = notion_client
        self.menu_service = menu_service
        self.config = config
        logger.info(
            "[CrossReflection] Engine インスタンス化 "
            f"(llm_available={self.llm is not None}, "
            f"notion_client={notion_client is not None}, "
            f"menu_service={menu_service is not None})"
        )
    
    def is_critical_intent(self, user_message: str, intent: Optional[str] = None) -> bool:
        """
        重要な意図かどうかを判定
        
        Args:
            user_message: ユーザーのメッセージ
            intent: 検出された意図（オプション）
        
        Returns:
            重要な意図の場合True
        """
        # 重要な意図のリスト
        critical_intents = [
            "reservation",      # 予約
            "price",           # 価格問い合わせ
            "banquet",         # 宴会・忘年会
            "hours",           # 営業時間（重要な場合）
        ]
        
        # 意図ベースの判定
        if intent and intent.lower() in critical_intents:
            return True
        
        # キーワードベースの判定
        critical_keywords = [
            "予約", "reservation", "予約したい", "予約できますか",
            "価格", "値段", "いくら", "price", "料金", "費用",
            "忘年会", "宴会", "banquet", "飲み会", "パーティー",
            "営業時間", "開店", "閉店", "hours", "何時から", "何時まで"
        ]
        
        user_message_lower = user_message.lower()
        for keyword in critical_keywords:
            if keyword in user_message_lower:
                return True
        
        return False
    
    def review_response(
        self,
        user_message: str,
        initial_response: str,
        context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        応答をレビューして改善点を指摘
        
        Args:
            user_message: ユーザーのメッセージ
            initial_response: 初期の応答
            context: 追加コンテキスト（メニュー情報など）
        
        Returns:
            レビュー結果の辞書
            {
                "review": str,  # レビュー内容
                "improvements": List[str],  # 改善点のリスト
                "score": float  # スコア（0-1）
            }
        """
        if not self.llm:
            logger.warning("[CrossReflection] LLMが初期化されていません")
            return {
                "review": "",
                "improvements": [],
                "score": 0.5
            }
        
        try:
            # f-string内にバックスラッシュを含められないため、変数に代入
            context_section = ""
            if context:
                context_section = f"【追加コンテキスト】\n{context}\n\n"
            
            review_prompt = f"""あなたはチャットボットの応答品質をレビューする専門家です。
以下の応答をレビューして、改善点を指摘してください。

【ユーザーの質問】
{user_message}

【初期応答】
{initial_response}

{context_section}【レビューの観点】
1. 情報の正確性（価格、時間、連絡先など）
2. 情報の完全性（必要な情報がすべて含まれているか）
3. 具体性（具体的な提案や選択肢があるか）
4. 丁寧さ（接客として適切な口調か）
5. 行動喚起（次のステップが明確か）

【レビュー形式】
- 改善点を箇条書きで3-5点指摘
- 各改善点は具体的で実用的なものにする
- スコア（0-1）を最後に記載

レビュー結果:"""
            
            messages = [
                SystemMessage(content="あなたはチャットボットの応答品質をレビューする専門家です。"),
                HumanMessage(content=review_prompt)
            ]
            
            response = self.llm.invoke(messages)
            review_text = response.content
            
            # レビューから改善点を抽出
            improvements = self._extract_improvements(review_text)
            
            # スコアを抽出（0-1）
            score = self._extract_score(review_text)
            
            logger.info(f"[CrossReflection] レビュー完了: {len(improvements)}件の改善点, スコア: {score}")
            
            return {
                "review": review_text,
                "improvements": improvements,
                "score": score
            }
        
        except Exception as e:
            logger.error(f"[CrossReflection] レビューエラー: {e}")
            return {
                "review": "",
                "improvements": [],
                "score": 0.5
            }
    
    def improve_response(
        self,
        user_message: str,
        initial_response: str,
        review_result: Dict[str, Any],
        context: Optional[str] = None
    ) -> str:
        """
        レビュー結果に基づいて応答を改善
        
        Args:
            user_message: ユーザーのメッセージ
            initial_response: 初期の応答
            review_result: レビュー結果
            context: 追加コンテキスト
        
        Returns:
            改善された応答
        """
        if not self.llm:
            logger.warning("[CrossReflection] LLMが初期化されていません")
            return initial_response
        
        # スコアが高い場合は改善不要
        if review_result.get("score", 0) >= 0.8:
            logger.info("[CrossReflection] スコアが高いため改善スキップ")
            return initial_response
        
        try:
            improvements_text = "\n".join([
                f"- {imp}" for imp in review_result.get("improvements", [])
            ])
            
            # f-string内にバックスラッシュを含められないため、変数に代入
            context_section = ""
            if context:
                context_section = f"【追加コンテキスト】\n{context}\n\n"
            
            # Notionデータベースの情報が含まれているかチェック
            uses_notion_data = "【NotionメニューDBからの正確な情報】" in (context or "")
            data_source_note = ""
            if uses_notion_data:
                data_source_note = "\n【重要】「NotionメニューDBからの正確な情報」セクションに記載されている情報のみを使用してください。\n推測や創作で金額や内容を生成することは厳禁です。\nデータベースに情報がない場合は、「申し訳ございませんが、詳細な情報を確認できませんでした」と伝えてください。\n"
            
            improve_prompt = f"""以下の応答をレビュー結果に基づいて改善してください。

【ユーザーの質問】
{user_message}

【初期応答】
{initial_response}

【レビュー結果】
{review_result.get("review", "")}

【改善点】
{improvements_text}

{context_section}{data_source_note}【改善のポイント】
- レビューで指摘された改善点をすべて反映する
- 情報の正確性と完全性を確保する（Notionデータベースの情報のみを使用）
- 具体的で実用的な提案を含める
- 丁寧で親しみやすい口調を保つ
- 次のステップを明確にする

改善された応答のみを出力してください（説明文は不要）:"""
            
            messages = [
                SystemMessage(content="あなたはチャットボットの応答を改善する専門家です。"),
                HumanMessage(content=improve_prompt)
            ]
            
            response = self.llm.invoke(messages)
            improved_response = response.content.strip()
            
            logger.info(f"[CrossReflection] 応答改善完了: {len(improved_response)}文字")
            
            return improved_response
        
        except Exception as e:
            logger.error(f"[CrossReflection] 応答改善エラー: {e}")
            return initial_response
    
    def apply_reflection(
        self,
        user_message: str,
        initial_response: str,
        intent: Optional[str] = None,
        context: Optional[str] = None
    ) -> str:
        """
        クロスリフレクションを適用（レビュー + 改善）
        
        Args:
            user_message: ユーザーのメッセージ
            initial_response: 初期の応答
            intent: 検出された意図
            context: 追加コンテキスト
        
        Returns:
            改善された応答（重要な意図の場合）または初期応答
        """
        # 重要な意図でない場合はスキップ
        if not self.is_critical_intent(user_message, intent):
            logger.debug("[CrossReflection] 重要な意図ではないためスキップ")
            return initial_response
        
        logger.info(f"[CrossReflection] クロスリフレクション適用開始: intent={intent}")
        
        # NotionのメニューDBから正確な情報を取得（価格問い合わせの場合）
        enhanced_context = self._enhance_context_with_menu_data(user_message, intent, context)
        
        # レビュー実行
        review_result = self.review_response(user_message, initial_response, enhanced_context)
        
        # 改善実行
        improved_response = self.improve_response(
            user_message,
            initial_response,
            review_result,
            enhanced_context
        )
        
        logger.info(f"[CrossReflection] クロスリフレクション適用完了")
        
        return improved_response
    
    def _enhance_context_with_menu_data(
        self,
        user_message: str,
        intent: Optional[str] = None,
        context: Optional[str] = None
    ) -> str:
        """
        NotionのメニューDBから正確な情報を取得してコンテキストを強化
        
        Args:
            user_message: ユーザーのメッセージ
            intent: 検出された意図
            context: 既存のコンテキスト
        
        Returns:
            強化されたコンテキスト
        """
        if not self.menu_service or not self.notion_client or not self.config:
            logger.debug("[CrossReflection] メニューサービスが利用できないため、既存コンテキストを使用")
            return context or ""
        
        # 価格問い合わせの場合のみ、メニューDBから情報を取得
        if intent == "price" or any(kw in user_message.lower() for kw in ["価格", "値段", "いくら", "料金"]):
            try:
                menu_db_id = self.config.get("notion.database_ids.menu_db")
                if not menu_db_id:
                    return context or ""
                
                # ユーザーメッセージからメニュー名を抽出
                # 例: "刺身定食はいくら" → "刺身定食"
                menu_keywords = []
                
                # 価格問い合わせのキーワードを除去
                price_keywords = ["いくら", "値段", "価格", "料金", "費用", "は", "の"]
                cleaned_message = user_message
                for pk in price_keywords:
                    cleaned_message = cleaned_message.replace(pk, " ")
                
                # メニュー関連キーワードを抽出
                menu_patterns = [
                    "定食", "セット", "メニュー", "刺身", "天ぷら", "焼き鳥", 
                    "ランチ", "ディナー", "丼", "寿司", "唐揚げ", "カラアゲ",
                    "天ぷら", "てんぷら", "天麩羅", "tempura"
                ]
                
                for pattern in menu_patterns:
                    if pattern in user_message:
                        menu_keywords.append(pattern)
                
                # メニュー名全体を抽出（「○○定食」「○○セット」など）
                # 「○○定食」「○○セット」などのパターンを抽出
                menu_name_patterns = [
                    r"(.+?)(定食|セット|メニュー|丼)",
                    r"(刺身|天ぷら|焼き鳥|唐揚げ|カラアゲ)(.+?)",
                ]
                for pattern in menu_name_patterns:
                    matches = re.findall(pattern, user_message)
                    for match in matches:
                        if isinstance(match, tuple):
                            keyword = "".join(match).strip()
                        else:
                            keyword = match.strip()
                        if keyword and len(keyword) > 1:
                            menu_keywords.append(keyword)
                
                if menu_keywords:
                    # メニューDBから検索
                    menu_results = []
                    for keyword in menu_keywords[:3]:  # 最大3つのキーワードで検索
                        try:
                            menu_items = self.menu_service.fetch_menu_items(keyword, limit=5)
                            # MenuItemViewを辞書形式に変換
                            for item in menu_items:
                                menu_results.append({
                                    "name": item.name,
                                    "price": item.price,
                                    "description": item.description,
                                    "short_desc": item.one_liner
                                })
                        except Exception as e:
                            logger.debug(f"[CrossReflection] メニュー検索エラー ({keyword}): {e}")
                    
                    if menu_results:
                        # 重複を除去
                        seen_names = set()
                        unique_menus = []
                        for menu in menu_results:
                            name = menu.get("name", "")
                            if name and name not in seen_names:
                                seen_names.add(name)
                                unique_menus.append(menu)
                        
                        # メニュー情報をフォーマット
                        menu_info_text = "【NotionメニューDBからの正確な情報】\n"
                        menu_info_text += "以下の情報はNotionデータベースから取得した正確な情報です。\n"
                        menu_info_text += "応答には必ずこの情報を使用してください。推測や創作は禁止です。\n\n"
                        
                        for menu in unique_menus[:10]:  # 最大10件
                            name = menu.get("name", "")
                            price = menu.get("price")
                            description = menu.get("description", "")
                            short_desc = menu.get("short_desc", "")
                            
                            menu_info_text += f"• {name}"
                            if price is not None and price > 0:
                                menu_info_text += f" - ¥{price:,}"
                            menu_info_text += "\n"
                            
                            if short_desc:
                                menu_info_text += f"  {short_desc}\n"
                            if description:
                                menu_info_text += f"  {description}\n"
                            menu_info_text += "\n"
                        
                        # 既存のコンテキストと結合
                        if context:
                            enhanced_context = f"{context}\n\n{menu_info_text}"
                        else:
                            enhanced_context = menu_info_text
                        
                        logger.info(f"[CrossReflection] メニューDBから{len(unique_menus)}件の情報を取得してコンテキストを強化")
                        return enhanced_context
                
            except Exception as e:
                logger.warning(f"[CrossReflection] メニュー情報取得エラー: {e}")
                import traceback
                logger.debug(f"[CrossReflection] トレースバック: {traceback.format_exc()}")
        
        return context or ""
    
    def _extract_improvements(self, review_text: str) -> list:
        """レビューテキストから改善点を抽出"""
        improvements = []
        
        # 箇条書きのパターンを検出
        lines = review_text.split("\n")
        for line in lines:
            line = line.strip()
            # 「-」「・」「*」で始まる行を改善点として抽出
            if line.startswith(("-", "・", "*", "1.", "2.", "3.", "4.", "5.")):
                # 番号や記号を除去
                improvement = line.lstrip("-・*1234567890. ")
                if improvement and len(improvement) > 10:  # 短すぎるものは除外
                    improvements.append(improvement)
        
        return improvements[:5]  # 最大5件
    
    def _extract_score(self, review_text: str) -> float:
        """レビューテキストからスコアを抽出"""
        import re
        
        # 「スコア: 0.8」のようなパターンを検出
        score_patterns = [
            r"スコア[：:]\s*([0-9.]+)",
            r"score[：:]\s*([0-9.]+)",
            r"([0-9.]+)\s*点",
            r"([0-9.]+)/1\.0",
            r"([0-9.]+)/10",
        ]
        
        for pattern in score_patterns:
            match = re.search(pattern, review_text, re.IGNORECASE)
            if match:
                try:
                    score = float(match.group(1))
                    # 10点満点の場合は1.0に正規化
                    if score > 1.0:
                        score = score / 10.0
                    return min(max(score, 0.0), 1.0)  # 0-1の範囲に制限
                except ValueError:
                    continue
        
        # スコアが見つからない場合は0.5を返す
        return 0.5

