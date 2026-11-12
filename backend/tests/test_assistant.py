import json

import pytest

from backend.app import assistant
from backend.app.assistant import AssistantResponseError, respond_to_chat
from backend.app.schemas import AssistantHistoryMessage


def test_chat_request_contains_board_current_message_and_history(monkeypatch) -> None:
    board = {
        "id": "board-id",
        "title": "Product",
        "columns": [{"id": "column-id", "name": "Ideas", "cards": []}],
    }
    captured: dict[str, object] = {}

    def fake_complete_chat(messages, *, json_mode):
        captured["messages"] = messages
        captured["json_mode"] = json_mode
        return json.dumps({"reply": "Done", "actions": []})

    monkeypatch.setattr(assistant, "complete_chat", fake_complete_chat)

    result = respond_to_chat(
        board,
        "Add a task",
        [AssistantHistoryMessage(role="user", content="Hello")],
    )

    messages = captured["messages"]
    assert messages[0]["role"] == "system"
    assert messages[1] == {"role": "user", "content": "Hello"}
    final_context = json.loads(messages[2]["content"])
    assert final_context == {"board": board, "current_message": "Add a task"}
    assert captured["json_mode"] is True
    assert result.reply == "Done"
    assert result.actions == []


@pytest.mark.parametrize(
    "action",
    [
        {
            "type": "create_card",
            "column_id": "d868e4e6-9173-4412-b609-b1dd95a96df2",
            "title": "New card",
        },
        {
            "type": "edit_card",
            "card_id": "3f5b5d87-2069-414d-8044-fb92f4389e3f",
            "details": "Updated details",
        },
        {
            "type": "move_card",
            "card_id": "3f5b5d87-2069-414d-8044-fb92f4389e3f",
            "column_id": "d868e4e6-9173-4412-b609-b1dd95a96df2",
        },
    ],
)
def test_supported_action_types_are_parsed(monkeypatch, action: dict[str, str]) -> None:
    monkeypatch.setattr(
        assistant,
        "complete_chat",
        lambda messages, *, json_mode: json.dumps(
            {"reply": "Done", "actions": [action]}
        ),
    )

    result = respond_to_chat({}, "Make this change", [])

    assert result.actions[0].type == action["type"]


@pytest.mark.parametrize(
    "response",
    [
        "not-json",
        json.dumps({"reply": "Done", "actions": [{"type": "delete_card"}]}),
        json.dumps({"reply": "Done", "actions": [{"type": "edit_card"}]}),
        json.dumps({"reply": " ", "actions": []}),
    ],
)
def test_invalid_structured_model_output_is_rejected(monkeypatch, response: str) -> None:
    monkeypatch.setattr(
        assistant,
        "complete_chat",
        lambda messages, *, json_mode: response,
    )

    with pytest.raises(AssistantResponseError, match="invalid structured data"):
        respond_to_chat({}, "Hello", [])
