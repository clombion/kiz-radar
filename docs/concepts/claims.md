# Claims

A claim decides a fact no step can derive. `pipeline/claims.py` holds their records.

| Claim | Decides | Names its subject by |
| -- | -- | -- |
| `merge` | that two artists are one (`merge`) or not (`separate`); of a key with itself, whether its name is one person | two keys, in key order |
| `home` | where an artist is from | a key |
| `booking` | which artist one festival's line-up means | a festival, and two keys |
| `site` | what the festivals on a ticket site wait for instead of their default (a site no recipe can read) | a host |

## Who decides

Each claim has a time and a note, and comes by one of three channels, which give it its priority: the admin's, then an
organiser's (to come), then the pipeline's own (the merge review's current answers, each made when it was answered).

| Two claims on one subject | The one that decides |
| -- | -- |
| of different channels | the higher channel's |
| of one channel, at different times | the later |
| of one channel, at one time | the one with the greater digest |

So the outcome is one function of the set of claims, whatever order they are read in, and a claim written twice is one.

## Where they live

The admin's claims live in [kiz-radar-claims](https://github.com/clombion/kiz-radar-claims), checked out as the
`claims/` submodule (`mise run hooks` checks it out). Each is one JSON file named by the digest of its text; never edit
one: write a new one (`claims.write`), which comes first by being later, and commit it there. **Refresh events**
resolves the artists under the latest claims and commits their pin with the export they made, so reverting a commit
restores both.

The export's `claims` table holds every claim and its state: it decides its subject (`applied`), another comes first
(`overridden`), or it names a key no mention produces any more (`orphaned`, deciding nothing until a new claim names the
key the artist has now). `mise run audit` names a claim file its record refuses or that is misnamed, and a site claim
that departs from nothing any more.

## Why a separate repository

A token cannot be limited to one folder of a public repository, and write access to kiz-radar would let a leaked token
change the code that runs with the API key. On the claims repository a leaked token can only add claims, which are
refused when malformed, visible in git, and revertable.
