"""
SOVARA AI - Audit Service

Single place that writes audit events. Every event stores a JSON `details`
object; by convention it includes:
  summary  - short human-readable description ("Ran code in sandbox")
  tool     - model or tool involved ("qwen3:8b", "sandbox", "Qdrant")
  result   - outcome shown in the Activity Log ("success", "2 passed", "error")
  run_id   - links related events (e.g. every step of one agent run)
Confidential content (prompts, code, documents) is never stored, only hashes.
"""

import hashlib
import json
import logging

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def record(db: Session, user_id, action: str, details: dict) -> None:
    """Writes one audit event using the caller's session. Raises on failure."""
    clean = {k: v for k, v in details.items() if v is not None}
    db.add(AuditLog(user_id=user_id, action=action, details=json.dumps(clean, default=str)))
    db.commit()


def record_standalone(user_id, action: str, details: dict) -> bool:
    """
    Writes one audit event with its own short-lived session. For code that
    runs outside a request's session (e.g. streaming generators).
    Never raises; returns False (and logs) if the write failed.
    """
    db = SessionLocal()
    try:
        record(db, user_id, action, details)
        return True
    except Exception:
        db.rollback()
        logger.exception("Audit write failed: %s", action)
        return False
    finally:
        db.close()