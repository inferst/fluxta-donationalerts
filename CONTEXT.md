# DonationAlerts

The Fluxta plugin that connects a streamer's DonationAlerts account to their
deck. It turns what DonationAlerts reports — a Donation, a Goal changing —
into Fluxta Events. It has no Actions and no Value Sources yet.

Fluxta's own words — Event, Event Source, Event Field, Event Filter,
Condition, Run Variable, Global Variable, Plugin Editor, Plugin settings,
External Connection — mean what Fluxta's
[Terminology](https://fluxta.app/docs/plugins/getting-started/terminology)
says and are not redefined here. DonationAlerts' nouns below are used as its
[API](https://www.donationalerts.com/apidoc) uses them, narrowed to what this
plugin does with them.

## Language

### Account

**Account**:
The DonationAlerts user the plugin is signed in as — exactly one, or none.
Holds an access token, the moment it expires, and the user's id, name and
avatar from DonationAlerts. Persisted in Plugin settings and reported to
Fluxta with `setConnections` as one External Connection, connected while the
Realtime Connection is up.
_Avoid_: user, profile, channel (DonationAlerts has no channels of its own).

**Sign-in**:
How the plugin gets an Account's token: OAuth's implicit grant through a
loopback redirect to `http://127.0.0.1:29361/callback`, open only while a
sign-in is in progress. The plugin ships a public client id and no secret.
DonationAlerts gives no refresh token, so a token lasts as long as DonationAlerts
says — a year at the time of writing — and then the streamer signs in again.
Signing in again at any time replaces the token.
_Avoid_: login, authorization (that is DonationAlerts' consent screen),
connect.

**Sign-in Expiry**:
The moment an Account's token stops working, known from the moment of
Sign-in. The Plugin Editor always shows it and warns during the last 14 days;
when it passes, the Account needs a new Sign-in without waiting for
DonationAlerts to refuse the token.
_Avoid_: token lifetime, session.

**Reauthorization Required**:
The state of an Account whose token DonationAlerts refuses or whose Sign-in
Expiry has passed. The token is dropped and the identity kept, so the Plugin
Editor can say whose account to sign in again; nothing retries with the old
token.
_Avoid_: logged out (the identity is still known), expired (one of two causes).

### Realtime

**Realtime Connection**:
The plugin's one link to DonationAlerts' Centrifugo server, subscribed to the
Account's donation and goal channels. Every reconnect gets a new client id
and so new channel tokens. A dropped connection — the network, DonationAlerts,
or Centrifugo itself closing it with `insufficient state` — is normal and is
retried without end, 1 s growing to 60 s.
_Avoid_: socket, connection (Fluxta's word for a transport link), stream.

**Catch-up**:
After the Realtime Connection comes back within one run of the sidecar,
fetching the first page of the donation list and firing Donation Received for
every Donation newer than the last one seen and not fired yet, oldest first.
There is no Catch-up after the sidecar starts — Donations made while Fluxta
was closed are not fired — and none for Goals, which DonationAlerts does not
list.
_Avoid_: replay, sync, recovery (Centrifugo's word for its own history).

**Repeat**:
DonationAlerts' "repeat alert" on a Donation: a new publication of the same
Donation — same id, same `reason` — at a new position in the channel. It fires
Donation Received again, like a new Donation. What fires once is a
publication: Centrifugo's history replays one at the position it had, and
Catch-up fires only Donations not fired at all in the run, so neither a
replay nor Catch-up ever fires one twice.
_Avoid_: duplicate (a duplicate is what deduplication drops; a Repeat is
wanted), replay.

### Donations and goals

**Donation**:
One donation DonationAlerts reports for the Account: who sent it (the name
the donor chose), the amount and its currency, the message and whether it is
text or audio. Fired as Donation Received. The amount is in the donor's
currency: DonationAlerts documents no amount in the streamer's own currency,
so a Condition on the amount also needs one on the currency. A message added
by hand in DonationAlerts' dashboard is a Donation like any other.
_Avoid_: alert (what DonationAlerts' widget shows), tip, payment.

**Test Donation**:
A Donation the streamer makes up in the Plugin Editor — name, amount,
currency, message — and the plugin fires as Donation Received with `isTest`
set, so a scenario can be tried end to end without money. It never reaches
DonationAlerts. DonationAlerts' own test alert never reaches the plugin.
_Avoid_: fake donation, simulation.

**Goal**:
A DonationAlerts donation goal: a title, whether it is active, a currency, the
amount it started from, the amount raised and the amount it aims for. Fired
as Goal Updated whenever DonationAlerts reports a change — every time it
moves, including after it is reached. The plugin keeps no Goal state: whether
a Goal is reached is a Condition on its Event Fields, and progress a deck shows
is the scenario's to keep in a Global Variable.
_Avoid_: target, fundraiser, collection.

**Recent Events**:
The Plugin Editor's list of the last 20 Donations and Goal updates the plugin
fired in this run, with Test Donations and those fired by Catch-up marked —
the Event itself does not say which. Held in memory only, so a streamer
can tell "the plugin never got it" from "the Event Filter did not let it
through".
_Avoid_: history, log.
