import sqlite3
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.assistant import AssistantResponseError
from backend.app.database import Database, utc_timestamp
from backend.app.main import SESSION_COOKIE_NAME, create_app
from backend.app.openrouter import OpenRouterRequestError
from backend.app.schemas import AssistantOutput
from backend.app.security import hash_password, hash_session_token


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "kanban.sqlite3")
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient):
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "user"
    return response


def test_first_start_creates_schema_and_default_board(client: TestClient) -> None:
    database: Database = client.app.state.database
    assert database.path.exists()
    assert client.get("/api/health").json() == {"status": "ok"}

    with database.connection() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert {"users", "boards", "columns", "cards", "sessions"} <= tables
        user = connection.execute(
            "SELECT username, password_hash FROM users"
        ).fetchone()
        assert user["username"] == "user"
        assert user["password_hash"] != "password"
        board_count = connection.execute("SELECT COUNT(*) FROM boards").fetchone()[0]
        assert board_count == 1

    login_response = login(client)
    cookie_header = login_response.headers["set-cookie"].lower()
    assert "max-age=604800" in cookie_header
    assert "httponly" in cookie_header
    assert "samesite=strict" in cookie_header
    board = client.get("/api/board").json()
    assert [column["name"] for column in board["columns"]] == [
        "ایده‌ها",
        "برنامه‌ریزی",
        "در حال انجام",
        "بازبینی",
        "انجام‌شده",
    ]
    assert all(column["cards"] == [] for column in board["columns"])
    token = client.cookies.get(SESSION_COOKIE_NAME)
    assert token is not None
    with database.connection() as connection:
        session = connection.execute(
            "SELECT token_hash, created_at, expires_at FROM sessions"
        ).fetchone()
    created_at = datetime.fromisoformat(session["created_at"].replace("Z", "+00:00"))
    expires_at = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
    assert expires_at - created_at == timedelta(days=7)
    assert session["token_hash"] == hash_session_token(token)
    assert session["token_hash"] != token


@pytest.mark.parametrize(
    "credentials",
    [
        {"username": "user", "password": "wrong"},
        {"username": "other", "password": "password"},
    ],
)
def test_login_rejects_invalid_credentials(
    client: TestClient,
    credentials: dict[str, str],
) -> None:
    response = client.post("/api/auth/login", json=credentials)
    assert response.status_code == 401
    assert SESSION_COOKIE_NAME not in response.cookies


def test_board_requires_a_valid_session(client: TestClient) -> None:
    assert client.get("/api/board").status_code == 401
    assert client.put("/api/board", json={"columns": []}).status_code == 401


