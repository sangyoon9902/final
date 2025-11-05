# server/routers/users.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from uuid import uuid4
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import DBUser

router = APIRouter(prefix="/users", tags=["users"])

class CreateUserReq(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def non_empty(cls, v: str):
        v = (v or "").strip()
        if not v:
            raise ValueError("name is required")
        return v

class CreateUserResp(BaseModel):
    userId: str
    name: str
    createdAt: str

@router.post("", response_model=CreateUserResp)
def create_user(req: CreateUserReq, db: Session = Depends(get_db)):
    new_id = str(uuid4())
    user = DBUser(id=new_id, name=req.name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return CreateUserResp(userId=user.id, name=user.name, createdAt=user.created_at.isoformat())

@router.get("/{user_id}", response_model=CreateUserResp)
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return CreateUserResp(userId=user.id, name=user.name, createdAt=user.created_at.isoformat())
