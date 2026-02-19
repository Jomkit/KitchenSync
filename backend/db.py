from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config import settings

DATABASE_URL = settings.database_url

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def create_all() -> None:
    from app.models import Base

    Base.metadata.create_all(bind=engine)
