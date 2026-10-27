"""What the tests stand in for: Claude's Messages API, as a client (ask.Client) answering each request with the next of
its replies, as a real message of the SDK, and keeping what it was asked; and a database, as the type of the memory
fixture (conftest.py)."""

import sqlite3
from collections.abc import Callable, Sequence
from types import TracebackType
from typing import Self

from anthropic.types import Message, MessageParam, StopReason, TextBlock, Usage

INPUT_TOKENS, OUTPUT_TOKENS = 6000, 2000  # what each request costs

# what the memory fixture gives: an in-memory database, closed when the test ends (conftest.py)
type Memory = Callable[[], sqlite3.Connection]


def message(text: str, stop_reason: StopReason = 'end_turn') -> Message:
    return Message(
        id='msg_test',
        type='message',
        role='assistant',
        model='claude-haiku-5-5',
        content=[TextBlock(type='text', text=text, citations=None)],
        stop_reason=stop_reason,
        stop_sequence=None,
        usage=Usage(input_tokens=INPUT_TOKENS, output_tokens=OUTPUT_TOKENS),
    )


class Stream:
    def __init__(self, reply: Message) -> None:
        self.reply = reply

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self, kind: type[BaseException] | None, error: BaseException | None, trace: TracebackType | None
    ) -> None:
        return None

    def get_final_message(self) -> Message:
        return self.reply


class Messages:
    def __init__(self, replies: Sequence[Message]) -> None:
        self.replies = list(replies)
        self.asked: list[list[MessageParam]] = []  # each request's messages, as sent
        self.requests: list[dict[str, object]] = []  # the rest of each request: its model, system text, schema

    def stream(self, *, messages: list[MessageParam], **request: object) -> Stream:
        self.asked.append(list(messages))
        self.requests.append(request)
        return Stream(self.replies.pop(0))


class Client:
    def __init__(self, *replies: str | Message) -> None:
        self.messages = Messages([message(r) if isinstance(r, str) else r for r in replies])
