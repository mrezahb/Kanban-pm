from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import secrets
import sqlite3
from typing import Annotated, Iterator
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles

from .database import Database, utc_timestamp
from .schemas import (
    BoardResponse,
    BoardUpdateRequest,
    LoginRequest,
    UserResponse,
)
from .security import (
    hash_session_token,
    verify_password,
)


SESSION_COOKIE_NAME = "pm_session"
SESSION_LIFETIME = timedelta(days=7)
SESSION_MAX_AGE = int(SESSION_LIFETIME.total_seconds())
ID_QUERY_BATCH_SIZE = 900


def _database_path() -> Path:
    default_path = Path(__file__).resolve().parents[2] / "data" / "kanban.sqlite3"
    return Path(os.environ.get("DATABASE_PATH", str(default_path)))


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_current_user(
    request: Request,
    database: Annotated[Database, Depends(get_database)],
) -> dict[str, str]:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    with database.connection() as connection:
        session = connection.execute(
            """
            SELECT users.id AS user_id, users.username
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
              AND sessions.revoked_at IS NULL
              AND sessions.expires_at > ?
            """,
            (hash_session_token(token), utc_timestamp()),
        ).fetchone()

    if session is None:
        raise HTTPException(status_code=401, detail="Session is invalid or expired")
    return {"id": session["user_id"], "username": session["username"]}


def _load_board(connection: sqlite3.Connection, user_id: str) -> dict[str, object]:
    board = connection.execute(
        "SELECT id, title FROM boards WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")

    columns = connection.execute(
        """
        SELECT id, name
        FROM "columns"
        WHERE board_id = ?
        ORDER BY position
        """,
        (board["id"],),
    ).fetchall()
    cards = connection.execute(
        """
        SELECT cards.id, cards.column_id, cards.title, cards.details
        FROM cards
        JOIN "columns" ON "columns".id = cards.column_id
        WHERE "columns".board_id = ?
        ORDER BY "columns".position, cards.position
        """,
        (board["id"],),
    ).fetchall()
    cards_by_column: dict[str, list[dict[str, str]]] = {
        column["id"]: [] for column in columns
    }
    for card in cards:
        cards_by_column[card["column_id"]].append(
            {
                "id": card["id"],
                "title": card["title"],
                "details": card["details"],
            }
        )

    return {
        "id": board["id"],
        "title": board["title"],
        "columns": [
            {
                "id": column["id"],
                "name": column["name"],
                "cards": cards_by_column[column["id"]],
            }
            for column in columns
        ],
    }


def _existing_column_owners(
    connection: sqlite3.Connection,
    column_ids: list[str],
) -> dict[str, str]:
    owners: dict[str, str] = {}
    for offset in range(0, len(column_ids), ID_QUERY_BATCH_SIZE):
        batch = column_ids[offset : offset + ID_QUERY_BATCH_SIZE]
        placeholders = ",".join("?" for _ in batch)
        rows = connection.execute(
            f'SELECT id, board_id FROM "columns" WHERE id IN ({placeholders})',
            batch,
        ).fetchall()
        owners.update({row["id"]: row["board_id"] for row in rows})
    return owners


def _existing_card_owners(
    connection: sqlite3.Connection,
    card_ids: list[str],
) -> dict[str, str]:
    owners: dict[str, str] = {}
    for offset in range(0, len(card_ids), ID_QUERY_BATCH_SIZE):
        batch = card_ids[offset : offset + ID_QUERY_BATCH_SIZE]
        placeholders = ",".join("?" for _ in batch)
        rows = connection.execute(
            f"""
            SELECT cards.id, "columns".board_id
            FROM cards
            JOIN "columns" ON "columns".id = cards.column_id
            WHERE cards.id IN ({placeholders})
            """,
            batch,
        ).fetchall()
        owners.update({row["id"]: row["board_id"] for row in rows})
    return owners


def _ensure_ids_belong_to_board(
    connection: sqlite3.Connection,
    board_id: str,
    column_ids: list[str],
    card_ids: list[str],
) -> None:
    if any(
        owner != board_id
        for owner in _existing_column_owners(connection, column_ids).values()
    ) or any(
        owner != board_id
        for owner in _existing_card_owners(connection, card_ids).values()
    ):
        raise HTTPException(
            status_code=409,
            detail="Board items cannot be moved between users",
        )


