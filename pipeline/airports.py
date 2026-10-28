"""The airports a festival can fly to (records.Airport). Home is the one marked home: flights go from there."""

from pipeline.records import Airport


def known() -> list[Airport]:
    return Airport.read()


def home() -> str:
    (code,) = [a.code for a in known() if a.home]
    return code
