"""The airports in pipeline/airports.csv. Home is the one marked home: flights go from there."""
import csv, os

AIRPORTS = list(csv.DictReader(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'airports.csv'), encoding='utf-8')))
(HOME,) = [a['code'] for a in AIRPORTS if a['home'] == '1']
