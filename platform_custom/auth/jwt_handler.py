"""
JWT Handler

JWT認証の実装
"""

import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext

# JWT設定
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24時間

# パスワードハッシュ化
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """
    認証サービス
    
    JWT トークンの生成・検証、パスワードのハッシュ化を提供
    """
    
    def __init__(self):
        self.secret_key = SECRET_KEY
        self.algorithm = ALGORITHM
        self.access_token_expire_minutes = ACCESS_TOKEN_EXPIRE_MINUTES
    
    def create_access_token(
        self,
        user_id: int,
        email: str,
        role: str,
        organization_id: Optional[int] = None,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """
        アクセストークンを生成
        
        Args:
            user_id: ユーザーID
            email: メールアドレス
            role: ユーザーロール
            organization_id: 組織ID
            expires_delta: 有効期限（デフォルト: 24時間）
        
        Returns:
            JWT トークン
        """
        to_encode = {
            "sub": str(user_id),
            "email": email,
            "role": role,
            "org_id": organization_id,
        }
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        
        to_encode.update({"exp": expire})
        
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        トークンを検証してペイロードを取得
        
        Args:
            token: JWT トークン
        
        Returns:
            ペイロード（検証失敗時は None）
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except JWTError:
            return None
    
    def hash_password(self, password: str) -> str:
        """
        パスワードをハッシュ化
        
        Args:
            password: 平文パスワード
        
        Returns:
            ハッシュ化されたパスワード
        """
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """
        パスワードを検証
        
        Args:
            plain_password: 平文パスワード
            hashed_password: ハッシュ化されたパスワード
        
        Returns:
            検証結果
        """
        return pwd_context.verify(plain_password, hashed_password)
