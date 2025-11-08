"""
ootsuki2 Main Entry Point

業種別チャットボットのメインエントリーポイント
"""

import sys
import logging
import uvicorn
from pathlib import Path

# ロギング設定（DEBUGレベルで詳細ログを表示）
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # コンソールに出力
    ]
)
logger = logging.getLogger(__name__)

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent))

from core.config_loader import load_config
from core.api import create_app


def main():
    """
    メイン関数
    
    使用方法:
        python main.py <app_name>
    
    例:
        python main.py ootuki_restaurant
        python main.py insurance
        python main.py legal
    """
    # コマンドライン引数からアプリ名を取得
    if len(sys.argv) < 2:
        print("[ERROR] アプリケーション名を指定してください")
        print("\n使用方法:")
        print("  python main.py <app_name>")
        print("\n例:")
        print("  python main.py ootuki_restaurant")
        print("  python main.py insurance")
        print("  python main.py legal")
        sys.exit(1)
    
    app_name = sys.argv[1]
    
    # アプリ用のシステムプロンプトを読み込み
    try:
        # 設定を読み込み
        config = load_config(app_name)
        
        # プロンプトファイルを読み込み（存在すれば）
        try:
            from importlib import import_module
            prompts_module = import_module(f"apps.{app_name}.prompts")
            system_prompt = getattr(prompts_module, "SYSTEM_PROMPT", None)
            logger.info(f"[OK] システムプロンプトを読み込みました")
        except Exception as e:
            logger.warning(f"⚠️ プロンプトファイルの読み込みに失敗: {e}")
            system_prompt = None
        
        # FastAPIアプリを作成
        app = create_app(config)
        
        # システムプロンプトを設定（存在すれば）
        if system_prompt and hasattr(app, 'ai_engine'):
            app.ai_engine.set_system_prompt(system_prompt)
        
        # サーバー設定を取得
        server_config = config.get_server_config()
        
        # サーバーを起動
        logger.info(f">> {app_name} を起動します...")
        logger.info(f">> URL: http://{server_config['host']}:{server_config['port']}")
        
        uvicorn.run(
            app,
            host=server_config['host'],
            port=server_config['port'],
            log_level="debug"
        )
    
    except FileNotFoundError as e:
        logger.error(f"[ERROR] 設定ファイルエラー: {e}")
        logger.error(f"config/{app_name}.yaml を作成してください")
        sys.exit(1)
    
    except Exception as e:
        logger.error(f"[ERROR] 起動エラー: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

