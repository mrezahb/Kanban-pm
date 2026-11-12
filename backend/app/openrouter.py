import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
REQUEST_TIMEOUT_SECONDS = 30


class OpenRouterError(RuntimeError):
    pass


class OpenRouterConfigurationError(OpenRouterError):
    pass


class OpenRouterRequestError(OpenRouterError):
    pass


class OpenRouterResponseError(OpenRouterError):
    pass


def complete_chat(messages: list[dict[str, str]], *, json_mode: bool = False) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise OpenRouterConfigurationError(
            "OPENROUTER_API_KEY is not configured."
        )

    payload: dict[str, object] = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        OPENROUTER_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            response_body = response.read()
    except HTTPError as error:
        raise OpenRouterRequestError(
            f"OpenRouter returned HTTP {error.code}."
        ) from None
    except (URLError, TimeoutError, OSError):
        raise OpenRouterRequestError("Could not connect to OpenRouter.") from None

    try:
        payload: Any = json.loads(response_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise OpenRouterResponseError("OpenRouter returned invalid JSON.") from None

    if not isinstance(payload, dict):
        raise OpenRouterResponseError("OpenRouter returned an invalid response.")

    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise OpenRouterResponseError("OpenRouter returned no chat completion.")

    message = choices[0].get("message")
    if not isinstance(message, dict) or not isinstance(message.get("content"), str):
        raise OpenRouterResponseError("OpenRouter returned invalid message content.")

    content = message["content"].strip()
    if not content:
        raise OpenRouterResponseError("OpenRouter returned empty message content.")
    return content
