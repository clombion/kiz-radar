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

1. Mint a [fine-grained token](https://github.com/settings/personal-access-tokens/new): repository access to
   `clombion/kiz-radar-claims` only, the permission Contents read and write and nothing else, 366 days.
2. Paste it in the Token field and press **Keep**. It is kept for the tab only (sessionStorage) and sent to
   api.github.com alone, which the page's CSP allows as its one other address.
3. Fill a form: a home's country, or one artist or two for a pair, and the note saying why. A claim with no note, or a
   home with no country, is not sent.

Each claim is written as the file its digest names, `<digest>.json` in the claims repository, the same text and name
`claims.write` gives it (`tests/site/claims.test.ts` holds every committed claim to that). The claims go one at a time.

| GitHub answers | The form says | Then |
| -- | -- | -- |
| 201 | written as `<digest>.json` | it reaches the site at the next run of **Refresh events**, or a manual one |
| 422 | already written | nothing changed: the file at that name is this claim |
| 401 | the token was refused | it expired or was revoked: mint a new one; the form can be sent again |
| 403, 404 | the token may not write there | mint one with Contents read and write on the claims repository |

GitHub does not tell a page when a token expires, so the page cannot show it: a refused write is the sign.

## Why the claims live apart

A token cannot be limited to one folder of a repository, and one that could write to kiz-radar could change the code
that runs with the API key. On the claims repository a leaked token can only add claims, which the pipeline refuses when
malformed, and which stay visible in git and revertable ([Claims](../concepts/claims.md)).
