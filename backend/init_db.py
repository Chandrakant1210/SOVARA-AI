from app.core.database import Base, engine
from app.models.user import User
from app.models.document import Document
from app.models.audit_log import AuditLog

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Done. Tables created:", list(Base.metadata.tables.keys()))