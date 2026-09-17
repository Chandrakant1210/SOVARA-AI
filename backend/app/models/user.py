import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum
from app.core.guid_type import GUID
import enum
from app.core.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    ENGINEER = "engineer"
    EMPLOYEE = "employee"


class User(Base):
    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.ENGINEER, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
