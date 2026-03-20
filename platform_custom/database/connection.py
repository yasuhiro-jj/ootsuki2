"""
Database Connection

PostgreSQL接続とセッション管理
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Generator

# 環境変数からデータベースURLを取得
DATABASE_URL = os.getenv(
    "PLATFORM_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/ootsuki_platform"
)

# SQLAlchemyエンジンの作成
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False  # 本番環境ではFalse
)

# セッションファクトリー
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ベースクラス
Base = declarative_base()


def get_db() -> Generator:
    """
    データベースセッションを取得
    
    FastAPIの依存性注入で使用
    
    Yields:
        Session: データベースセッション
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    データベースの初期化
    
    全テーブルを作成
    """
    Base.metadata.create_all(bind=engine)
