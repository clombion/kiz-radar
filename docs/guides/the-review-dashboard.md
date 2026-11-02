# The review dashboard

[review.html](https://clombion.github.io/kiz-radar/review.html), published with the site, lists what the pipeline did
lately and every data point waiting for an agent or the admin, as the last build found them (`public/data/review.json`,
written by `pipeline/review.py` with the site's database). Anyone can read it; only the admin's token writes.

| Section | Lists | Settled by |
| -- | -- | -- |
| Homes | artists booked whose home no line-up states, or two state equally often (`contested`) | a home claim, from its form |
| Merges | pairs the merge review left `unsure` that no admin claim decides | a merge claim, from its form |
| Festivals | festivals whose prices wait for an agent (`page`, `recipe`, `recipe_fix`, `session`, `agent`), or whose first read is `disputed` | an agent in a session ([Prices from ticket pages](ticket-pages.md)) |
| Orphaned claims | claims naming a key no mention produces any more (`orphaned`) | a new claim on the key the artist has now ([Reviewing artists](reviewing-artists.md)) |
| Timeline | the pipeline's steps, latest first, and the latest ticket-page reads | — |

## Writing a claim

Without a token the page is read-only: it shows each item and what the machine found, and no choice to make.

1. Make a [fine-grained token](https://github.com/settings/personal-access-tokens/new): resource owner `clombion`,
   repository access to `clombion/kiz-radar-claims` only, the permission Contents read and write and nothing else, and
   the expiry you like.
2. Press the token button at the top right, paste the token, enter the day it expires, and press **Check and keep**. The
   page asks GitHub whose token it is; once GitHub names you, the button says **Can write as clombion** with the days
   left, and the choices appear. The token is kept for the tab only, unless you tick **Keep it on this device**. GitHub
   does not tell a page when a token expires, so the page counts down from the day you entered and warns two weeks
   before it.
3. Each tab is a queue: one item at a time, with what the machine found (a pair compared side by side, its differing
   rows marked; the countries line-ups state and the festivals that state them), and beside it the list of all, which
   its search box narrows. Pick a choice (or press its number), check the note it starts, and press **Write the claim**
   (or Enter). The button confirms the write and the page moves to the next open item. ← and → move between items, n
   goes to the next open one, and the address keeps the place.

What a token may write shows only on a write, so the first claim proves it. The items settled since the last build stay
marked in the browser until the next build lists what is left.

Each claim is written as the file its digest names, `<digest>.json` in the claims repository, the same text and name
`claims.write` gives it (`tests/site/claims.test.ts` holds every committed claim to that). The claims go one at a time.

| GitHub answers | The page says | Then |
| -- | -- | -- |
| 201 | written as `<digest>.json` | it reaches the site at the next run of **Refresh events**, or a manual one |
| 422 | already written | nothing changed: the file at that name is this claim |
| 401 | the token was refused, and the page turns read-only | it expired or was revoked: make a new one |
| 403, 404 | the token may not write there, and the page turns read-only | make one with Contents read and write on the claims repository |

## Why the claims live apart

A token cannot be limited to one folder of a repository, and one that could write to kiz-radar could change the code
that runs with the API key. On the claims repository a leaked token can only add claims, which the pipeline refuses when
malformed, and which stay visible in git and revertable ([Claims](../concepts/claims.md)).
