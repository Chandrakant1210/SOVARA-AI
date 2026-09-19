from fastapi import APIRouter, Depends
from app.services.security_service import get_security_status
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/security/status")
def security_status(current_user: User = Depends(get_current_user)):
    return get_security_status()
