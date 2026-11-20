# Fare accuracy

<!-- written by pipeline/fare_accuracy.py from pipeline/fare_offers/: mise run fares -- accuracy -->

How well home's fare (BGO) plus an offset predicts another city's, for the same weekend and flights searched the same
day (pipeline/fare_accuracy.py). Each week's pairs are predicted from the weeks before it. Shown on the site once at
least 20 pairs are scored and 80% are within €40. Pairs searched from 2026-11-12 to 2026-11-20.

| City | Family | Pairs | Offset (€) | Scored | Median error (€) | Within €40 | Shown |
| -- | -- | -- | -- | -- | -- | -- | -- |
| OSL | connecting | 11 | -56 | 8 | 27 | 50% | no |
| SVG | connecting | 5 | +83 | 4 | 98 | 25% | no |
| TRD | connecting | 7 | +150 | 1 | 12 | 100% | no |
