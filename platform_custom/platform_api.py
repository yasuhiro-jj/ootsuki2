"""
Platform API

SaaSプラットフォームのメインAPI
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database.connection import init_db
from .api import organizations, users, tenant_configs

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPIアプリケーション
app = FastAPI(
    title="ootsuki2 Platform API",
    description="SaaSプラットフォーム管理API",
    version="0.1.0",
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では適切に設定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(organizations.router)
app.include_router(users.router)
app.include_router(tenant_configs.router)


@app.on_event("startup")
async def startup_event():
    """
    アプリケーション起動時の処理
    """
    logger.info("Starting Platform API...")
    
    # データベース初期化
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")


@app.get("/")
async def root():
    """
    ルートエンドポイント
    """
    return {
        "name": "ootsuki2 Platform API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """
    ヘルスチェック
    """
    return {
        "status": "healthy",
        "database": "connected"
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "platform.platform_api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
