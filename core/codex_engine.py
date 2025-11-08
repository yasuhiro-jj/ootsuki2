"""
Codex Engine - コード生成特化AIエンジン

OpenAI GPT-4o-mini を使用したコード生成・解析エンジン
2025年版のCodex相当機能を提供（コスト最適化版）
"""

import os
import logging
from typing import Optional, List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)


class CodexEngine:
    """
    Codex相当のコード生成エンジン
    
    GPT-4o-miniを使用してコード生成、解析、リファクタリングを実行
    コスト最適化版：十分な品質を低コストで実現
    """
    
    def __init__(
        self,
        model: str = "gpt-4o-mini",
        temperature: float = 0.2,
        max_tokens: int = 4000
    ):
        """
        Args:
            model: 使用するモデル（デフォルト: gpt-4o-mini）
            temperature: 生成の多様性（0.0-1.0、コード生成は低め推奨）
            max_tokens: 最大トークン数
        """
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.llm = None
        
        self._initialize_llm()
    
    def _initialize_llm(self):
        """LLMを初期化"""
        try:
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key:
                self.llm = ChatOpenAI(
                    model=self.model,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                    api_key=api_key
                )
                logger.info(f"[Codex] ✅ エンジンを初期化しました: {self.model} (temp={self.temperature})")
            else:
                logger.warning("[Codex] ⚠️ OpenAI API Keyが設定されていません")
        except Exception as e:
            logger.error(f"[Codex] ❌ 初期化エラー: {e}")
    
    def generate_code(
        self,
        prompt: str,
        language: Optional[str] = None,
        context: Optional[str] = None
    ) -> str:
        """
        コードを生成
        
        Args:
            prompt: コード生成の指示
            language: プログラミング言語（Python, JavaScript, etc.）
            context: 追加のコンテキスト
        
        Returns:
            生成されたコード
        """
        if not self.llm:
            return "# エラー: Codexエンジンが初期化されていません"
        
        try:
            # システムプロンプト
            system_prompt = self._build_system_prompt(language)
            
            # ユーザープロンプト
            user_prompt = prompt
            if context:
                user_prompt = f"コンテキスト:\n{context}\n\nタスク:\n{prompt}"
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            # コード生成
            response = self.llm.invoke(messages)
            code = response.content
            
            logger.info(f"[Codex] ✅ コード生成完了 ({len(code)} chars)")
            return code
        
        except Exception as e:
            logger.error(f"[Codex] ❌ コード生成エラー: {e}")
            return f"# エラー: {str(e)}"
    
    def explain_code(self, code: str, language: Optional[str] = None) -> str:
        """
        コードを解説
        
        Args:
            code: 解説するコード
            language: プログラミング言語
        
        Returns:
            コードの解説
        """
        if not self.llm:
            return "エラー: Codexエンジンが初期化されていません"
        
        try:
            lang_info = f"（言語: {language}）" if language else ""
            system_prompt = f"""あなたは優秀なプログラマーです。
コードを詳しく解説してください{lang_info}。
- 各部分の役割
- 使用されている技術やパターン
- 改善点や注意点"""
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"以下のコードを解説してください:\n\n```\n{code}\n```")
            ]
            
            response = self.llm.invoke(messages)
            explanation = response.content
            
            logger.info("[Codex] ✅ コード解説完了")
            return explanation
        
        except Exception as e:
            logger.error(f"[Codex] ❌ コード解説エラー: {e}")
            return f"エラー: {str(e)}"
    
    def refactor_code(
        self,
        code: str,
        instructions: str,
        language: Optional[str] = None
    ) -> str:
        """
        コードをリファクタリング
        
        Args:
            code: リファクタリングするコード
            instructions: リファクタリングの指示
            language: プログラミング言語
        
        Returns:
            リファクタリング後のコード
        """
        if not self.llm:
            return "# エラー: Codexエンジンが初期化されていません"
        
        try:
            lang_info = f"（言語: {language}）" if language else ""
            system_prompt = f"""あなたは優秀なプログラマーです。
コードをリファクタリングしてください{lang_info}。
- 可読性の向上
- パフォーマンスの最適化
- ベストプラクティスの適用"""
            
            user_prompt = f"""以下のコードを指示に従ってリファクタリングしてください。

指示: {instructions}

元のコード:
```
{code}
```

リファクタリング後のコードのみを出力してください。"""
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            response = self.llm.invoke(messages)
            refactored_code = response.content
            
            logger.info("[Codex] ✅ リファクタリング完了")
            return refactored_code
        
        except Exception as e:
            logger.error(f"[Codex] ❌ リファクタリングエラー: {e}")
            return f"# エラー: {str(e)}"
    
    def review_code(self, code: str, language: Optional[str] = None) -> Dict[str, Any]:
        """
        コードレビュー
        
        Args:
            code: レビューするコード
            language: プログラミング言語
        
        Returns:
            レビュー結果
        """
        if not self.llm:
            return {"error": "Codexエンジンが初期化されていません"}
        
        try:
            lang_info = f"（言語: {language}）" if language else ""
            system_prompt = f"""あなたは経験豊富なコードレビュアーです。
以下の観点でコードをレビューしてください{lang_info}:

1. バグや潜在的な問題
2. セキュリティ上の懸念
3. パフォーマンスの問題
4. 可読性と保守性
5. ベストプラクティスへの準拠

JSON形式で結果を返してください。"""
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"以下のコードをレビューしてください:\n\n```\n{code}\n```")
            ]
            
            response = self.llm.invoke(messages)
            review = response.content
            
            logger.info("[Codex] ✅ コードレビュー完了")
            return {
                "status": "success",
                "review": review,
                "model": self.model
            }
        
        except Exception as e:
            logger.error(f"[Codex] ❌ コードレビューエラー: {e}")
            return {"status": "error", "error": str(e)}
    
    def _build_system_prompt(self, language: Optional[str] = None) -> str:
        """システムプロンプトを構築"""
        lang_info = f"{language}の" if language else ""
        return f"""あなたは世界トップレベルの{lang_info}プログラマーです。

以下の原則に従ってください:
- クリーンで読みやすいコードを書く
- ベストプラクティスに従う
- 適切なコメントを付ける
- エラーハンドリングを含める
- セキュリティを考慮する
- パフォーマンスを最適化する

コードは本番環境で使用可能な品質で生成してください。"""
    
    def debug_code(
        self,
        code: str,
        error_message: str,
        language: Optional[str] = None
    ) -> str:
        """
        コードのバグを修正
        
        Args:
            code: バグのあるコード
            error_message: エラーメッセージ
            language: プログラミング言語
        
        Returns:
            修正されたコード
        """
        if not self.llm:
            return "# エラー: Codexエンジンが初期化されていません"
        
        try:
            lang_info = f"（言語: {language}）" if language else ""
            system_prompt = f"""あなたは優秀なデバッガーです。
コードのバグを特定し、修正してください{lang_info}。"""
            
            user_prompt = f"""以下のコードにエラーがあります。修正してください。

エラーメッセージ:
{error_message}

コード:
```
{code}
```

修正後のコードと、何を修正したかの説明を提供してください。"""
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            response = self.llm.invoke(messages)
            fixed_code = response.content
            
            logger.info("[Codex] ✅ バグ修正完了")
            return fixed_code
        
        except Exception as e:
            logger.error(f"[Codex] ❌ バグ修正エラー: {e}")
            return f"# エラー: {str(e)}"


# 便利な関数
def create_codex_engine(config: Optional[Dict[str, Any]] = None) -> CodexEngine:
    """
    Codexエンジンを作成
    
    Args:
        config: 設定（model, temperature, max_tokens）
    
    Returns:
        CodexEngineインスタンス
    """
    if config:
        return CodexEngine(
            model=config.get("model", "gpt-4o-mini"),
            temperature=config.get("temperature", 0.2),
            max_tokens=config.get("max_tokens", 4000)
        )
    return CodexEngine()