def test_board_changes_and_session_survive_restart(tmp_path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    with TestClient(create_app(database_path)) as client:
        login(client)
        original = client.get("/api/board").json()
        columns = original["columns"]
        create_payload = {
            "columns": [
                {
                    **columns[0],
                    "name": "اولویت‌دار",
                    "cards": [
                        {"title": "کارت تازه", "details": "شرح"},
                        {"title": "کارت حذف‌شونده", "details": "شرح"},
                    ],
                },
                *columns[1:],
                {"name": "ستون افزوده", "cards": []},
            ]
        }
        created = client.put("/api/board", json=create_payload)
        assert created.status_code == 200
        created_board = created.json()
        card = created_board["columns"][0]["cards"][0]
        deleted_card_id = created_board["columns"][0]["cards"][1]["id"]
        created_column_id = created_board["columns"][-1]["id"]

        updated_columns = created_board["columns"]
        updated_columns[0]["cards"] = []
        updated_columns[1]["cards"].append(
            {
                "id": card["id"],
                "title": "کارت ویرایش‌شده",
                "details": "به ستون دیگری منتقل شد",
            }
        )
        updated = client.put("/api/board", json={"columns": updated_columns})
        assert updated.status_code == 200
        updated_board = updated.json()
        assert len(updated_board["columns"]) == 6
        assert {
            column["id"] for column in updated_board["columns"][:-1]
        } == {column["id"] for column in original["columns"]}
        assert updated_board["columns"][1]["cards"] == [
            {
                "id": card["id"],
                "title": "کارت ویرایش‌شده",
                "details": "به ستون دیگری منتقل شد",
            }
        ]
        assert any(
            column["id"] == created_column_id
            for column in updated_board["columns"]
        )
        assert all(
            item["id"] != deleted_card_id
            for column in updated_board["columns"]
            for item in column["cards"]
        )
        session_token = client.cookies.get(SESSION_COOKIE_NAME)

    with TestClient(create_app(database_path)) as restarted:
        restarted.cookies.set(SESSION_COOKIE_NAME, session_token)
        assert restarted.get("/api/auth/me").status_code == 200
        persisted = restarted.get("/api/board").json()
        assert persisted == updated_board


def test_board_update_rejects_invalid_data_without_mutation(
    client: TestClient,
) -> None:
    login(client)
    before = client.get("/api/board").json()
    payload = {
        "columns": [
            {
                "id": before["columns"][0]["id"],
                "name": " ",
                "cards": [],
            }
        ]
    }
    response = client.put("/api/board", json=payload)
    assert response.status_code == 422
    response = client.put("/api/board", json={"columns": before["columns"][1:]})
    assert response.status_code == 422
    assert client.get("/api/board").json() == before


def test_logout_revokes_the_persisted_session(client: TestClient) -> None:
    login(client)
    token = client.cookies.get(SESSION_COOKIE_NAME)

    assert client.post("/api/auth/logout").json() == {"status": "ok"}
    assert client.get("/api/auth/me").status_code == 401
    client.cookies.set(SESSION_COOKIE_NAME, token)
    assert client.get("/api/board").status_code == 401


def test_expired_session_is_rejected(client: TestClient) -> None:
    login(client)
    token = client.cookies.get(SESSION_COOKIE_NAME)
    database: Database = client.app.state.database
    with database.transaction() as connection:
        connection.execute(
            """
            UPDATE sessions
            SET created_at = ?, expires_at = ?
            WHERE token_hash = ?
            """,
            (
                "2000-01-01T00:00:00.000000Z",
                "2000-01-08T00:00:00.000000Z",
                hash_session_token(token),
            ),
        )
    assert client.get("/api/auth/me").status_code == 401


def test_users_cannot_read_or_reassign_another_users_board(
    client: TestClient,
) -> None:
    login(client)
    own_board = client.get("/api/board").json()
    own_column_id = own_board["columns"][0]["id"]
    own_token = client.cookies.get(SESSION_COOKIE_NAME)
    database: Database = client.app.state.database

    other_user_id = str(uuid4())
    other_board_id = str(uuid4())
    other_column_id = str(uuid4())
    other_token = "other-user-session-token"
    now = utc_timestamp()
    with database.transaction() as connection:
        connection.execute(
            """
            INSERT INTO users (id, username, password_hash, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                other_user_id,
                "second-user",
                hash_password("different-password"),
                now,
            ),
        )
        connection.execute(
            """
            INSERT INTO boards (id, user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (other_board_id, other_user_id, "Private board", now, now),
        )
        connection.execute(
            """
            INSERT INTO "columns" (id, board_id, name, position)
            VALUES (?, ?, ?, 0)
            """,
            (other_column_id, other_board_id, "Private",),
        )
        connection.execute(
            """
            INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                other_user_id,
                hash_session_token(other_token),
                now,
                utc_timestamp(datetime.now(timezone.utc) + timedelta(days=7)),
            ),
        )

    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE_NAME, other_token)
    other_board = client.get("/api/board").json()
    assert other_board["id"] == other_board_id
    assert other_board["title"] == "Private board"
    rejected = client.put(
        "/api/board",
        json={
            "columns": [
                {
                    "id": own_column_id,
                    "name": "Attempt to reassign",
                    "cards": [],
                }
            ]
        },
    )
    assert rejected.status_code == 409

    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE_NAME, own_token)
    assert client.get("/api/board").json() == own_board


def test_database_enforces_one_board_per_user(client: TestClient) -> None:
    database: Database = client.app.state.database
    with database.connection() as connection:
        user_id = connection.execute("SELECT id FROM users").fetchone()["id"]
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO boards (id, user_id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(uuid4()), user_id, "Duplicate", utc_timestamp(), utc_timestamp()),
            )


def test_assistant_chat_requires_a_valid_session(
    client: TestClient,
    monkeypatch,
) -> None:
    def fail_if_called(*args, **kwargs):
        raise AssertionError("Assistant must not be called without a session")

    monkeypatch.setattr(main, "respond_to_chat", fail_if_called)

    response = client.post(
        "/api/assistant/chat",
        json={"message": "Hello", "history": []},
    )

    assert response.status_code == 401


def test_assistant_text_reply_does_not_change_board(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    board = client.get("/api/board").json()
    captured: dict[str, object] = {}

    def fake_response(board_data, message, history):
        captured["board"] = board_data
        captured["message"] = message
        captured["history"] = history
        return AssistantOutput(reply="Here is an answer.", actions=[])

    monkeypatch.setattr(main, "respond_to_chat", fake_response)
    response = client.post(
        "/api/assistant/chat",
        json={
            "message": "How is the project going?",
            "history": [{"role": "user", "content": "Hello"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Here is an answer.",
        "board_changed": False,
    }
    assert captured["board"] == board
    assert captured["message"] == "How is the project going?"
    assert len(captured["history"]) == 1
    assert client.get("/api/board").json() == board


def test_assistant_actions_are_validated_and_saved_without_losing_cards(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    board = client.get("/api/board").json()
    columns = [
        {
            "id": column["id"],
            "name": column["name"],
            "cards": [],
        }
        for column in board["columns"]
    ]
    columns[0]["cards"] = [
        {"title": "Move me", "details": "Old details"},
        {"title": "Keep me", "details": "Unaffected"},
    ]
    created = client.put("/api/board", json={"columns": columns})
    assert created.status_code == 200
    before = created.json()
    moved_card = before["columns"][0]["cards"][0]
    untouched_card = before["columns"][0]["cards"][1]

    output = AssistantOutput(
        reply="I updated and organized the cards.",
        actions=[
            {
                "type": "edit_card",
                "card_id": moved_card["id"],
                "title": "Updated task",
                "details": "New details",
            },
            {
                "type": "move_card",
                "card_id": moved_card["id"],
                "column_id": before["columns"][1]["id"],
            },
            {
                "type": "create_card",
                "column_id": before["columns"][2]["id"],
                "title": "New task",
                "details": "Created by assistant",
            },
        ],
    )
    monkeypatch.setattr(main, "respond_to_chat", lambda *args: output)

    response = client.post(
        "/api/assistant/chat",
        json={"message": "Update and organize these tasks", "history": []},
    )

    assert response.status_code == 200
    assert response.json() == {
        "reply": "I updated and organized the cards.",
        "board_changed": True,
    }
    saved = client.get("/api/board").json()
    assert saved["columns"][0]["cards"] == [untouched_card]
    assert saved["columns"][1]["cards"] == [
        {
            "id": moved_card["id"],
            "title": "Updated task",
            "details": "New details",
        }
    ]
    assert saved["columns"][2]["cards"][0]["title"] == "New task"
    assert saved["columns"][2]["cards"][0]["details"] == "Created by assistant"
    assert saved["columns"][3:] == before["columns"][3:]


def test_invalid_assistant_action_does_not_change_board(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    board = client.get("/api/board").json()
    before = client.get("/api/board").json()
    monkeypatch.setattr(
        main,
        "respond_to_chat",
        lambda *args: AssistantOutput(
            reply="Updated.",
            actions=[
                {
                    "type": "edit_card",
                    "card_id": str(uuid4()),
                    "title": "Not on this board",
                }
            ],
        ),
    )

    response = client.post(
        "/api/assistant/chat",
        json={"message": "Edit a card", "history": []},
    )

    assert response.status_code == 422
    assert client.get("/api/board").json() == before
    assert board == before


@pytest.mark.parametrize(
    ("failure", "detail"),
    [
        (OpenRouterRequestError("provider unavailable"), "service is unavailable"),
        (AssistantResponseError("invalid output"), "invalid response"),
    ],
)
def test_assistant_failures_are_not_reported_as_success(
    client: TestClient,
    monkeypatch,
    failure: Exception,
    detail: str,
) -> None:
    login(client)
    before = client.get("/api/board").json()

    def fail_response(*args):
        raise failure

    monkeypatch.setattr(main, "respond_to_chat", fail_response)
    response = client.post(
        "/api/assistant/chat",
        json={"message": "Update a card", "history": []},
    )

    assert response.status_code == 502
    assert detail in response.json()["detail"]
    assert client.get("/api/board").json() == before


def test_assistant_save_failure_rolls_back_changes(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    before = client.get("/api/board").json()
    output = AssistantOutput(
        reply="A card was created.",
        actions=[
            {
                "type": "create_card",
                "column_id": before["columns"][0]["id"],
                "title": "Unsaved task",
            }
        ],
    )
    monkeypatch.setattr(main, "respond_to_chat", lambda *args: output)

    def fail_save(*args):
        raise sqlite3.OperationalError("disk unavailable")

    monkeypatch.setattr(main, "_update_board", fail_save)

    response = client.post(
        "/api/assistant/chat",
        json={"message": "Create a task", "history": []},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Could not save assistant changes."
    assert client.get("/api/board").json() == before
