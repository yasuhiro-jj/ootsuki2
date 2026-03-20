"""
Database Migrations

データベースマイグレーション管理
"""

import logging
from datetime import date
from sqlalchemy.orm import Session

from .connection import engine, Base, SessionLocal
from ..models import Organization, User, TenantConfig, Subscription, SubscriptionPlan
from ..models.organization import IndustryType, OrganizationStatus
from ..models.user import UserRole
from ..models.subscription import SubscriptionPlanType, SubscriptionStatus

logger = logging.getLogger(__name__)


def create_tables():
    """
    全テーブルを作成
    """
    logger.info("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("All tables created successfully")


def drop_tables():
    """
    全テーブルを削除（開発用）
    """
    logger.warning("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    logger.info("All tables dropped")


def seed_subscription_plans(db: Session):
    """
    サブスクリプションプランの初期データを投入
    
    Args:
        db: データベースセッション
    """
    logger.info("Seeding subscription plans...")
    
    plans = [
        {
            "plan_type": SubscriptionPlanType.STARTER,
            "name": "スタータープラン",
            "description": "基本的なチャットボット機能を提供",
            "price_monthly": 9800,
            "price_yearly": 98000,
            "max_messages_per_month": 1000,
            "max_users": 3,
            "features": '["basic_chatbot", "rag_search", "notion_integration"]',
        },
        {
            "plan_type": SubscriptionPlanType.BUSINESS,
            "name": "ビジネスプラン",
            "description": "中規模ビジネス向けの充実した機能",
            "price_monthly": 29800,
            "price_yearly": 298000,
            "max_messages_per_month": 10000,
            "max_users": 10,
            "features": '["basic_chatbot", "rag_search", "notion_integration", "analytics_dashboard", "priority_support"]',
        },
        {
            "plan_type": SubscriptionPlanType.ENTERPRISE,
            "name": "エンタープライズプラン",
            "description": "大規模企業向けの無制限プラン",
            "price_monthly": 98000,
            "price_yearly": 980000,
            "max_messages_per_month": None,  # 無制限
            "max_users": None,  # 無制限
            "features": '["basic_chatbot", "rag_search", "notion_integration", "analytics_dashboard", "priority_support", "custom_domain", "sla_guarantee"]',
        },
    ]
    
    for plan_data in plans:
        # 既存チェック
        existing = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.plan_type == plan_data["plan_type"]
        ).first()
        
        if not existing:
            plan = SubscriptionPlan(**plan_data)
            db.add(plan)
            logger.info(f"Added plan: {plan_data['name']}")
        else:
            logger.info(f"Plan already exists: {plan_data['name']}")
    
    db.commit()
    logger.info("Subscription plans seeded successfully")


def seed_demo_data(db: Session):
    """
    デモデータを投入（開発用）
    
    Args:
        db: データベースセッション
    """
    logger.info("Seeding demo data...")
    
    # デモ組織を作成
    demo_org = Organization(
        name="デモ飲食店",
        industry_type=IndustryType.RESTAURANT,
        status=OrganizationStatus.TRIAL,
        email="demo@example.com",
        phone="03-1234-5678",
        subscription_plan="starter",
    )
    db.add(demo_org)
    db.flush()  # IDを取得するためにflush
    
    # デモユーザーを作成（パスワード: demo123）
    from ..auth.jwt_handler import AuthService
    auth_service = AuthService()
    
    demo_user = User(
        email="demo@example.com",
        password_hash=auth_service.hash_password("demo123"),
        full_name="デモユーザー",
        role=UserRole.ORG_ADMIN,
        organization_id=demo_org.id,
        is_active=1,
    )
    db.add(demo_user)
    
    # デモテナント設定を作成
    demo_config = TenantConfig(
        organization_id=demo_org.id,
        app_name="ootuki_restaurant",
        config_yaml="# Demo configuration",
    )
    db.add(demo_config)
    
    # デモサブスクリプションを作成
    starter_plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.plan_type == SubscriptionPlanType.STARTER
    ).first()
    
    if starter_plan:
        demo_subscription = Subscription(
            organization_id=demo_org.id,
            plan_id=starter_plan.id,
            status=SubscriptionStatus.TRIAL,
            start_date=date.today(),
            auto_renew=1,
        )
        db.add(demo_subscription)
    
    db.commit()
    logger.info("Demo data seeded successfully")


def run_migrations():
    """
    マイグレーションを実行
    """
    logger.info("Running migrations...")
    
    # テーブル作成
    create_tables()
    
    # セッション作成
    db = SessionLocal()
    
    try:
        # サブスクリプションプランの初期データ投入
        seed_subscription_plans(db)
        
        # デモデータ投入（オプション）
        # seed_demo_data(db)
        
        logger.info("Migrations completed successfully")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    # ロギング設定
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # マイグレーション実行
    run_migrations()