def create_app(database_path: Path | None = None) -> FastAPI:
    database = Database(database_path or _database_path())

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> Iterator[None]:
        database.initialize()
        yield

    app = FastAPI(lifespan=lifespan)
    app.state.database = database

    @app.get("/api/health")
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/auth/login", response_model=UserResponse)
    def login(
        payload: LoginRequest,
        response: Response,
        db: Annotated[Database, Depends(get_database)],
    ) -> dict[str, str]:
        with db.connection() as connection:
            user = connection.execute(
                """
                SELECT id, username, password_hash
                FROM users
                WHERE username = ?
                """,
                (payload.username,),
            ).fetchone()
        if user is None or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        with db.transaction() as connection:
            connection.execute(
                """
                INSERT INTO sessions (
                    id, user_id, token_hash, created_at, expires_at, revoked_at
                )
                VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (
                    str(uuid4()),
                    user["id"],
                    hash_session_token(token),
                    utc_timestamp(now),
                    utc_timestamp(now + SESSION_LIFETIME),
                ),
            )

        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            secure=False,
            samesite="strict",
            path="/",
        )
        return {"id": user["id"], "username": user["username"]}

    @app.post("/api/auth/logout")
    def logout(
        request: Request,
        response: Response,
        db: Annotated[Database, Depends(get_database)],
    ) -> dict[str, str]:
        token = request.cookies.get(SESSION_COOKIE_NAME)
        if token:
            with db.transaction() as connection:
                connection.execute(
                    """
                    UPDATE sessions
                    SET revoked_at = ?
                    WHERE token_hash = ? AND revoked_at IS NULL
                    """,
                    (utc_timestamp(), hash_session_token(token)),
                )
        response.delete_cookie(
            key=SESSION_COOKIE_NAME,
            path="/",
            httponly=True,
            secure=False,
            samesite="strict",
        )
        return {"status": "ok"}

    @app.get("/api/auth/me", response_model=UserResponse)
    def current_user(
        user: Annotated[dict[str, str], Depends(get_current_user)],
    ) -> dict[str, str]:
        return user

    @app.get("/api/board", response_model=BoardResponse)
    def get_board(
        user: Annotated[dict[str, str], Depends(get_current_user)],
        db: Annotated[Database, Depends(get_database)],
    ) -> dict[str, object]:
        with db.connection() as connection:
            return _load_board(connection, user["id"])

    @app.put("/api/board", response_model=BoardResponse)
    def update_board(
        payload: BoardUpdateRequest,
        user: Annotated[dict[str, str], Depends(get_current_user)],
        db: Annotated[Database, Depends(get_database)],
    ) -> dict[str, object]:
        now = utc_timestamp()
        column_ids = [str(column.id) for column in payload.columns if column.id]
        card_ids = [
            str(card.id)
            for column in payload.columns
            for card in column.cards
            if card.id
        ]

        with db.transaction() as connection:
            board = connection.execute(
                "SELECT id FROM boards WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
            if board is None:
                raise HTTPException(status_code=404, detail="Board not found")
            board_id = board["id"]
            _ensure_ids_belong_to_board(
                connection,
                board_id,
                column_ids,
                card_ids,
            )
            existing_column_ids = {
                row["id"]
                for row in connection.execute(
                    'SELECT id FROM "columns" WHERE board_id = ?',
                    (board_id,),
                ).fetchall()
            }
            if not existing_column_ids.issubset(column_ids):
                raise HTTPException(
                    status_code=422,
                    detail="Existing board columns cannot be removed",
                )
            previous_cards = connection.execute(
                """
                SELECT cards.id, cards.column_id, cards.title, cards.details,
                       cards.position, cards.created_at, cards.updated_at
                FROM cards
                JOIN "columns" ON "columns".id = cards.column_id
                WHERE "columns".board_id = ?
                """,
                (board_id,),
            ).fetchall()
            previous_cards_by_id = {card["id"]: card for card in previous_cards}

            connection.execute('DELETE FROM "columns" WHERE board_id = ?', (board_id,))
            for column_position, column in enumerate(payload.columns):
                column_id = str(column.id or uuid4())
                connection.execute(
                    """
                    INSERT INTO "columns" (id, board_id, name, position)
                    VALUES (?, ?, ?, ?)
                    """,
                    (column_id, board_id, column.name, column_position),
                )
                for card_position, card in enumerate(column.cards):
                    card_id = str(card.id or uuid4())
                    previous_card = previous_cards_by_id.get(card_id)
                    unchanged = (
                        previous_card is not None
                        and previous_card["column_id"] == column_id
                        and previous_card["title"] == card.title
                        and previous_card["details"] == card.details
                        and previous_card["position"] == card_position
                    )
                    connection.execute(
                        """
                        INSERT INTO cards (
                            id, column_id, title, details, position,
                            created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            card_id,
                            column_id,
                            card.title,
                            card.details,
                            card_position,
                            previous_card["created_at"] if previous_card else now,
                            previous_card["updated_at"] if unchanged else now,
                        ),
                    )
            connection.execute(
                "UPDATE boards SET updated_at = ? WHERE id = ?",
                (now, board_id),
            )
            return _load_board(connection, user["id"])

    static_dir = Path(
        os.environ.get(
            "STATIC_DIR",
            Path(__file__).resolve().parents[2] / "frontend" / "out",
        )
    )
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
    return app


app = create_app()
