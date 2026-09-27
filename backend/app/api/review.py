"""
SOVARA AI - Review & Sign-off API

Human-in-the-loop decisions on agent deliverables. Rules:
- only managers and admins can sign off (approve, reject, or modify)
- nobody signs off a run they started themselves (segregation of duties);
  the starter is taken from the run's audit trail, never from the client
- one decision per run; decisions are never overwritten
Every decision is written to the audit log.
"""

import json
import logging
import os
import threading
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.services.audit_service import record, record_standalone
from app.services.docx_service import generate_approval_note, read_approval_note

logger = logging.getLogger(__name__)

router = APIRouter()

SIGNOFF_ROLES = {UserRole.ADMIN, UserRole.MANAGER}
MAX_NOTE_CHARS = 50_000
MAX_COMMENT_CHARS = 1_000

# Serializes "check no decision exists, then write one" so two reviewers
# clicking at the same moment can't both sign the same run.
_decision_lock = threading.Lock()


class SaveModifiedRequest(BaseModel):
    text: str = Field(..., max_length=MAX_NOTE_CHARS)
    title: str = Field("SOVARA AI - Approval Note (Modified)", max_length=200)
    run_id: Optional[uuid.UUID] = None


class SaveModifiedResponse(BaseModel):
    docx_path: str


class DecisionRequest(BaseModel):
    run_id: uuid.UUID
    decision: Literal["approved", "rejected", "modified"]
    comment: str = Field("", max_length=MAX_COMMENT_CHARS)
    docx_path: Optional[str] = Field(None, max_length=500)  # for "modified": the edited note


def _run_events(db: Session, run_id: uuid.UUID, action: str) -> list[AuditLog]:
    # run_id is a validated UUID, so it can't smuggle LIKE wildcards.
    return (
        db.query(AuditLog)
        .filter(AuditLog.action == action, AuditLog.details.like(f'%"run_id": "{run_id}"%'))
        .order_by(AuditLog.created_at.asc())
        .all()
    )


def _decision_details(row: AuditLog) -> dict:
    try:
        return json.loads(row.details or "{}")
    except ValueError:
        return {}


def _signoff_state(db: Session, run_id: uuid.UUID, user: User) -> dict:
    """Whether this user may decide on this run, and why not if they can't."""
    starts = _run_events(db, run_id, "agent.run.start")
    if not starts:
        raise HTTPException(status_code=404, detail="Run not found")
    started_by = starts[0].user_id

    decisions = _run_events(db, run_id, "review.decision")
    if decisions:
        d = _decision_details(decisions[0])
        reviewer = db.query(User).filter(User.id == decisions[0].user_id).first()
        return {
            "decided": True, "decision": d.get("result"), "comment": d.get("comment"),
            "reviewer": reviewer.email if reviewer else "unknown",
            "decided_at": decisions[0].created_at.isoformat() if decisions[0].created_at else None,
            "can_decide": False, "reason": "A decision has already been recorded for this run.",
        }

    results = _run_events(db, run_id, "agent.run.result")
    finished_ok = bool(results) and _decision_details(results[-1]).get("result") == "success"

    reason = None
    if user.role not in SIGNOFF_ROLES:
        reason = "Only managers and admins can sign off. Ask a manager to review this note."
    elif str(started_by) == str(user.id):
        reason = "You started this run, so a different manager or admin must sign it off."
    elif not finished_ok:
        reason = "This run did not finish successfully, so there is nothing to sign off."
    return {"decided": False, "decision": None, "comment": None, "reviewer": None, "decided_at": None,
            "can_decide": reason is None, "reason": reason}


