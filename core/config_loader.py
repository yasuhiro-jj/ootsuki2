"""
Configuration Loader

YAML設定ファイルを読み込み、アプリケーション設定を管理する
"""

import os
import yaml
from pathlib import Path
from typing import Any, Dict, Optional
from dotenv import load_dotenv


class ConfigLoader:
    """
    YAML設定ファイルと環境変数を統合して管理するクラス
    """
    
    def __init__(self, app_name: str, config_dir: str = "config"):
        """
        Args:
            app_name: アプリケーション名（例: ootuki_restaurant）
            config_dir: 設定ファイルディレクトリ（デフォルト: config）
        """
        self.app_name = app_name
        self.config_dir = Path(config_dir)
        self.config_path = self.config_dir / f"{app_name}.yaml"
        
        # .envファイルを読み込み
        load_dotenv(override=True)
        
        # YAML設定を読み込み
        self.config = self._load_yaml()
        
        # 環境変数を設定
        self._setup_environment()
    
    def _load_yaml(self) -> Dict[str, Any]:
        """YAML設定ファイルを読み込む"""
        if not self.config_path.exists():
            raise FileNotFoundError(
                f"設定ファイルが見つかりません: {self.config_path}\n"
                f"config/{self.app_name}.yaml を作成してください。"
            )
        
        with open(self.config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        
        print(f"[OK] 設定ファイルを読み込みました: {self.config_path}")
        return config
    
    def _setup_environment(self):
        """環境変数を設定"""
        # Notion API Key
        notion_key = os.getenv("NOTION_API_KEY")
        if notion_key:
            os.environ["NOTION_API_KEY"] = notion_key
            print(f"[OK] NOTION_API_KEYを設定しました: {notion_key[:20]}...")
        
        # OpenAI API Key
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            os.environ["OPENAI_API_KEY"] = openai_key
            print(f"[OK] OPENAI_API_KEYを設定しました: {openai_key[:20]}...")
        
        # LangSmith API Key と トレーシング設定
        langsmith_key = os.getenv("LANGSMITH_API_KEY")
        if langsmith_key:
            os.environ["LANGSMITH_API_KEY"] = langsmith_key
            # LangSmith トレーシングを有効化
            os.environ["LANGCHAIN_TRACING_V2"] = "true"
            os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
            os.environ["LANGCHAIN_PROJECT"] = os.getenv("LANGSMITH_PROJECT", self.app_name)
            print(f"[OK] LANGSMITH_API_KEYを設定しました")
            print(f"[OK] LangSmithトレーシングを有効化しました (Project: {os.environ['LANGCHAIN_PROJECT']})")
        
        # SerpAPI Key
        serpapi_key = os.getenv("SERPAPI_API_KEY")
        if serpapi_key:
            os.environ["SERPAPI_API_KEY"] = serpapi_key
            print(f"[OK] SERPAPI_API_KEYを設定しました")
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        ドット記法で設定値を取得
        
        Args:
            key: 設定キー（例: "notion.database_ids.menu_db"）
            default: デフォルト値
        
        Returns:
            設定値
        """
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                return default
            
            if value is None:
                return default
        
        return value
    
    def get_notion_db_id(self, db_name: str) -> Optional[str]:
        """Notion Database IDを取得"""
        return self.get(f"notion.database_ids.{db_name}")
    
    def get_knowledge_base_path(self) -> str:
        """ナレッジベースのパスを取得"""
        return self.get("knowledge_base.path", "./knowledge/")
    
    def get_ai_model(self) -> str:
        """AIモデル名を取得"""
        return self.get("ai.model", "gpt-4")
    
    def get_embedding_model(self) -> str:
        """埋め込みモデル名を取得"""
        return self.get("ai.embedding", "text-embedding-ada-002")
    
    def get_server_config(self) -> Dict[str, Any]:
        """サーバー設定を取得"""
        # RailwayやHerokuなどのクラウド環境ではPORT環境変数を使用
        port = os.getenv("PORT")
        if port:
            port = int(port)
        else:
            port = self.get("server.port", 8000)
        
        return {
            "host": self.get("server.host", "0.0.0.0"),
            "port": port,
        }
    
    def get_chroma_persist_dir(self) -> str:
        """Chroma永続化ディレクトリを取得"""
        default_dir = f"data/chroma/{self.app_name}"
        persist_dir = self.get("chroma.persist_dir", default_dir)
        
        # 環境変数展開
        persist_dir = os.path.expandvars(os.path.expanduser(persist_dir))
        
        # ディレクトリ作成
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
        
        return persist_dir
    
    def print_summary(self):
        """設定の概要を表示"""
        print("\n" + "="*60)
        print(f">> {self.get('project_name', 'ootsuki2')} 設定情報")
        print("="*60)
        print(f"[アプリ] {self.app_name}")
        print(f"[設定] {self.config_path}")
        print(f"[サーバー] {self.get('server.host')}:{self.get('server.port')}")
        print(f"[AIモデル] {self.get_ai_model()}")
        print(f"[Chroma] {self.get_chroma_persist_dir()}")
        
        # Notion DB IDs
        db_ids = self.get("notion.database_ids", {})
        if db_ids:
            print(f"\n[Notion Databases]")
            for db_name, db_id in db_ids.items():
                if db_id:
                    print(f"   - {db_name}: {db_id[:20]}...")
        
        print("="*60 + "\n")


def load_config(app_name: str) -> ConfigLoader:
    """
    設定ファイルを読み込むヘルパー関数
    
    Args:
        app_name: アプリケーション名
    
    Returns:
        ConfigLoaderインスタンス
    """
    return ConfigLoader(app_name)

