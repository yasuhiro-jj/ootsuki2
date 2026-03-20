"""
Users API

ユーザー管理のAPIエンドポイント
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from ..database.connection import get_db
from ..models.user import User, UserRole
from ..auth.jwt_handler import AuthService
from ..auth.permissions import get_current_user, require_super_admin, require_org_admin, check_organization_access

router = APIRouter(prefix="/api/users", tags=["users"])
auth_service = AuthService()


# Pydanticスキーマ
class UserCreate(BaseModel):
    """ユーザー作成リクエスト"""
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.ORG_MEMBER
    organization_id: Optional[int] = None


class UserUpdate(BaseModel):
    """ユーザー更新リクエスト"""
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[int] = None


class UserResponse(BaseModel):
    """ユーザーレスポンス"""
    id: int
    email: str
    full_name: Optional[str]
    role: UserRole
    organization_id: Optional[int]
    is_active: int
    created_at: str
    last_login: Optional[str]
    
    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """ログインリクエスト"""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """ログインレスポンス"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post("/login", response_model=LoginResponse)
async def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    ログイン
    
    メールアドレスとパスワードで認証し、JWTトークンを発行
    """
    # ユーザーを取得
    user = db.query(User).filter(User.email == login_data.email).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが正しくありません"
        )
    
    # パスワード検証
    if not auth_service.verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが正しくありません"
        )
    
    # アクティブチェック
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="アカウントが無効化されています"
        )
    
    # 最終ログイン時刻を更新
    user.last_login = datetime.utcnow()
    db.commit()
    
    # JWTトークンを生成
    access_token = auth_service.create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role.value,
        organization_id=user.organization_id
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin)
):
    """
    ユーザーを作成
    
    - スーパー管理者: 任意の組織のユーザーを作成可能
    - 組織管理者: 自分の組織のユーザーのみ作成可能
    """
    # 権限チェック
    if current_user.role == UserRole.ORG_ADMIN:
        # 組織管理者は自分の組織のユーザーのみ作成可能
        if user_data.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="他の組織のユーザーを作成する権限がありません"
            )
        
        # 組織管理者はスーパー管理者を作成できない
        if user_data.role == UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="スーパー管理者を作成する権限がありません"
            )
    
    # メールアドレスの重複チェック
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="このメールアドレスは既に使用されています"
        )
    
    # パスワードをハッシュ化
    password_hash = auth_service.hash_password(user_data.password)
    
    # ユーザーを作成
    user = User(
        email=user_data.email,
        password_hash=password_hash,
        full_name=user_data.full_name,
        role=user_data.role,
        organization_id=user_data.organization_id,
        is_active=1,
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


@router.get("", response_model=List[UserResponse])
async def list_users(
    organization_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    ユーザー一覧を取得
    
    - スーパー管理者: 全ユーザーまたは指定組織のユーザーを取得
    - 組織管理者/メンバー: 自分の組織のユーザーのみ取得
    """
    query = db.query(User)
    
    if current_user.role == UserRole.SUPER_ADMIN:
        # スーパー管理者は全ユーザーまたは指定組織のユーザーを取得
        if organization_id is not None:
            query = query.filter(User.organization_id == organization_id)
    else:
        # 自分の組織のユーザーのみ取得
        query = query.filter(User.organization_id == current_user.organization_id)
    
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    現在のユーザー情報を取得
    """
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    ユーザー詳細を取得
    """
    # ユーザーを取得
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ユーザーが見つかりません"
        )
    
    # アクセス権限チェック
    if current_user.role != UserRole.SUPER_ADMIN:
        if user.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="このユーザーにアクセスする権限がありません"
            )
    
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin)
):
    """
    ユーザーを更新
    
    - スーパー管理者: 全ユーザーを更新可能
    - 組織管理者: 自分の組織のユーザーのみ更新可能
    """
    # ユーザーを取得
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ユーザーが見つかりません"
        )
    
    # 権限チェック
    if current_user.role == UserRole.ORG_ADMIN:
        # 組織管理者は自分の組織のユーザーのみ更新可能
        if user.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="このユーザーを更新する権限がありません"
            )
        
        # 組織管理者はスーパー管理者に昇格できない
        if user_data.role == UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="スーパー管理者に昇格する権限がありません"
            )
    
    # 更新
    update_data = user_data.dict(exclude_unset=True)
    
    # パスワードが指定されている場合はハッシュ化
    if "password" in update_data:
        update_data["password_hash"] = auth_service.hash_password(update_data["password"])
        del update_data["password"]
    
    for key, value in update_data.items():
        setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin)
):
    """
    ユーザーを削除
    
    - スーパー管理者: 全ユーザーを削除可能
    - 組織管理者: 自分の組織のユーザーのみ削除可能
    """
    # ユーザーを取得
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ユーザーが見つかりません"
        )
    
    # 権限チェック
    if current_user.role == UserRole.ORG_ADMIN:
        # 組織管理者は自分の組織のユーザーのみ削除可能
        if user.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="このユーザーを削除する権限がありません"
            )
    
    # 自分自身は削除できない
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="自分自身を削除することはできません"
        )
    
    # 削除
    db.delete(user)
    db.commit()
    
    return None
