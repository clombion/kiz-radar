# Notes for agents working on Kiz Radar

Read [docs/README.md](docs/README.md) for where each task's guide is, and [CONTRIBUTING.md](CONTRIBUTING.md) for the
checks and the conventions. Each step is a task of `tasks.toml`: `mise run <step> -- <its arguments>`.

Never:

- edit `pipeline/tickets/pages.csv` or `pipeline/tickets/log/` by hand: go through `mise run tickets`, one festival at a
  time ([Prices from ticket pages](docs/guides/ticket-pages.md));
- edit a claim file in `claims/`: write a new one (`claims.write`) and commit it in the claims repository
  ([Claims](docs/concepts/claims.md));
- add a state that changes the site's words or a prompt without the admin's OK
  ([Adding a state](docs/guides/adding-a-state.md));
- leave a prompt change without its run: after pushing a change to a template, a state's criterion or a record, start
  **Refresh events** at once ([Refreshing the events](docs/guides/refreshing-events.md));
- read pages with `mise run read-page` in a scheduled job or a loop: one page per question;
- open a pull request: commit to `main`.
