"""
User Model

ユーザーのデータモデル
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum

from ..database.connection import Base


class UserRole(str, enum.Enum):
    """ユーザー権限"""
    SUPER_ADMIN = "super_admin"  # プラットフォーム全体の管理者
    ORG_ADMIN = "org_admin"  # 組織内の管理者
    ORG_MEMBER = "org_member"  # 組織内の一般ユーザー


class User(Base):
    """
    ユーザーモデル
    
    プラットフォームのユーザーを表すテーブル
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # ユーザー情報
    full_name = Column(String(255), nullable=True)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.ORG_MEMBER)
    
    # 組織との関連
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    
    # アカウント状態
    is_active = Column(Integer, default=1, nullable=False)  # 1: アクティブ, 0: 無効
    
    # タイムスタンプ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)
    
    # リレーション
    organization = relationship("Organization", back_populates="users")

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
