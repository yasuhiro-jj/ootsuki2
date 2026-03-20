"""
Organizations API

組織管理のAPIエンドポイント
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from ..database.connection import get_db
from ..models.organization import Organization, IndustryType, OrganizationStatus
from ..models.user import User, UserRole
from ..auth.permissions import get_current_user, require_super_admin, check_organization_access

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


# Pydanticスキーマ
class OrganizationCreate(BaseModel):
    """組織作成リクエスト"""
    name: str
    industry_type: IndustryType
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    subscription_plan: Optional[str] = "starter"


class OrganizationUpdate(BaseModel):
    """組織更新リクエスト"""
    name: Optional[str] = None
    industry_type: Optional[IndustryType] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    subscription_plan: Optional[str] = None
    status: Optional[OrganizationStatus] = None


class OrganizationResponse(BaseModel):
    """組織レスポンス"""
    id: int
    name: str
    industry_type: IndustryType
    status: OrganizationStatus
    email: Optional[str]
    phone: Optional[str]
    subscription_plan: Optional[str]
    created_at: str
    updated_at: str
    
    class Config:
        from_attributes = True


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    """
    組織を作成
    
    スーパー管理者のみ実行可能
    """
    # 組織を作成
    organization = Organization(
        name=org_data.name,
        industry_type=org_data.industry_type,
        email=org_data.email,
        phone=org_data.phone,
        subscription_plan=org_data.subscription_plan,
        status=OrganizationStatus.TRIAL,
    )
    
    db.add(organization)
    db.commit()
    db.refresh(organization)
    
    return organization


@router.get("", response_model=List[OrganizationResponse])
async def list_organizations(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    組織一覧を取得
    
    - スーパー管理者: 全組織を取得
    - 組織管理者/メンバー: 自分の組織のみ取得
    """
    if current_user.role == UserRole.SUPER_ADMIN:
        # スーパー管理者は全組織を取得
        organizations = db.query(Organization).offset(skip).limit(limit).all()
    else:
        # 自分の組織のみ取得
        if current_user.organization_id is None:
            return []
        
        organization = db.query(Organization).filter(
            Organization.id == current_user.organization_id
        ).first()
        
        organizations = [organization] if organization else []
    
    return organizations


@router.get("/{organization_id}", response_model=OrganizationResponse)
async def get_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    組織詳細を取得
    """
    # アクセス権限チェック
    if not check_organization_access(current_user, organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="この組織にアクセスする権限がありません"
        )
    
    # 組織を取得
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="組織が見つかりません"
        )
    
    return organization


@router.put("/{organization_id}", response_model=OrganizationResponse)
async def update_organization(
    organization_id: int,
    org_data: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    組織を更新
    
    - スーパー管理者: 全組織を更新可能
    - 組織管理者: 自分の組織のみ更新可能
    """
    # アクセス権限チェック
    if current_user.role != UserRole.SUPER_ADMIN:
        if current_user.role != UserRole.ORG_ADMIN or current_user.organization_id != organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="この組織を更新する権限がありません"
            )
    
    # 組織を取得
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="組織が見つかりません"
        )
    
    # 更新
    update_data = org_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(organization, key, value)
    
    db.commit()
    db.refresh(organization)
    
    return organization


@router.delete("/{organization_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    """
    組織を削除
    
    スーパー管理者のみ実行可能
    """
    # 組織を取得
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="組織が見つかりません"
        )
    
    # 削除
    db.delete(organization)
    db.commit()
    
    return None
