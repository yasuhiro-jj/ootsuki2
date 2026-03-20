"""
Tenant Configs API

テナント設定管理のAPIエンドポイント
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database.connection import get_db
from ..models.tenant_config import TenantConfig
from ..models.user import User, UserRole
from ..auth.permissions import get_current_user, check_organization_access

router = APIRouter(prefix="/api/tenant-configs", tags=["tenant_configs"])


# Pydanticスキーマ
class TenantConfigCreate(BaseModel):
    """テナント設定作成リクエスト"""
    organization_id: int
    app_name: str
    config_yaml: Optional[str] = None
    notion_api_key_encrypted: Optional[str] = None
    openai_api_key_encrypted: Optional[str] = None
    notion_database_ids: Optional[str] = None


class TenantConfigUpdate(BaseModel):
    """テナント設定更新リクエスト"""
    app_name: Optional[str] = None
    config_yaml: Optional[str] = None
    notion_api_key_encrypted: Optional[str] = None
    openai_api_key_encrypted: Optional[str] = None
    notion_database_ids: Optional[str] = None
    tenant_url: Optional[str] = None
    container_id: Optional[str] = None


class TenantConfigResponse(BaseModel):
    """テナント設定レスポンス"""
    id: int
    organization_id: int
    app_name: str
    config_yaml: Optional[str]
    notion_database_ids: Optional[str]
    tenant_url: Optional[str]
    container_id: Optional[str]
    created_at: str
    updated_at: str
    
    class Config:
        from_attributes = True


@router.post("", response_model=TenantConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_config(
    config_data: TenantConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    テナント設定を作成
    
    - スーパー管理者: 任意の組織の設定を作成可能
    - 組織管理者: 自分の組織の設定のみ作成可能
    """
    # アクセス権限チェック
    if not check_organization_access(current_user, config_data.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="この組織の設定を作成する権限がありません"
        )
    
    # 既存チェック
    existing = db.query(TenantConfig).filter(
        TenantConfig.organization_id == config_data.organization_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="この組織の設定は既に存在します"
        )
    
    # テナント設定を作成
    tenant_config = TenantConfig(
        organization_id=config_data.organization_id,
        app_name=config_data.app_name,
        config_yaml=config_data.config_yaml,
        notion_api_key_encrypted=config_data.notion_api_key_encrypted,
        openai_api_key_encrypted=config_data.openai_api_key_encrypted,
        notion_database_ids=config_data.notion_database_ids,
    )
    
    db.add(tenant_config)
    db.commit()
    db.refresh(tenant_config)
    
    return tenant_config


@router.get("/{organization_id}", response_model=TenantConfigResponse)
async def get_tenant_config(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    テナント設定を取得
    """
    # アクセス権限チェック
    if not check_organization_access(current_user, organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="この組織の設定にアクセスする権限がありません"
        )
    
    # テナント設定を取得
    tenant_config = db.query(TenantConfig).filter(
        TenantConfig.organization_id == organization_id
    ).first()
    
    if not tenant_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="テナント設定が見つかりません"
        )
    
    return tenant_config


@router.put("/{config_id}", response_model=TenantConfigResponse)
async def update_tenant_config(
    config_id: int,
    config_data: TenantConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    テナント設定を更新
    """
    # テナント設定を取得
    tenant_config = db.query(TenantConfig).filter(TenantConfig.id == config_id).first()
    
    if not tenant_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="テナント設定が見つかりません"
        )
    
    # アクセス権限チェック
    if not check_organization_access(current_user, tenant_config.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="この設定を更新する権限がありません"
        )
    
    # 更新
    update_data = config_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tenant_config, key, value)
    
    db.commit()
    db.refresh(tenant_config)
    
    return tenant_config


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    テナント設定を削除
    """
    # テナント設定を取得
    tenant_config = db.query(TenantConfig).filter(TenantConfig.id == config_id).first()
    
    if not tenant_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="テナント設定が見つかりません"
        )
    
    # アクセス権限チェック
    if current_user.role != UserRole.SUPER_ADMIN:
        if not check_organization_access(current_user, tenant_config.organization_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="この設定を削除する権限がありません"
            )
    
    # 削除
    db.delete(tenant_config)
    db.commit()
    
    return None
