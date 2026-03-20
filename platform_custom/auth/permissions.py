"""
Permissions

権限管理とアクセス制御
"""

from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .jwt_handler import AuthService
from ..database.connection import get_db
from ..models.user import User, UserRole

# HTTPベアラー認証
security = HTTPBearer()
auth_service = AuthService()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    現在のユーザーを取得
    
    Args:
        credentials: 認証情報
        db: データベースセッション
    
    Returns:
        User: 現在のユーザー
    
    Raises:
        HTTPException: 認証失敗時
    """
    token = credentials.credentials
    
    # トークン検証
    payload = auth_service.verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無効な認証情報です",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # ユーザーID取得
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無効な認証情報です",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # ユーザー取得
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザーが見つかりません",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # アクティブチェック
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="アカウントが無効化されています",
        )
    
    return user


def require_role(*allowed_roles: UserRole):
    """
    特定のロールを要求するデコレータ
    
    Args:
        allowed_roles: 許可するロール
    
    Returns:
        依存性注入関数
    """
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="この操作を実行する権限がありません",
            )
        return current_user
    
    return role_checker


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    スーパー管理者権限を要求
    
    Args:
        current_user: 現在のユーザー
    
    Returns:
        User: 現在のユーザー
    
    Raises:
        HTTPException: 権限不足時
    """
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="スーパー管理者権限が必要です",
        )
    return current_user


def require_org_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    組織管理者権限を要求
    
    Args:
        current_user: 現在のユーザー
    
    Returns:
        User: 現在のユーザー
    
    Raises:
        HTTPException: 権限不足時
    """
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="組織管理者権限が必要です",
        )
    return current_user


def check_organization_access(
    current_user: User,
    target_organization_id: int
) -> bool:
    """
    組織へのアクセス権限をチェック
    
    Args:
        current_user: 現在のユーザー
        target_organization_id: 対象組織ID
    
    Returns:
        bool: アクセス可能かどうか
    """
    # スーパー管理者は全組織にアクセス可能
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    
    # 自分の組織のみアクセス可能
    return current_user.organization_id == target_organization_id
