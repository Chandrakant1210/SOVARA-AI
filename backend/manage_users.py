"""
SOVARA AI - user administration for server operators.

Run from backend/ with the venv active:
    python manage_users.py list
    python manage_users.py set-role EMAIL ROLE      (ROLE: admin, manager, engineer, employee)

Roles can't be changed through the web app (no self-escalation). This tool
needs shell access to the server, and every change is written to the audit log.
"""

import argparse
import sys

from sqlalchemy import func

import app.models.user  # noqa: F401  (registers the users table)
from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.services.audit_service import record


def list_users() -> None:
    db = SessionLocal()
    try:
        for u in db.query(User).order_by(User.email).all():
            print(f"{u.email:<32} {u.role.value}")
    finally:
        db.close()


def set_role(email: str, role_name: str) -> int:
    try:
        role = UserRole(role_name.lower())
    except ValueError:
        print(f"Unknown role '{role_name}'. Use one of: {', '.join(r.value for r in UserRole)}")
        return 1

    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
        if not user:
            print(f"No user with email '{email}'")
            return 1
        old = user.role
        if old == role:
            print(f"{user.email} is already {role.value}")
            return 0
        if old == UserRole.ADMIN and db.query(User).filter(User.role == UserRole.ADMIN).count() == 1:
            print("Refusing to demote the last admin; promote another admin first.")
            return 1

        user.role = role
        record(db, None, "user.role_change", {
            "summary": f"Set role of {user.email} to {role.value}",
            "tool": "admin CLI",
            "result": "success",
            "target_user": user.email,
            "from_role": old.value,
            "to_role": role.value,
        })  # commits the role change and its audit row together
        print(f"{user.email}: {old.value} -> {role.value}")
        return 0
    except Exception as e:
        db.rollback()
        print(f"Failed, nothing changed: {e}")
        return 1
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="SOVARA user administration")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="List users and roles")
    p = sub.add_parser("set-role", help="Change a user's role")
    p.add_argument("email")
    p.add_argument("role")
    args = parser.parse_args()

    if args.command == "list":
        list_users()
        return 0
    return set_role(args.email, args.role)


if __name__ == "__main__":
    sys.exit(main())