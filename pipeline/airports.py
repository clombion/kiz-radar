"""The airports in pipeline/airports.csv. Home is the one marked home: flights go from there."""

from pathlib import Path

from pipeline.records import Airport

AIRPORTS = Airport.read(Path(__file__).parent / 'airports.csv')
(HOME,) = [a.code for a in AIRPORTS if a.home == 1]
