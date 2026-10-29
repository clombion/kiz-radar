# Reviewing artists

The source sometimes splits one act into several records: names vary in spelling ("Jojo & Jenni", "Jojo & Jenny") or
order ("Lukasz & Karolina", "Karolina & Łukasz"), and some couples appear once per partner. `mise run resolve` keys
every mention, flags the pairs that may be one artist, and merges a pair only when a merge claim says so. Whose claim
decides is in [Claims](../concepts/claims.md).

## What decides a pair

The merge review asks Claude about every pair the matching rules flag, and every pair a review answered before, each
monthly run; its answers to the current prompt are the pipeline's merge claims. An admin's claim comes before them.

| The pair has | It is |
| -- | -- |
| an admin's merge claim | as the admin says |
| no admin claim, a review answer `merge` or `separate` | as the review says |
| a review answer `unsure` | left apart, waiting for an agent to decide (`unsure`) |
| nothing | left apart; it shows in the suggestions |

A pair of a key with itself is a name that may be several people (two of its mentions state countries they don't share).
A review of it settles the pair and merges nothing: one name stays one artist.

Merging two couples also merges their members, paired by the closest name. An artist keeps its id; an id no artist has
any more redirects to the artist that absorbed it, and an id an artist has again redirects nowhere.

## Finding the next duplicates

`pipeline/artist_merge_suggestions.csv` (`mise run suggest-merges`) lists likely pairs still undecided, ranked by
`score`. The score starts from name similarity, rises when line-ups state a shared country for both, and falls when they
state countries they don't share (`countries`: `same`, `different`, `unknown`); French overseas territories count as
France, and where an artist is booked says nothing of where they are from.

| `calendar` | Means | Score |
| -- | -- | -- |
| clash | booked at overlapping events of four days or less in different cities: two people | strong penalty |
| shared circuit | booked in the same city or by the same organiser | small bonus |
| same line-up | named in one line-up (festivals list artists per room) | none; shown for review |
| no clash | nothing either way | none |

`calendar_note` names the events behind each verdict.

## Deciding

Write an admin claim (`claims.write`) and commit it in the claims repository, `claims/`: a merge claim naming the pair's
keys (`keep_key` and `merge_key` of the suggestion, in key order) with `merge` or `separate`. Never edit a claim file; a
later claim comes first.

A name listed alone can stand for different people at different festivals (every solo "Christina" lands in one record):
a booking claim moves one festival's booking from the key it was filed under to the person it belongs to.

## Home countries

The site shows where an artist is from only when a source says so: a home claim, else the one country line-ups state
most often next to their name, each festival once. When line-ups state several countries equally often, the home is
contested and none is shown; the statistics then count the artist as of unknown country. To settle one, write a home
claim.

## A claim that decides nothing

A claim names its artists by the keys mentions produce. When no mention produces a key any more (a spelling the source
corrected), the claim is `orphaned`: the export's `claims` table says so, and it decides nothing until the admin points
a new claim at the key the artist has now.
