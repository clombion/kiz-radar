# The airports a city flies to

Each festival city needs a decision: which airports dancers actually fly to for it, or that none is near enough. The
review dashboard's **Cities** tab lists the cities of festivals to come that no decision of the admin's covers, each
with the research session's proposal when it has made one. A session works the list; the admin confirms or overrides.

## The decision

A decision is a `city` claim (`pipeline/claims.py`, `CityClaim`) on a city's key (`pipeline/cities.csv`):

| Tier | Airports | When |
| -- | -- | -- |
| `big` | its main airports, every one dancers use (Paris: CDG, ORY, BVA) | a city with several airports dancers fly to |
| `small` | its practical gateways, at most `states.MOST_GATEWAYS` (Glasgow: GLA, EDI, PIK) | any other served city |
| `not_served` | none | no airport is near enough to be worth a flight from home |

Airports are listed the quickest into the city first: the first is the one searched for any flight, the others for
direct flights. Each airport must be in `pipeline/airports.csv` and the key in `pipeline/cities.csv`, or
`mise run audit` names the claim. The note says why: the time into the city, how dancers get there.

## The evidence

`mise run measure -- <OurAirports' airports.csv>` measures, with Transitous (transitous.org, the open journey planner),
how long a trip by public transport takes into each festival city from every airport with scheduled service within 300
km of it. It keeps three files, each row as it is answered:

| File | One row per | Says |
| -- | -- | -- |
| `pipeline/stations.csv` | airport | the stop its trips start from: the most used one near it that is not a flight's; empty when it has none |
| `pipeline/screened.csv` | city and airport | the quickest trip a many-to-one search found, arriving on a Friday evening; empty when it found none. The search counts the wait for the first vehicle, so it only screens |
| `pipeline/routed.csv` | city and airport | for the six nearest and those screened within 4 hours: the quickest trip leaving on a Friday afternoon, in minutes, with its changes and its vehicles (`ground_mode`, [States](../reference/states.md)) |

An airport a city is reached from within 4 hours is added to `pipeline/airports.csv`. A run asks Transitous 600 times at
most (`--most N` for fewer), one request every six seconds (one a second was too much for Transitous, its team told us),
one run a day: a run takes about an hour, the first pass four days, and each run goes on from where the last stopped. A
city measured is not asked about again.

Transitous has no fares, and misses some private shuttles (Beauvais's coach to Paris): research those from the
operator's site.

## Proposing (a session)

1. Open the Cities tab of the review dashboard, or read `cities` in `public/data/review.json` after
   `mise run build:data`.
2. For each city without a proposal, read its rows in `routed.csv` (and `screened.csv` for the airports not routed), and
   find the airports dancers use.
3. Write the proposals:

```python
from pipeline import claims
from pipeline.claims import CityClaim, Small
from pipeline.enums import CityTier
from pipeline.records import now

claims.propose([
    CityClaim(
        field='city',
        key='glasgow-gb',
        decision=Small(tier=CityTier.SMALL, gateways=('GLA', 'EDI', 'PIK')),
        made_at=now(),
        note='GLA 25 min by bus; EDI 1 h 10 by bus; PIK 50 min by train',
    )
])
```

The proposals are files in `pipeline/proposals/`, named by their digest, committed to `main`. They are of the model
channel ([Claims](../concepts/claims.md)), and the folder holds city decisions only: the run stops on any other claim
there.

## Confirming or overriding (the admin)

A `city` claim of the admin's on the same key decides it whatever the proposal says, and takes the city off the Cities
tab: write it with `claims.write` and commit it in the claims repository, as any admin claim.
