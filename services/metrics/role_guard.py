"""Role-based access control dependency for FastAPI endpoints.

Usage:
    from role_guard import require_role

    @router.get("/something", dependencies=[require_role('ADMIN', 'OPERATOR')])
    def get_something(...):
        ...
"""

from fastapi import Depends, Header, HTTPException


def require_role(*allowed_roles):
    """FastAPI dependency that checks x-user-role header against allowed roles."""
    def _check(x_user_role: str = Header(...)):
        if x_user_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
    return Depends(_check)
