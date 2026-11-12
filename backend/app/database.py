from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Iterator
from uuid import uuid4

from .security import MVP_PASSWORD, MVP_USERNAME, hash_password


DEFAULT_BOARD_TITLE = "تختهٔ تیم محصول"
DEFAULT_COLUMNS = (
    "ایده‌ها",
    "برنامه‌ریزی",
    "در حال انجام",
    "بازبینی",
    "انجام‌شده",
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL UNIQUE CHECK(length(trim(username)) > 0),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "columns" (
    id TEXT PRIMARY KEY NOT NULL,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK(position >= 0),
    UNIQUE(board_id, position)
);

CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY NOT NULL,
    column_id TEXT NOT NULL REFERENCES "columns"(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL CHECK(position >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(column_id, position)
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    CHECK(
        julianday(created_at) IS NOT NULL
        AND julianday(expires_at) > julianday(created_at)
    )
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires_at
    ON sessions(user_id, expires_at);
"""


def utc_timestamp(value: datetime | None = None) -> str:
    timestamp = value or datetime.now(timezone.utc)
    return timestamp.astimezone(timezone.utc).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(
            self.path,
            timeout=5,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
                connection.commit()
            except BaseException:
                connection.rollback()
                raise

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            connection.executescript(SCHEMA)

        with self.transaction() as connection:
            user = connection.execute(
                "SELECT id FROM users WHERE username = ?",
                (MVP_USERNAME,),
            ).fetchone()
            if user is None:
                user_id = str(uuid4())
                connection.execute(
                    """
                    INSERT INTO users (id, username, password_hash, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        MVP_USERNAME,
                        hash_password(MVP_PASSWORD),
                        utc_timestamp(),
                    ),
                )
            else:
                user_id = user["id"]

            board = connection.execute(
                "SELECT id FROM boards WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if board is None:
                board_id = str(uuid4())
                now = utc_timestamp()
                connection.execute(
                    """
                    INSERT INTO boards (id, user_id, title, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (board_id, user_id, DEFAULT_BOARD_TITLE, now, now),
                )
                connection.executemany(
                    """
                    INSERT INTO "columns" (id, board_id, name, position)
                    VALUES (?, ?, ?, ?)
                    """,
                    [
                        (str(uuid4()), board_id, name, position)
                        for position, name in enumerate(DEFAULT_COLUMNS)
                    ],
                )
