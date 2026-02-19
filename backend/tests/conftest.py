from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import os

import pytest

os.environ["APP_ENV"] = "test"

from app import create_app
from app.models import Base, User
from db import SessionLocal, engine


@pytest.fixture()
def app_client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as session:
        session.add_all(
            [
                User(
                    email="kitchen@example.com",
                    password="pass",
                    role="kitchen",
                    display_name="Kitchen",
                ),
                User(
                    email="foh@example.com",
                    password="pass",
                    role="foh",
                    display_name="Front Of House",
                ),
                User(
                    email="online@example.com",
                    password="pass",
                    role="online",
                    display_name="Online",
                ),
            ]
        )
        session.commit()

    app = create_app()
    app.config["TESTING"] = True

    with app.test_client() as client:
        yield client

    Base.metadata.drop_all(bind=engine)
