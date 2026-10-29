# Files

<!-- written by pipeline/reference.py from the records of pipeline/records.py: mise run generate -->

Each file the steps share is read as its record (`pipeline/records.py`), where it enters; `mise run audit` reads every
one.

## CSV files

| File | Record | A row is |
| -- | -- | -- |
| `pipeline/tickets/pages.csv` | `FoundRow` | How an agent found a festival with no known ticket page sells: a page exactly when it sells in a shop (a festival whose sales haven't opened may name its coming page), the links searched exactly when a search found nothing. |
| `pipeline/tickets/status.csv` | `StatusRow` | What a festival waits for. |
| `pipeline/plans.csv` | `PlanRow` | Who said they are going to which festival. |
| `pipeline/airports.csv` | `Airport` | An airport a festival can fly to; home (1) is where flights leave from. |
| `pipeline/geocode.csv` | `Place` | A place the source DB names, and where it is when Nominatim found it (its columns lat, lon and osm_name, all empty when it found none). A place is a city, in a country when the source DB names one. |
| `pipeline/fares.csv` | `Fare` | A weekend's return flight from home: out on the Friday, back fares.NIGHTS later; its price in whole euros, the currency fares asks fli for. |
| `pipeline/fare_jobs.csv` | `Job` | When a festival weekend was last searched; how it went is in pipeline/fares.csv, which has its fare when the search found one. |
| `pipeline/spend.csv` | `Spent` | A request to Claude and what it cost; thinking counts as output. |
| `pipeline/rates.csv` | `Rate` | Units of a currency per euro, on a day. |
| `pipeline/promo_codes.csv` | `Promo` | A promo code for a festival, ours, not kizomba-world's. |
| `pipeline/people.csv` | `Person` | Someone who shares their festival plans: the artist records they are (';'-separated match keys), and whether cards name them (featured) or only count them. |
| `pipeline/extract/groups.csv` | `Group` | A named group: an act several people perform as, its members and the spellings that mean it, each a match_key. |
| `pipeline/artist_merge_suggestions.csv` | `Suggestion` | A pair of artists that may be one, for a reviewer to decide. |

## Folders

| Files | Record | Each is |
| -- | -- | -- |
| `pipeline/extract/answers/<pass>/` | `Answered` | an answer of an extraction pass, with where it comes from |
| `pipeline/tickets/reads/<id>.json` | `FirstRead` | a festival's first read |
| `pipeline/tickets/drafts/<id>.json` | `FirstRead` | a first read an agent is making, beside the prompt it follows |
| `pipeline/tickets/disputed/<id>.json` | `Dispute` | the models' reads, no two of which agreed |
| `pipeline/tickets/partial/<id>.json` | `ModelReads` | the models' reads already paid for, until they settle |
| `pipeline/tickets/log/<id>.jsonl` | `Read`, `Failed` | each read of a festival's ticket page, or its failure, appended to |
| `pipeline/tickets/sites/<site>.json` | `PageRecipe`, `ApiRecipe` | a ticket site's recipe |
| `pipeline/prompts/asked/<hash>.md` | — | the text of every prompt an answer or a read followed |
| `claims/<digest>.json` | `MergeClaim`, `HomeClaim`, `BookingClaim`, `SiteClaim` | an admin's claim (the claims submodule) |
