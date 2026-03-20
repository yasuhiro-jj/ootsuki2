"""
Tenant Config Model

テナント設定のデータモデル
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..database.connection import Base


class TenantConfig(Base):
    """
    テナント設定モデル
    
    各組織のチャットボット設定を保存
    """
    __tablename__ = "tenant_configs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, unique=True, index=True)
    
    # アプリケーション設定
    app_name = Column(String(100), nullable=False)  # ootuki_restaurant, retail, etc.
    
    # YAML設定（全設定をYAML形式で保存）
    config_yaml = Column(Text, nullable=True)
    
    # API Keys（暗号化して保存）
    notion_api_key_encrypted = Column(Text, nullable=True)
    openai_api_key_encrypted = Column(Text, nullable=True)
    
    # Notion Database IDs（JSON形式で保存）
    notion_database_ids = Column(Text, nullable=True)  # JSON文字列
    
    # デプロイ情報
    tenant_url = Column(String(255), nullable=True)  # テナントのURL
    container_id = Column(String(255), nullable=True)  # Dockerコンテナ ID
    
    # タイムスタンプ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # リレーション
    organization = relationship("Organization", back_populates="tenant_config")

    def __repr__(self):
        return f"<TenantConfig(id={self.id}, org_id={self.organization_id}, app='{self.app_name}')>"
