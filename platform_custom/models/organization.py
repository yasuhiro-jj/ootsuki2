"""
Organization Model

組織（テナント）のデータモデル
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum

from ..database.connection import Base


class IndustryType(str, enum.Enum):
    """業種タイプ"""
    RESTAURANT = "restaurant"  # 飲食業
    RETAIL = "retail"  # 小売業
    INSURANCE = "insurance"  # 保険業
    LEGAL = "legal"  # 士業
    REALESTATE = "realestate"  # 不動産業
    HEALTHCARE = "healthcare"  # 医療・ヘルスケア
    EDUCATION = "education"  # 教育
    BEAUTY = "beauty"  # 美容・サロン
    OTHER = "other"  # その他


class OrganizationStatus(str, enum.Enum):
    """組織ステータス"""
    ACTIVE = "active"  # アクティブ
    SUSPENDED = "suspended"  # 停止中
    TRIAL = "trial"  # トライアル中
    CANCELLED = "cancelled"  # キャンセル済み


class Organization(Base):
    """
    組織（テナント）モデル
    
    各企業・店舗を表すテーブル
    """
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    industry_type = Column(SQLEnum(IndustryType), nullable=False, default=IndustryType.OTHER)
    status = Column(SQLEnum(OrganizationStatus), nullable=False, default=OrganizationStatus.TRIAL)
    
    # 連絡先情報
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    
    # サブスクリプション情報（簡易版）
    subscription_plan = Column(String(50), nullable=True)  # starter, business, enterprise
    
    # タイムスタンプ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # リレーション
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    tenant_config = relationship("TenantConfig", back_populates="organization", uselist=False, cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Organization(id={self.id}, name='{self.name}', industry='{self.industry_type}')>"
