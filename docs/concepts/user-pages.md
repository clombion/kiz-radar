# Pages people make

The communities are a prototype, written by hand. Once people can make their own pages, one rule holds them:
**user-created pages and memberships must never be generated from data committed to the public repository.**

## Why

What this repository holds is public, and its history keeps it: a key, a member or a plan once committed can be read by
anyone, and deleting the row does not take it back. A community's key is its page's address, so a committed key is that
address given away. A page someone makes, and who belongs to it, must stay theirs to change and to remove.

## The stopgap today

The prototype commits its communities: `pipeline/communities.csv` (each key and name), `pipeline/community_members.csv`
(who belongs), `pipeline/seeded.csv` (the people a manager added), the members' `pipeline/people.csv` (each person's
name and home), `pipeline/plans.csv` (who is going where), `pipeline/travel.csv` and `pipeline/stays.csv`, and each
community's page and card, `public/c/<key>/`, which `mise run generate` and `mise run render:design` make from them
([Plans and promo codes: Communities](../guides/plans-and-promos.md#communities)). Nobody can create, join or claim a
community, and everyone listed agreed to be public. It is a known stopgap, kept until there are accounts, and no pattern
for them.

## The two shapes allowed

With accounts, a page people make, and its members, come from one of:

- a Worker reading Durable Objects at request time, so nothing of the page is built ahead or committed;
- a private build whose output goes only to hosting: its data lives outside this repository, and nothing it builds is
  committed here.

Not from a file of `pipeline/`, a folder generated under `public/`, or a step writing either from an account's data. The
site already reads a community in the shape the server will answer with, so only where it comes from changes then.