@router.get("/review/runs/{run_id}/status")
def signoff_status(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current sign-off state of a run, and whether this user may decide."""
    return _signoff_state(db, run_id, current_user)


@router.post("/review/decision")
def decide(
    request: DecisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Records an approve / reject / modify decision. One decision per run."""
    with _decision_lock:
        state = _signoff_state(db, request.run_id, current_user)
        if not state["can_decide"]:
            status = 409 if state["decided"] else 403
            raise HTTPException(status_code=status, detail=state["reason"])

        results = _run_events(db, request.run_id, "agent.run.result")
        document = _decision_details(results[-1]).get("document") if results else None
        if request.decision == "modified" and request.docx_path:
            document = os.path.basename(request.docx_path)

        verb = {"approved": "Signed off", "rejected": "Rejected", "modified": "Modified and signed off"}[request.decision]
        try:
            record(db, current_user.id, "review.decision", {
                "run_id": str(request.run_id),
                "summary": f"{verb} {document}" if document else verb,
                "tool": "Review",
                "result": request.decision,
                "comment": request.comment.strip() or None,
                "document": document,
            })
        except Exception:
            db.rollback()
            logger.exception("Audit write failed; decision not recorded")
            raise HTTPException(status_code=503, detail="Audit log unavailable; the decision was not recorded")

        return _signoff_state(db, request.run_id, current_user)


@router.post("/review/save-modified", response_model=SaveModifiedResponse)
def save_modified(
    request: SaveModifiedRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Takes human-edited approval note text and saves it as a real DOCX,
    without re-running the agent. The sign-off itself is a separate
    decision (POST /review/decision with "modified").
    """
    docx_path = generate_approval_note(request.text, title=request.title)
    record_standalone(current_user.id, "review.save_modified", {
        "run_id": str(request.run_id) if request.run_id else None,
        "summary": "Edited approval note", "tool": "python-docx",
        "result": "saved", "document": os.path.basename(docx_path),
    })
    return SaveModifiedResponse(docx_path=docx_path)


@router.get("/review/queue")
def review_queue(
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Successful agent runs with their sign-off state, newest first.
    Managers and admins see every run; other roles see their own.
    """
    runs_q = db.query(AuditLog).filter(
        AuditLog.action == "agent.run.result",
        AuditLog.details.like('%"result": "success"%'),
    )
    if current_user.role not in SIGNOFF_ROLES:
        runs_q = runs_q.filter(AuditLog.user_id == current_user.id)
    runs = runs_q.order_by(AuditLog.created_at.desc()).limit(limit).all()

    decisions = {}
    for row in db.query(AuditLog).filter(AuditLog.action == "review.decision").order_by(AuditLog.created_at.asc()).all():
        d = _decision_details(row)
        decisions.setdefault(d.get("run_id"), (row, d))  # first decision is the one that counts

    user_ids = {r.user_id for r in runs} | {row.user_id for row, _ in decisions.values()}
    emails = {str(u.id): u.email for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    items = []
    for r in runs:
        d = _decision_details(r)
        run_id = d.get("run_id")
        decision = decisions.get(run_id)
        own_run = str(r.user_id) == str(current_user.id)
        items.append({
            "run_id": run_id,
            "document": d.get("document"),
            "started_by": emails.get(str(r.user_id), "unknown"),
            "finished_at": r.created_at.isoformat() if r.created_at else None,
            "status": decision[1].get("result") if decision else "pending",
            "reviewer": emails.get(str(decision[0].user_id), "unknown") if decision else None,
            "can_decide": not decision and current_user.role in SIGNOFF_ROLES and not own_run,
        })

    return {
        "items": items,
        "pending_for_you": sum(1 for i in items if i["can_decide"]),
        "scope": "all" if current_user.role in SIGNOFF_ROLES else "own",
    }


@router.get("/review/runs/{run_id}/note")
def review_note(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    The note to review, read from the generated .docx on the server. For a
    "modified" decision this is the edited version. Available to the run's
    starter, managers and admins; the file location comes from the audit log.
    """
    results = _run_events(db, run_id, "agent.run.result")
    if not results:
        raise HTTPException(status_code=404, detail="Run not found")
    result = results[-1]
    if current_user.role not in SIGNOFF_ROLES and str(result.user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Run not found")

    document = _decision_details(result).get("document")
    decisions = _run_events(db, run_id, "review.decision")
    if decisions:
        dd = _decision_details(decisions[0])
        if dd.get("result") == "modified" and dd.get("document"):
            document = dd["document"]
    if not document:
        raise HTTPException(status_code=404, detail="This run produced no document")

    try:
        text = read_approval_note(document)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    sources = _decision_details(result).get("sources") or []
    return {"run_id": str(run_id), "document": document, "text": text, "citations": sources}