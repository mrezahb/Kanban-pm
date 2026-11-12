from io import BytesIO
import json
import os
from urllib.error import HTTPError, URLError

import pytest

from backend.app import openrouter
from backend.app.openrouter import (
    OPENROUTER_MODEL,
    OPENROUTER_URL,
    OpenRouterConfigurationError,
    OpenRouterRequestError,
    OpenRouterResponseError,
    complete_chat,
)


def make_response(payload: object) -> BytesIO:
    return BytesIO(json.dumps(payload).encode("utf-8"))


def test_missing_api_key_is_reported_without_request(monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    request_called = False

    def fail_if_called(*args, **kwargs):
        nonlocal request_called
        request_called = True
        raise AssertionError("OpenRouter must not be called without an API key")

    monkeypatch.setattr(openrouter, "urlopen", fail_if_called)

    with pytest.raises(
        OpenRouterConfigurationError,
        match="OPENROUTER_API_KEY is not configured",
    ):
        complete_chat([{"role": "user", "content": "2+2"}])

    assert not request_called


def test_request_uses_configured_model_and_keeps_key_out_of_response(
    monkeypatch,
) -> None:
    api_key = "unit-test-key"
    messages = [{"role": "user", "content": "2+2"}]
    captured: dict[str, object] = {}
    monkeypatch.setenv("OPENROUTER_API_KEY", api_key)

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return make_response(
            {"choices": [{"message": {"content": "The model's response."}}]}
        )

    monkeypatch.setattr(openrouter, "urlopen", fake_urlopen)

    result = complete_chat(messages)

    request = captured["request"]
    assert request.full_url == OPENROUTER_URL
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == f"Bearer {api_key}"
    assert request.get_header("Content-type") == "application/json"
    assert json.loads(request.data) == {
        "model": OPENROUTER_MODEL,
        "messages": messages,
    }
    assert captured["timeout"] == openrouter.REQUEST_TIMEOUT_SECONDS
    assert result == "The model's response."
    assert api_key not in result


def test_json_mode_requests_a_json_object(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "unit-test-key")
    captured: dict[str, object] = {}

    def fake_urlopen(request, timeout):
        captured["payload"] = json.loads(request.data)
        return make_response(
            {"choices": [{"message": {"content": '{"reply":"Done","actions":[]}'}}]}
        )

    monkeypatch.setattr(openrouter, "urlopen", fake_urlopen)

    complete_chat([{"role": "user", "content": "Respond as JSON"}], json_mode=True)

    assert captured["payload"]["response_format"] == {"type": "json_object"}


def test_http_errors_are_reported_without_provider_body_or_key(monkeypatch) -> None:
    api_key = "unit-test-key"
    monkeypatch.setenv("OPENROUTER_API_KEY", api_key)

    def fail_request(request, timeout):
        raise HTTPError(
            OPENROUTER_URL,
            503,
            "Unavailable",
            {},
            BytesIO(b"private provider response"),
        )

    monkeypatch.setattr(openrouter, "urlopen", fail_request)

    with pytest.raises(OpenRouterRequestError, match="HTTP 503") as error:
        complete_chat([{"role": "user", "content": "2+2"}])

    assert "private provider response" not in str(error.value)
    assert api_key not in str(error.value)


def test_network_errors_are_reported_without_details(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "unit-test-key")

    def fail_request(request, timeout):
        raise URLError("private network detail")

    monkeypatch.setattr(openrouter, "urlopen", fail_request)

    with pytest.raises(
        OpenRouterRequestError,
        match="Could not connect to OpenRouter",
    ) as error:
        complete_chat([{"role": "user", "content": "2+2"}])

    assert "private network detail" not in str(error.value)


@pytest.mark.parametrize(
    ("body", "message"),
    [
        (b"not-json", "invalid JSON"),
        (json.dumps({"choices": []}).encode(), "no chat completion"),
        (
            json.dumps({"choices": [{"message": {"content": 4}}]}).encode(),
            "invalid message content",
        ),
        (
            json.dumps({"choices": [{"message": {"content": "  "}}]}).encode(),
            "empty message content",
        ),
    ],
)
def test_invalid_provider_responses_are_reported(
    monkeypatch,
    body: bytes,
    message: str,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "unit-test-key")
    monkeypatch.setattr(
        openrouter,
        "urlopen",
        lambda request, timeout: BytesIO(body),
    )

    with pytest.raises(OpenRouterResponseError, match=message):
        complete_chat([{"role": "user", "content": "2+2"}])


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY", "").strip(),
    reason="OPENROUTER_API_KEY is not configured",
)
def test_live_openrouter_connection() -> None:
    response = complete_chat([{"role": "user", "content": "2+2"}])

    assert response.strip()
    print(f"OpenRouter 2+2 response: {response}")
