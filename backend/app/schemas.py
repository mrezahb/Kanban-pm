from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=1024)


class UserResponse(BaseModel):
    id: UUID
    username: str


class CardRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(max_length=5000)

    @field_validator("title")
    @classmethod
    def require_nonblank_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value


class ColumnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    cards: list[CardRequest] = Field(max_length=500)

    @field_validator("name")
    @classmethod
    def require_nonblank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        return value


class BoardUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[ColumnRequest] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def require_unique_ids(self) -> "BoardUpdateRequest":
        column_ids = [column.id for column in self.columns if column.id is not None]
        card_ids = [
            card.id
            for column in self.columns
            for card in column.cards
            if card.id is not None
        ]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("column IDs must be unique")
        if len(card_ids) != len(set(card_ids)):
            raise ValueError("card IDs must be unique")
        return self


class CardResponse(BaseModel):
    id: UUID
    title: str
    details: str


class ColumnResponse(BaseModel):
    id: UUID
    name: str
    cards: list[CardResponse]


class BoardResponse(BaseModel):
    id: UUID
    title: str
    columns: list[ColumnResponse]


class AssistantHistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def require_nonblank_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class AssistantChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=4000)
    history: list[AssistantHistoryMessage] = Field(default_factory=list, max_length=20)

    @field_validator("message")
    @classmethod
    def require_nonblank_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value


class AssistantCreateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["create_card"]
    column_id: UUID
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)

    @field_validator("title")
    @classmethod
    def require_nonblank_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value


class AssistantEditCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["edit_card"]
    card_id: UUID
    title: str | None = Field(default=None, min_length=1, max_length=200)
    details: str | None = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def require_nonblank_title(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("title must not be blank")
        return value

    @model_validator(mode="after")
    def require_a_change(self) -> "AssistantEditCardAction":
        if self.title is None and self.details is None:
            raise ValueError("at least one card field must be provided")
        return self


class AssistantMoveCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["move_card"]
    card_id: UUID
    column_id: UUID


AssistantAction = Annotated[
    AssistantCreateCardAction
    | AssistantEditCardAction
    | AssistantMoveCardAction,
    Field(discriminator="type"),
]


class AssistantOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reply: str = Field(min_length=1, max_length=4000)
    actions: list[AssistantAction] = Field(default_factory=list, max_length=50)

    @field_validator("reply")
    @classmethod
    def require_nonblank_reply(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("reply must not be blank")
        return value


class AssistantChatResponse(BaseModel):
    reply: str
    board_changed: bool
