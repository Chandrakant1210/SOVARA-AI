"""
SOVARA AI - Activity Log API

Read access to the audit log: the activity table, per-run traces, and a
CSV export for compliance. Managers and admins see all events; other
roles see only their own.
"""

import csv
import io
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.services.audit_service import record

logger = logging.getLogger(__name__)

router = APIRouter()

VIEW_ALL_ROLES = {UserRole.ADMIN, UserRole.MANAGER}

# One row per user-visible action in the Activity Log. Intermediate events
# (agent steps, run starts) appear only in the run trace.
HEADLINE_ACTIONS = (
    "agent.run.result",
    "sandbox.result",
    "sandbox.generate.result",
    "document.upload",
    "scan.extract",
    "review.decision",
    "review.save_modified",
    "registry.register",
    "registry.reload",
    "audit.export",
    "user.role_change",
)

MAX_EXPORT_ROWS = 5_000


def _scoped(db: Session, user: User):
    query = db.query(AuditLog)
    if user.role not in VIEW_ALL_ROLES:
        query = query.filter(AuditLog.user_id == user.id)
    return query


def _user_names(db: Session, rows: list[AuditLog]) -> dict[str, str]:
    ids = {r.user_id for r in rows if r.user_id}
    if not ids:
        return {}
    return {str(u.id): u.email for u in db.query(User).filter(User.id.in_(ids)).all()}


# Display defaults per action. Events written before summaries were recorded
# get their display values derived from the fields they did store; the
# stored audit rows themselves are never modified.
DEFAULT_SUMMARY = {
    "sandbox.result": "Ran code in sandbox",
    "sandbox.run": "Ran code in sandbox",
    "sandbox.generate.result": "Generated code",
    "sandbox.generate": "Generated code",
    "registry.reload": "Reloaded model registry",
    "registry.register": "Registered model",
    "agent.run.result": "Agent run",
    "audit.export": "Exported activity log (CSV)",
}
DEFAULT_TOOL = {
    "sandbox.result": "sandbox",
    "sandbox.run": "sandbox",
    "registry.reload": "registry",
    "registry.register": "registry",
}


def _derived_result(action: str, d: dict) -> Optional[str]:
    if action == "sandbox.result":
        if d.get("timed_out"):
            return "timed out"
        if d.get("test_summary"):
            return d["test_summary"]
        if d.get("exit_code") is not None:
            return f"exit {d['exit_code']}"
    if action == "sandbox.generate.result":
        return "success"
    return None


def _row(r: AuditLog, names: dict[str, str]) -> dict:
    try:
        d = json.loads(r.details) if r.details else {}
    except ValueError:
        d = {}
    summary = d.get("summary")
    if r.action == "sandbox.result" or not summary:
        summary = DEFAULT_SUMMARY.get(r.action, summary or r.action)
    return {
        "id": str(r.id),
        "time": r.created_at.isoformat() if r.created_at else None,
        "user": names.get(str(r.user_id), "system") if r.user_id else "system",
        "action": r.action,
        "summary": summary,
        "tool": d.get("tool") or d.get("model") or DEFAULT_TOOL.get(r.action),
        "result": d.get("result") or _derived_result(r.action, d),
        "run_id": d.get("run_id"),
        "step": d.get("step"),
        "detail": d.get("detail") or d.get("error"),
        "duration_ms": d.get("duration_ms"),
    }


@router.get("/audit/events")
def list_events(
    limit: int = Query(50, ge=1, le=200),
    before: Optional[datetime] = Query(None, description="Return events older than this time (for paging)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Activity Log rows, newest first. Page with `before` = the last row's time."""
    query = _scoped(db, current_user).filter(AuditLog.action.in_(HEADLINE_ACTIONS))
    if before:
        query = query.filter(AuditLog.created_at < before)
    rows = query.order_by(AuditLog.created_at.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    names = _user_names(db, rows)
    return {
        "events": [_row(r, names) for r in rows],
        "has_more": has_more,
        "scope": "all" if current_user.role in VIEW_ALL_ROLES else "own",
    }


@router.get("/audit/runs/{run_id}")
def run_trace(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every audit event of one agent run, oldest first."""
    # run_id is a validated UUID, so it can't smuggle LIKE wildcards.
    rows = (
        _scoped(db, current_user)
        .filter(AuditLog.details.like(f'%"run_id": "{run_id}"%'))
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Run not found")
    names = _user_names(db, rows)
    events = [_row(r, names) for r in rows]
    result = next((e for e in reversed(events) if e["action"] == "agent.run.result"), None)
    return {
        "run_id": str(run_id),
        "user": events[0]["user"],
        "started": events[0]["time"],
        "status": result["result"] if result else "running",
        "summary": result["summary"] if result else "Agent run in progress",
        "steps": [e for e in events if e["action"] == "agent.step"],
        "events": events,
    }


def _csv_safe(value) -> str:
    """Neutralises spreadsheet formulas (CSV injection) in exported cells."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/audit/export.csv")
def export_csv(
    include_steps: bool = Query(False, description="Also export every agent step"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """CSV export of the Activity Log for compliance. The export itself is audited."""
    query = _scoped(db, current_user)
    if not include_steps:
        query = query.filter(AuditLog.action.in_(HEADLINE_ACTIONS))
    rows = query.order_by(AuditLog.created_at.desc()).limit(MAX_EXPORT_ROWS).all()
    names = _user_names(db, rows)

    try:
        record(db, current_user.id, "audit.export", {
            "summary": "Exported activity log (CSV)", "tool": "Activity Log",
            "result": f"{len(rows)} rows", "include_steps": include_steps,
        })
    except Exception:
        db.rollback()
        logger.exception("Audit write failed; refusing export")
        raise HTTPException(status_code=503, detail="Audit log unavailable; export was not created")

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    columns = ["time", "user", "action", "summary", "tool", "result", "run_id", "step", "detail", "duration_ms"]
    writer.writerow(columns)
    for r in rows:
        data = _row(r, names)
        writer.writerow([_csv_safe(data[c]) for c in columns])

    filename = f"sovara-activity-{datetime.utcnow():%Y%m%d-%H%M%S}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )