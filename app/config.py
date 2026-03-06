import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict

def load_environment_variables():
    """環境変数を読み込み"""
    # .envファイルから環境変数を読み込み
    from dotenv import load_dotenv
    # 既存のプロセス環境より .env を優先して上書きする
    load_dotenv(override=True)
    
    # 手動で環境変数を設定（Anaconda Prompt用）
    env_vars = {
        "NOTION_API_KEY": os.getenv("NOTION_API_KEY"),
        "NOTION_DATABASE_ID_MENU": os.getenv("NOTION_DATABASE_ID_MENU"),
        "NOTION_DATABASE_ID_STORE": os.getenv("NOTION_DATABASE_ID_STORE"),
        "NOTION_DATABASE_ID_CONVERSATION": os.getenv("NOTION_DATABASE_ID_CONVERSATION"),
        "NOTION_DATABASE_ID_UNKNOWN_KEYWORDS": os.getenv("NOTION_DATABASE_ID_UNKNOWN_KEYWORDS"),
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
        "LANGSMITH_API_KEY": os.getenv("LANGSMITH_API_KEY"),
        "SERPAPI_API_KEY": os.getenv("SERPAPI_API_KEY"),
        "CHROMA_PERSIST_DIR": os.getenv("CHROMA_PERSIST_DIR"),
        # 厳格モード（Chroma+OpenAI必須）
        "REQUIRE_CHROMA": os.getenv("REQUIRE_CHROMA") or os.getenv("RAG_STRICT"),
    }
    
    # 環境変数が設定されていない場合は警告
    for key, value in env_vars.items():
        if not value:
            print(f"⚠️ {key}が設定されていません")
    
    # 環境変数を手動で設定
    for key, value in env_vars.items():
        if value:
            os.environ[key] = value
            print(f"✅ {key}を設定しました: {value[:20]}..." if len(str(value)) > 20 else f"✅ {key}を設定しました: {value}")

class Settings(BaseSettings):
    """アプリケーション設定クラス"""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)
    
    # アプリケーション設定
    app_name: str = "おおつきチャットボット"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Notion API設定
    notion_api_key: Optional[str] = None
    notion_database_id_menu: Optional[str] = None
    notion_database_id_store: Optional[str] = None
    notion_database_id_conversation: Optional[str] = None
    notion_database_id_unknown_keywords: Optional[str] = None  # 不明キーワード記録DB
    
    # OpenAI API設定
    openai_api_key: Optional[str] = None
    # SerpAPI設定
    serpapi_api_key: Optional[str] = None
    
    # LangSmith設定
    langsmith_api_key: Optional[str] = None
    langsmith_project: str = "ootuki-chatbot"
    
    # データベース設定
    database_url: str = "sqlite:///./chatbot.db"

    # Chroma永続化ディレクトリ
    chroma_persist_dir: Optional[str] = "data/chroma"
    # RAG厳格モード（TrueのときBoWフォールバックせずエラー）
    require_chroma: bool = False

    # ローカルMarkdown読み込み設定
    local_menu_dir: str = "data/menus"
    local_store_file: str = "data/store.md"

# 環境変数を先に読み込み
load_environment_variables()

# 環境変数を直接設定
NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_DATABASE_ID_MENU = os.getenv("NOTION_DATABASE_ID_MENU")
NOTION_DATABASE_ID_STORE = os.getenv("NOTION_DATABASE_ID_STORE")
NOTION_DATABASE_ID_CONVERSATION = os.getenv("NOTION_DATABASE_ID_CONVERSATION")
NOTION_DATABASE_ID_UNKNOWN_KEYWORDS = os.getenv("NOTION_DATABASE_ID_UNKNOWN_KEYWORDS")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY")
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY")
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR")
REQUIRE_CHROMA_ENV = os.getenv("REQUIRE_CHROMA") or os.getenv("RAG_STRICT")

def _to_bool(value: Optional[str]) -> bool:
    if value is None:
        return False
    v = str(value).strip().lower()
    return v in ("1", "true", "yes", "on")

# 設定インスタンス
settings = Settings()

# 設定値を直接上書き
settings.notion_api_key = NOTION_API_KEY
settings.notion_database_id_menu = NOTION_DATABASE_ID_MENU
settings.notion_database_id_store = NOTION_DATABASE_ID_STORE
settings.notion_database_id_conversation = NOTION_DATABASE_ID_CONVERSATION
settings.notion_database_id_unknown_keywords = NOTION_DATABASE_ID_UNKNOWN_KEYWORDS
settings.openai_api_key = OPENAI_API_KEY
settings.langsmith_api_key = LANGSMITH_API_KEY
settings.serpapi_api_key = SERPAPI_API_KEY
def _expand_path(p: Optional[str]) -> Optional[str]:
    if not p:
        return p
    # 環境変数/ユーザー展開（Windowsの%LOCALAPPDATA%なども展開）
    expanded = os.path.expandvars(os.path.expanduser(p))
    return expanded

settings.chroma_persist_dir = _expand_path(CHROMA_PERSIST_DIR) or settings.chroma_persist_dir
settings.require_chroma = _to_bool(REQUIRE_CHROMA_ENV)

print("🔧 最終設定値確認:")
print(f"   メニューDB ID: {settings.notion_database_id_menu}")
print(f"   店舗DB ID: {settings.notion_database_id_store}")
print(f"   不明キーワードDB ID: {settings.notion_database_id_unknown_keywords}")
print(f"   SerpAPI Key 設定: {'あり' if settings.serpapi_api_key else 'なし'}")
print(f"   Chroma 永続ディレクトリ: {settings.chroma_persist_dir}")
print(f"   RAG厳格モード: {'有効' if settings.require_chroma else '無効'}")