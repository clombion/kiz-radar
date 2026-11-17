# Fare accuracy

<!-- written by pipeline/fare_accuracy.py from pipeline/fare_offers/: mise run fares -- accuracy -->

How well home's fare (BGO) plus an offset predicts another city's, for the same weekend and flights searched the same
day (pipeline/fare_accuracy.py). Each week's pairs are predicted from the weeks before it. Shown on the site once at
least 20 pairs are scored and 80% are within €40. Pairs searched from 2026-11-12 to 2026-11-17.

| City | Family | Pairs | Offset (€) | Scored | Median error (€) | Within €40 | Shown |
| -- | -- | -- | -- | -- | -- | -- | -- |
| OSL | connecting | 4 | -58 | 1 | 9 | 100% | no |
| SVG | connecting | 2 | +54 | 1 | 112 | 0% | no |
| TRD | connecting | 6 | +138 | 0 | — | — | no |
