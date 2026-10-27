"""Reading JSON in the tests: a file or a text as its value (prompt.Json), and a value inside it by its path."""

from pathlib import Path

from pipeline.records import JSON, Json


def read(path: Path) -> Json:
    return JSON.validate_json(path.read_bytes())


def at(value: Json, *path: str | int) -> Json:
    """The value at this path of keys and indexes; a test fails where the path leads nowhere."""
    for step in path:
        match value, step:
            case dict(), str():
                value = value[step]
            case list(), int():
                value = value[step]
            case _:
                raise AssertionError(f'{step!r} leads nowhere in {value!r}')
    return value
