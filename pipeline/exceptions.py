"""Instances that depart from their state's default, one typed row each, keyed by identity (pipeline/STATES.md §3).

Each row says that every festival whose ticket page is on one site waits for something else than it would by
default: for nothing instead of a recipe, because a recipe can't read the site. Such a site is a ticket shop, so a
festival's link to it is its ticket page (tickets.known_page). A row is stale (pipeline.audit) once it departs from
nothing: a recipe reads the site now, or no festival the source database lists has its ticket page there.

Importing this module checks every row: a missing or wrong-typed field, an undated decision, an override that
changes nothing, or two rows for one site fails here.
"""

import datetime as dt
from dataclasses import dataclass

from pipeline import states
from pipeline.states import Waiting


@dataclass(frozen=True)
class Override:
    host: str  # the identity: the site the festivals' ticket pages are on
    instead_of: Waiting  # what they would wait for by default
    then: Waiting  # what they wait for
    why: str
    decided_by: str
    decided_on: str  # YYYY-MM-DD

    def __post_init__(self):
        states.typed(self)
        dt.date.fromisoformat(self.decided_on)
        if self.instead_of == self.then:
            raise ValueError(f'{self.host}: an override from {self.then} to itself')


BOT_CHECK = 'its pages answer with a check that a visitor is human, which is not to be bypassed'
OVERRIDES = (
    Override('www.helloasso.com', Waiting.RECIPE, Waiting.NOTHING, BOT_CHECK, 'user', '2026-10-26'),
    Override('www.tickettailor.com', Waiting.RECIPE, Waiting.NOTHING, BOT_CHECK, 'user', '2026-10-26'),
    Override('buytickets.at', Waiting.RECIPE, Waiting.NOTHING, BOT_CHECK, 'user', '2026-10-26'),
    Override(
        'www.tikello.com',
        Waiting.RECIPE,
        Waiting.NOTHING,
        "its prices are shown in the visitor's currency, which changes between loads",
        'agent',
        '2026-10-27',
    ),
    Override('kizomba.lt', Waiting.RECIPE, Waiting.NOTHING, 'its page gives its tickets no ids', 'agent', '2026-10-27'),
    Override('www.sarajevosalsa.com', Waiting.RECIPE, Waiting.NOTHING, 'its prices are images', 'agent', '2026-10-27'),
)
BY_HOST = {o.host: o for o in OVERRIDES}
if len(BY_HOST) < len(OVERRIDES):
    raise ValueError('two overrides for one site')
