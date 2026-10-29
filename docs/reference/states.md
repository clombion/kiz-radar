# States

<!-- written by pipeline/reference.py from pipeline/states.py: mise run generate -->

Every data point and every state it can be in; why the world is closed is in [States](../concepts/states.md).

## Data points

| Data point | States | Produced by |
| -- | -- | -- |
| **page_read**, each logged attempt to read a ticket page | `read`, `refused`, `empty`, `unreachable`, `layout_broken` | tickets_reading.attempt |
| **call_cause**, each call that gave no answer, by what kept it from one (pipeline/calls.py); a ticket page's own failures are page_read states | `checker`, `truncated`, `transient`, `structural`, `budget` | calls |
| **sales**, a festival with no full link to its ticket page, as an agent found it (tickets/pages.csv) | `shop`, `not_yet`, `offline`, `closed`, `none_found` | tickets.py page --state |
| **ticket**, each ticket of a read ticket page | `in_tier`, `skipped`, `unread` | the first read; tickets_store.unread_keys |
| **skip_reason**, each ticket a first read skips | `room`, `class`, `competition`, `merchandise`, `food_drink`, `excursion`, `fee`, `deposit`, `discount`, `donation`, `not_public`, `no_amount` | the first read |
| **pass_kind**, each pass a festival sells | `full`, `party`, `day`, `workshop`, `package`, `other` | the prices pass; the first read |
| **style**, a dance style: of a festival, by its genres, or the one a pass is limited to (null: all the festival's styles) | `kizomba`, `zouk`, `bachata`, `salsa`, `other` | prices.styles; the prices pass; the first read |
| **people**, each pass, by how many people one price is for | `one`, `couple`, `group`, `per_room` | prices.people, from group_size and kind |
| **fee**, each price tier, by its booking fee | `none`, `included` | the prices pass; the first read |
| **re_read**, a festival with a first read, by when its page is read again | `dated`, `monthly` | tickets_store.recheck |
| **first_read**, a festival, by whether it needs a (new) first read | `not_needed`, `none`, `past`, `awaits_answer`, `current`, `redo_prompt`, `redo_description`, `redo_festival`, `redo_page`, `redo_unread`, `disputed` | tickets_state.why_first_read |
| **answer**, a festival's answer of one extraction pass | `none`, `current`, `stale` | answers.state |
| **waits_for**, each festival, by what its prices from its ticket page wait for | `page`, `recipe`, `recipe_fix`, `session`, `agent`, `sales_open`, `nothing` | tickets_state.waiting, in tickets/status.csv |
| **price**, each festival, by what its card can say of its price | `priced`, `other_passes_only`, `page_unread`, `page_empty`, `not_yet`, `offline`, `closed`, `none_found`, `not_looked` | prices.price_state, in price_status |
| **tier_today**, a pass's price on the day it is viewed | `now`, `from`, `next`, `sold_out`, `ended` | pricing.ts tierNow |
| **card_price**, a priced festival, by what its card says on the day it is viewed | `full_pass`, `package`, `sold_out`, `ended` | pricing.ts cardPrice |
| **genre**, each dance genre a festival covers | `kizomba`, `semba`, `urbankiz`, `tarraxo`, `tarraxinha`, `douceur`, `kompa`, `zouk`, `bachata`, `salsa`, `afro`, `reggaeton`, `kuduro`, `other` | the rooms-genres pass; the genre rules; the site tags |
| **genre_rule**, a genre the rules add | `sbk`, `title` | load_extract |
| **source**, where a genre or feature row comes from | `description`, `site_tag` | load_extract |
| **pass_source**, where a festival's passes come from | `description`, `ticket_page` | load_extract |
| **room_kind**, each room a description lists | `party`, `class`, `unspecified` | the rooms-genres pass |
| **feature**, each feature of a festival | `promo_code`, `all_levels_beginners`, `taxi_dancers`, `accommodation_included`, `group_deals`, `meals_included`, `transfers_shuttle`, `pool_party`, `beach_party`, `boat_party`, `cruise`, `live_music`, `bootcamp_intensive`, `competition`, `camping`, `masterclass`, `private_classes`, `shows`, `themed_parties`, `pre_party`, `after_party`, `day_socials`, `partner_hotel`, `multiple_rooms`, `adults_only`, `all_in_one`, `workshops`, `dress_code` | the extract pass |
| **role**, each artist named in a description | `teacher`, `dj`, `performer`, `mc`, `organiser`, `media`, `crew` | the extract pass |
| **artist_kind**, each artist | `person`, `couple`, `group`, `organisation` | resolve_artists |
| **home_basis**, an artist's home country, by how it is known | `given`, `stated`, `contested` | build_site_db |
| **merge_decision**, each artist merge reviewed | `merge`, `separate`, `unsure` | the merge review; a merge claim |
| **merge_reason**, each pair of artists that may be one, for the merge review | `same name, different keys`, `first words of the other`, `same partner, shortened name`, `similar spelling`, `single name, several countries`, `couples with matching names` | resolve_artists |
| **suggestion_countries**, each merge suggestion, by the countries line-ups state for its two artists | `unknown`, `same`, `different` | merge_suggestions |
| **suggestion_calendar**, each merge suggestion, by where and when its two artists are booked | `same line-up`, `clash`, `shared circuit`, `no clash` | merge_suggestions |
| **via**, each appearance of an artist at an event (artist_events) | `direct`, `member` | resolve_artists; build_site_db |
| **listing**, each festival, by whether the site it comes from still lists it | `listed`, `gone` | scrape |
| **phase**, each festival, by where it stands on the visitor's day: to come, over, cancelled or no longer listed | `ahead`, `ended`, `cancelled`, `gone` | build_site_db event_rows |
| **event_source**, the site a festival's listing comes from (source_ids) | `kizomba-world` | scrape |
| **plan**, each plan someone shares (pipeline/plans.csv) | `going` | pipeline/plans.csv |
| **next_change**, a pass's next price change on the day it is viewed | `door`, `dated`, `later` | pricing.ts nextChange |
| **hotel**, each pass, by whether its price includes a hotel | `included`, `none` | the prices pass; the first read |
| **claim_source**, the channel a claim comes by, the earlier the higher its priority | `admin`, `organiser`, `model` | claims |
| **claim**, each claim, by whether it decides its subject | `applied`, `overridden`, `orphaned` | resolve_artists |
| **model**, each Claude model the pipeline asks, which spend.PRICES prices | `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | ask; tickets; merge review |

## States

| Point · state | Disposition | Wording | Owner | Criterion |
| -- | -- | -- | -- | -- |
| page_read · `read` | kept | — | — | the page loaded and the recipe found every ticket row, each with its key, name, price, amount and currency |
| page_read · `refused` | waits | — | the next run; after three in a row, an agent in a session | no rows and an HTTP error, or the page would not load |
| page_read · `empty` | kept | — | — | the site answered a list of its tickets, and it is empty: none is listed now (a page's rows can't say so, as a recipe that finds none may be broken) |
| page_read · `unreachable` | waits | — | the next run; after three in a row, an agent in a session | the address could not be reached: the connection was reset or timed out, or the host is unknown |
| page_read · `layout_broken` | waits | — | agent: fix the recipe | the recipe's selectors fail, no rows, two rows with one key, or a row without its key, name, price, amount or currency |
| call_cause · `checker` | kept | — | — | the answer failed the checker twice, the second time with the checker's lines |
| call_cause · `truncated` | kept | — | — | the answer stopped before its end (stop_reason other than end_turn) |
| call_cause · `transient` | kept | — | — | the service was busy or unreachable for now: a timeout, a lost connection, HTTP 429 or 5xx |
| call_cause · `structural` | kept | — | — | the call cannot succeed as made: any other HTTP error (a bad key, a malformed request), a reply of another shape, or no browser to read with; the run stops calling |
| call_cause · `budget` | kept | — | — | the month's budget for Claude is spent (pipeline/spend.py); the run stops calling |
| sales · `shop` | kept | — | — | a page sells them online: page is that page |
| sales · `not_yet` | kept | — | organiser | sales are announced but not open ("coming soon", "TBA") |
| sales · `offline` | kept | — | — | by message, e-mail, a form then payment, a bank transfer or an agency |
| sales · `closed` | kept | — | — | its sales or registrations are closed |
| sales · `none_found` | kept | — | agent: once its links change | a search of the festival's links and the web found no ticket page |
| ticket · `in_tier` | view | — | — | the first read puts it in a tier of a pass |
| ticket · `skipped` | kept | — | — | the first read skips it, with its reason |
| ticket · `unread` | waits | The ticket page has more tickets than shown here | the next run's first read | the page shows it and the first read neither puts it in a tier nor skips it |
| skip_reason · `room` | kept | — | — | a hotel room, a bed or a camping place sold apart from a pass |
| skip_reason · `class` | kept | — | — | a single class, workshop or private lesson, even one called a masterclass |
| skip_reason · `competition` | kept | — | — | a competition entry |
| skip_reason · `merchandise` | kept | — | — | merchandise: a T-shirt, a fan, a bag |
| skip_reason · `food_drink` | kept | — | — | a meal, a dinner or drinks sold on their own |
| skip_reason · `excursion` | kept | — | — | an excursion, a tour, a shuttle or a transfer sold on its own |
| skip_reason · `fee` | kept | — | — | a fee sold as an item of its own: a name change, a surcharge, a booking fee |
| skip_reason · `deposit` | kept | — | — | a deposit, an advance payment or an instalment on a pass (a bootcamp included) |
| skip_reason · `discount` | kept | — | — | a discount that is no price of its own: for groups, students, members or a promo code |
| skip_reason · `donation` | kept | — | — | a donation, or a ticket that only supports the festival |
| skip_reason · `not_public` | kept | — | — | a ticket not sold to the public: for guests, artists, staff, helpers or volunteers |
| skip_reason · `no_amount` | kept | — | — | a price with no amount ("€…", "TBA") |
| pass_kind · `full` | view | Full pass | — | all the festival's workshops and all its parties, for the whole festival. An early-bird, blind or VIP-free "full pass" is still `full`; so is a "full pass" with a few small extras (a welcome drink). |
| pass_kind · `party` | view | Party pass | — | the parties or socials only, for the whole festival, no workshops. A "Dance Pass" sold beside the festival's full pass is `party` unless the description says it includes workshops. |
| pass_kind · `day` | view | Day pass | — | one day or one night only (workshops, parties, or both); a ticket to one party, a pre-party say, is one. |
| pass_kind · `workshop` | view | Workshop pass | — | workshops only, no parties. |
| pass_kind · `package` | view | Package | — | a pass sold together with a hotel room, meals, transfers or excursions, as one price. |
| pass_kind · `other` | view | Pass | — | anything else that is sold as a pass: VIP passes that add perks or classes to the full pass, bootcamps and masterclass series (several classes sold as one), passes that cover two festivals, passes priced by the buyer's country. |
| style · `kizomba` | view | Kizomba | — | kizomba, or one of the styles of its family, or a mix of them |
| style · `zouk` | view | Zouk | — | zouk, Brazilian zouk included |
| style · `bachata` | view | Bachata | — | bachata |
| style · `salsa` | view | Salsa | — | salsa |
| style · `other` | view | Other style | — | any other dance style |
| people · `one` | view | — | — | group_size 1, or none stated for a pass other than a package |
| people · `couple` | view | for a couple | — | group_size 2 |
| people · `group` | view | for {n} | — | group_size 3 or more |
| people · `per_room` | view | — | — | none stated for a package: priced per room |
| fee · `none` | view | — | — | no booking fee stated |
| fee · `included` | view | incl. {fee} fee | — | the amount includes a booking fee the source states |
| re_read · `dated` | kept | — | — | every tier on sale has an end date and none is limited to a number of tickets: read again once its last date has passed |
| re_read · `monthly` | kept | — | — | any other: read again on every monthly run |
| first_read · `not_needed` | kept | — | — | no first read, and the description's prices answer gives the pass a card prices a price dated today or later |
| first_read · `none` | waits | — | the next run, once its page has a recipe | no first read, and the description's prices answer gives the pass a card prices no dated price |
| first_read · `past` | kept | — | — | no first read, the description's prices answer gives the pass a card prices no dated price, and the festival is over: no run reads its page any more |
| first_read · `awaits_answer` | waits | — | the next run's prices pass | no first read, and the description's prices answer is not to the current prompt yet |
| first_read · `current` | kept | — | — | a first read to the current prompt, of the current description and ticket page, knowing every ticket |
| first_read · `redo_prompt` | waits | — | the next run | the first read follows another prompt than the current one |
| first_read · `redo_description` | waits | — | the next run | the description changed since the first read |
| first_read · `redo_festival` | waits | — | the next run | the festival's title, dates, country or dance styles changed since the first read |
| first_read · `redo_page` | waits | — | the next run | the ticket page changed since the first read |
| first_read · `redo_unread` | waits | — | the next run | the page shows tickets the first read does not know |
| first_read · `disputed` | waits | — | agent: settle it | a first read is needed, and no two of the models agreed on it (tickets/disputed/) |
| answer · `none` | waits | — | the next run | the festival has no answer of the pass |
| answer · `current` | kept | — | — | its answer answered the current prompt and the message the festival would be asked with today |
| answer · `stale` | waits | — | the next run | its answer answered another prompt, or another message: the festival changed since (its description, title, dates or country, or for the prices pass the styles its genres give); it is not loaded until asked again |
| waits_for · `page` | waits | — | agent: find the page | no known ticket page: kizomba-world cut its link short, gave none, or gave links to no ticket shop |
| waits_for · `recipe` | waits | — | agent: write the recipe | its ticket page is on a site with no recipe |
| waits_for · `recipe_fix` | waits | — | agent: fix the recipe | its latest read broke the recipe: the page no longer fits it |
| waits_for · `session` | waits | — | agent: read it in a session | its reads keep failing |
| waits_for · `agent` | waits | — | agent: settle it | no two models agreed on its first read |
| waits_for · `sales_open` | waits | — | organiser | its sales are announced but not open |
| waits_for · `nothing` | kept | — | — | nothing: its prices are read, or it needs no first read, sells offline, has closed its sales, is over, or a site claim says so (pipeline/claims.py) |
| price · `priced` | card | — | — | its passes include the one a card prices: a full pass for one person, or a package with a hotel for one |
| price · `other_passes_only` | note | No full pass price | — | it has passes, none of them the one a card prices |
| price · `page_unread` | note | Prices on the ticket page | — | no passes; its ticket page is known and its prices are not read yet |
| price · `page_empty` | note | No tickets listed yet | the next run | no passes; its ticket page, read, lists no tickets now |
| price · `not_yet` | note | Tickets not on sale yet | organiser | no passes; its sales are announced but not open |
| price · `offline` | note | Tickets by message or form, no price online | — | no passes; it sells by message, e-mail, a form or a bank transfer |
| price · `closed` | note | Ticket sales closed | — | no passes; its sales are closed |
| price · `none_found` | note | No price published | agent: once its links change | no passes; a search found no ticket page |
| price · `not_looked` | note | No price published | agent: find the page | no passes, and no ticket page known yet |
| tier_today · `now` | view | {price} | — | a tier applies today and is not sold out: the cheapest of them |
| tier_today · `from` | view | from {price} | — | several undated tiers apply today |
| tier_today · `next` | view | {price} | — | none applies yet: the first one to come |
| tier_today · `sold_out` | view | sold out | — | every tier is sold out |
| tier_today · `ended` | view | — | — | every dated tier has ended, and there is no door price |
| card_price · `full_pass` | card | {price} full pass | — | the card prices a full pass, at its tier today |
| card_price · `package` | card | {price} package with hotel | — | the card prices a package with a hotel, at its tier today |
| card_price · `sold_out` | card | {pass} sold out | — | the priced pass's tiers are all sold out |
| card_price · `ended` | note | Prices no longer listed | organiser | the festival is over, or the priced pass's dated tiers have all ended |
| genre · `kizomba` | card | Kizomba | — | Kizomba (traditional / sensual kizomba) |
| genre · `semba` | card | Semba | — | Semba |
| genre · `urbankiz` | card | Urban Kiz | — | Urban Kiz / Urbankiz / Kizomba fusion |
| genre · `tarraxo` | card | Tarraxo | — | Tarraxo |
| genre · `tarraxinha` | card | Tarraxinha | — | Tarraxinha |
| genre · `douceur` | card | Douceur | — | Douceur |
| genre · `kompa` | card | Kompa | — | Kompa / Konpa / Kompas |
| genre · `zouk` | card | Zouk | — | Zouk (including Brazilian zouk and ghetto zouk) |
| genre · `bachata` | card | Bachata | — | Bachata (any style) |
| genre · `salsa` | card | Salsa | — | Salsa (any style) |
| genre · `afro` | card | Afro | — | Afro dances: afrobeats, afro house, afro dance |
| genre · `reggaeton` | card | Reggaeton | — | Reggaeton |
| genre · `kuduro` | card | Kuduro | — | Kuduro |
| genre · `other` | kept | — | — | Any other dance genre; give its name in genre_as_written |
| genre_rule · `sbk` | kept | — | — | "SBK" anywhere in the title or description: the genres it names |
| genre_rule · `title` | kept | — | — | a genre named as a whole word in the title |
| source · `description` | kept | — | — | the festival's description, by an extraction pass or a rule |
| source · `site_tag` | kept | — | — | kizomba-world's own tag |
| pass_source · `description` | view | Prices as the festival lists them. | — | the prices pass, from the festival's description |
| pass_source · `ticket_page` | view | Prices from the festival’s ticket page, as of {day}. | — | its ticket page, read by pipeline/tickets.py |
| room_kind · `party` | kept | — | — | a party room or dance floor |
| room_kind · `class` | kept | — | — | a class room |
| room_kind · `unspecified` | kept | — | — | a room the description does not say the use of |
| feature · `promo_code` | card | Promo code | — | a promo code of ours (pipeline/promo_codes.csv) |
| feature · `all_levels_beginners` | card | Beginner-friendly | — | Suitable for all levels or explicitly welcomes beginners |
| feature · `taxi_dancers` | card | Taxi dancers | — | Taxi dancers are present |
| feature · `accommodation_included` | card | Hotel package | — | A pass or package includes the accommodation |
| feature · `group_deals` | card | Couple & group deals | — | a full, party or package pass for two people or more |
| feature · `meals_included` | card | Meal package | — | Meals are included in a pass or package |
| feature · `transfers_shuttle` | card | Airport shuttle | — | Shuttles or transfers (airport, station, between venues) |
| feature · `pool_party` | card | Pool party | — | A pool party |
| feature · `beach_party` | card | Beach party | — | A beach party |
| feature · `boat_party` | card | Boat party | — | A boat party |
| feature · `cruise` | card | Cruise | — | The event takes place on a cruise ship |
| feature · `live_music` | card | Live music | — | Live music: a band, singer or concert |
| feature · `bootcamp_intensive` | card | Bootcamp | — | A bootcamp, intensive or long training course |
| feature · `competition` | card | Competition | — | Any competition: battle, contest, Jack & Jill, championship, competition |
| feature · `camping` | card | Camping | — | Camping, bungalows or campsite accommodation |
| feature · `masterclass` | view | Masterclass | — | Masterclasses |
| feature · `private_classes` | view | Private classes | — | Private lessons are offered |
| feature · `shows` | view | Shows | — | Shows or performances by artists |
| feature · `themed_parties` | view | Themed parties | — | Themed nights or parties with a dress theme (e.g. white party, Halloween night) |
| feature · `pre_party` | view | Pre-party | — | A pre-party before the main event |
| feature · `after_party` | view | After-party | — | An after-party |
| feature · `day_socials` | view | Day socials | — | Daytime socials or afternoon parties |
| feature · `partner_hotel` | view | Partner hotel | — | A partner or recommended hotel, or a negotiated hotel rate, without the accommodation being part of the pass |
| feature · `multiple_rooms` | view | Several rooms | — | More than one dance room or dance floor |
| feature · `adults_only` | view | 18+ only | — | Restricted to adults (18+) |
| feature · `all_in_one` | filter | All-in-one hotel | — | The parties take place in the hotel where dancers are invited to stay (event and accommodation in the same venue) |
| feature · `workshops` | kept | — | — | Dance classes or workshops are part of the event |
| feature · `dress_code` | kept | — | — | A dress code is stated |
| role · `teacher` | view | Teachers | — | Teachers, instructors, and the 'artists' line-up of a festival (in this scene, the teaching couples and solo teachers) |
| role · `dj` | view | DJs | — | DJs |
| role · `performer` | view | Performers | — | Singers, bands, musicians, show dancers and guest dancers who perform rather than teach |
| role · `mc` | view | MCs | — | MCs, hosts, presenters of the event |
| role · `organiser` | view | Organised by | — | The school, association, company or person organising the event |
| role · `media` | kept | — | — | Photographers, videographers, media teams |
| role · `crew` | kept | — | — | Named teams that serve the dancers: taxi-dancer teams, host teams |
| artist_kind · `person` | view | People | — | one person |
| artist_kind · `couple` | view | Couples | — | two people booked together |
| artist_kind · `group` | kept | — | — | a band, a dance company or a team |
| artist_kind · `organisation` | kept | — | — | a school, an association or a company |
| home_basis · `given` | view | Home country added by hand. | — | given by a home claim (pipeline/claims.py) |
| home_basis · `stated` | view | Home country as stated in line-ups. | — | the one country stated most often next to their name in line-ups (each festival once) |
| home_basis · `contested` | view | Line-ups name several countries for them, none more often. | — | line-ups state several countries next to their name, none more often than the others: no home is shown |
| merge_decision · `merge` | kept | — | — | two records are one artist |
| merge_decision · `separate` | kept | — | — | two records are different artists |
| merge_decision · `unsure` | waits | — | agent: decide | the review could not tell |
| merge_reason · `same name, different keys` | kept | — | — | two person keys with one name (a DJ and a dancer, solo and in a couple, or in two couples), sharing a stated country or a partner |
| merge_reason · `first words of the other` | kept | — | — | the shorter name is the first words of the longer, the pair sharing a stated country or a partner |
| merge_reason · `same partner, shortened name` | kept | — | — | the two dance with one partner, and one name begins with the other |
| merge_reason · `similar spelling` | kept | — | — | names spelled alike (resolve_artists.SIMILAR), sharing a stated country or a partner; or, both of several words, sharing an event country |
| merge_reason · `single name, several countries` | kept | — | — | one single-word key, two of whose mentions state countries they do not share: it may be several people |
| merge_reason · `couples with matching names` | kept | — | — | two couples whose members' names are spelled alike, member by member |
| suggestion_countries · `unknown` | kept | — | — | line-ups state no country for one of the two |
| suggestion_countries · `same` | kept | — | — | line-ups state a country for both that they share |
| suggestion_countries · `different` | kept | — | — | line-ups state countries for both, and they share none |
| suggestion_calendar · `same line-up` | kept | — | — | both are named in one line-up, in one role |
| suggestion_calendar · `clash` | kept | — | — | both are booked at short events in different cities at the same time |
| suggestion_calendar · `shared circuit` | kept | — | — | both are booked in one city, or by one organiser |
| suggestion_calendar · `no clash` | kept | — | — | none of these |
| via · `direct` | kept | — | — | the artist is named in the line-up |
| via · `member` | kept | — | — | a couple or group the artist is in is named in the line-up |
| listing · `listed` | kept | — | — | the site lists the festival |
| listing · `gone` | card | This festival is no longer listed. | — | the site no longer lists the festival: it is kept (unlisted_on), so plans and links to it still hold, and left out of the festivals listed |
| phase · `ahead` | kept | — | — | listed, not cancelled, and not over by the day it is seen from |
| phase · `ended` | card | This festival has taken place. | — | listed, not cancelled, and over by the day it is seen from |
| phase · `cancelled` | card | This festival was cancelled. | — | listed, and cancelled |
| phase · `gone` | kept | — | — | no longer listed: the card says so as its listing does (listing gone) |
| event_source · `kizomba-world` | kept | — | — | kizomba-world.com, whose ids its source_id are |
| plan · `going` | view | — | — | they said they are going |
| next_change · `door` | card | price is higher at the door | — | the next tier is the price at the door |
| next_change · `dated` | card | price goes up {day} | — | the next tier starts on a known day |
| next_change · `later` | card | price goes up later | — | the next tier starts on a day not known |
| hotel · `included` | view | with hotel | — | the price includes accommodation |
| hotel · `none` | view | — | — | the price includes no accommodation |
| claim_source · `admin` | kept | — | — | a file of the claims repository (clombion/kiz-radar-claims), written by its owner |
| claim_source · `organiser` | kept | — | — | a festival's organiser, through the organisers' channel |
| claim_source · `model` | kept | — | — | the pipeline's own answers (the merge review) |
| claim · `applied` | kept | — | — | the highest claim on its subject: it decides it |
| claim · `overridden` | kept | — | — | another claim on its subject comes first: a higher source, or a later one |
| claim · `orphaned` | waits | — | admin: point it at the key the artist has now | it names a key no mention produces any more (a re-extraction respelled it): ignored until re-pointed |
| model · `claude-fable-5-1` | kept | — | — | the first read's tie-break, when the two models' reads differ |
| model · `claude-opus-5-5` | kept | — | — | a model of the first read |
| model · `claude-sonnet-5-5` | kept | — | — | a model of the first read |
| model · `claude-haiku-5-5` | kept | — | — | the extraction passes and the merge review |
