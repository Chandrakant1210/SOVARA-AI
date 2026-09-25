from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.services.docx_service import generate_approval_note
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


class SaveModifiedRequest(BaseModel):
    text: str
    title: str = "SOVARA AI — Approval Note (Modified)"


class SaveModifiedResponse(BaseModel):
    docx_path: str


@router.post("/review/save-modified", response_model=SaveModifiedResponse)
def save_modified(
    request: SaveModifiedRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Takes human-edited approval note text and saves it as a real DOCX,
    without re-running the agent. Used by the review screen's "Modify"
    flow — the reviewer edits the text directly, and this endpoint
    finalizes it as the actual deliverable.
    """
    docx_path = generate_approval_note(request.text, title=request.title)
    return SaveModifiedResponse(docx_path=docx_path)

