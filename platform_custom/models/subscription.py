"""
Subscription Model

サブスクリプション（課金）のデータモデル
"""

from datetime import datetime, date
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Date, Enum as SQLEnum, Numeric
from sqlalchemy.orm import relationship
import enum

from ..database.connection import Base


class SubscriptionPlanType(str, enum.Enum):
    """サブスクリプションプランタイプ"""
    STARTER = "starter"  # スターター（¥9,800/月）
    BUSINESS = "business"  # ビジネス（¥29,800/月）
    ENTERPRISE = "enterprise"  # エンタープライズ（¥98,000/月）


class SubscriptionStatus(str, enum.Enum):
    """サブスクリプションステータス"""
    ACTIVE = "active"  # アクティブ
    TRIAL = "trial"  # トライアル中
    PAST_DUE = "past_due"  # 支払い遅延
    CANCELLED = "cancelled"  # キャンセル済み
    EXPIRED = "expired"  # 期限切れ


class SubscriptionPlan(Base):
    """
    サブスクリプションプランマスタ
    
    利用可能なプランの定義
    """
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, index=True)
    plan_type = Column(SQLEnum(SubscriptionPlanType), nullable=False, unique=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    
    # 料金
    price_monthly = Column(Numeric(10, 2), nullable=False)  # 月額料金
    price_yearly = Column(Numeric(10, 2), nullable=True)  # 年額料金
    
    # 制限
    max_messages_per_month = Column(Integer, nullable=True)  # 月間メッセージ数上限（NULL=無制限）
    max_users = Column(Integer, nullable=True)  # ユーザー数上限
    
    # 機能フラグ
    features = Column(String(1000), nullable=True)  # JSON形式で機能リストを保存
    
    # Stripe連携
    stripe_price_id = Column(String(255), nullable=True)  # Stripe Price ID
    
    # タイムスタンプ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<SubscriptionPlan(id={self.id}, type='{self.plan_type}', name='{self.name}')>"


class Subscription(Base):
    """
    サブスクリプションモデル
    
    組織のサブスクリプション情報
    """
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    
    # ステータス
    status = Column(SQLEnum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.TRIAL)
    
    # 期間
    start_date = Column(Date, nullable=False, default=date.today)
    end_date = Column(Date, nullable=True)
    trial_end_date = Column(Date, nullable=True)
    
    # 自動更新
    auto_renew = Column(Integer, default=1, nullable=False)  # 1: 自動更新, 0: 手動更新
    
    # Stripe連携
    stripe_subscription_id = Column(String(255), nullable=True)  # Stripe Subscription ID
    stripe_customer_id = Column(String(255), nullable=True)  # Stripe Customer ID
    
    # 使用量トラッキング
    current_period_messages = Column(Integer, default=0, nullable=False)  # 当月のメッセージ数
    
    # タイムスタンプ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # リレーション
    organization = relationship("Organization", back_populates="subscriptions")
    plan = relationship("SubscriptionPlan")

    def __repr__(self):
        return f"<Subscription(id={self.id}, org_id={self.organization_id}, status='{self.status}')>"
