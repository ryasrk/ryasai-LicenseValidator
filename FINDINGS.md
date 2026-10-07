# Findings — open points after the schema v1 rework

Things that now behave differently from before, decisions that were made without a product owner, and gaps that are still open. Each one says what to do if the current behaviour is not what you want.

Related: [NEW_SCHEMA.md](NEW_SCHEMA.md) for the database, [RENEWAL_TRIGGER_FROM_CHAT.md](RENEWAL_TRIGGER_FROM_CHAT.md) for renewal.

## Behaviour that changed

### 1. Machines sharing an IP can no longer share a slot

**Before:** any machine id arriving from the IP of a registered machine silently took over its record. With `max_machines = 1`, any number of machines behind one router or Docker host validated, taking turns on a single slot.

**Now:** a new machine id from the same IP still takes over the slot (this is what lets a recreated container keep working). But the machine it replaced is marked `replaced` and is refused with `machine_limit` for as long as its replacement keeps checking in. It can only come back through a free slot, or after the replacement has been silent for 24 hours.

**Effect on customers:** a customer who was running more machines than their license allows, behind one IP, will see the extra machines rejected. Raise `max_machines` on the license if that use is legitimate.

**Limit of the fix:** a client that sends a brand-new machine id on every call would always be accepted. The shipped client apps use a stable id, so this needs a modified client.

### 2. Machines not seen for 30 days lose their slot

`MACHINE_STALE_DAYS` (default `30`) marks an active machine `stale` when it has not validated for that long, freeing its slot. This also applies to machines already in the database the first time the new server starts.

A stale machine that checks in again gets a slot back if one is free. Set `MACHINE_STALE_DAYS=0` to never release slots automatically.

### 3. Expiry dates last through the end of the day

**Before:** a date-only expiry (`2027-12-31`) meant 00:00 UTC on that date, which is 07:00 WIB. A license died on the morning of its last day.

**Now:** the dashboard sends the end of the chosen day in the admin's own time zone. A date-only value sent straight to the API means 23:59:59.999 UTC.

Licenses created before this change keep the expiry they were stored with (start of day). Re-save the date in the dashboard to move it to end of day.

### 4. Dashboard times are shown in local time

The API returns UTC without a zone marker, and the dashboard used to read it as local time, so in WIB every time was shown 7 hours early. The dashboard now converts correctly. The API format itself is unchanged, because the signed validation response includes `expires_at` and client apps parse it.

### 5. First-time setup only accepts `ADMIN_EMAIL`

**Before:** on a fresh install, whoever opened the setup screen first became admin with any email.

**Now:** setup is refused unless the email equals `ADMIN_EMAIL` (default `admin@ryasai.com`). Set it in `.env` before the first start of a new deployment. Existing installs with an admin are not affected.

This raises the bar but is not a secret: someone who knows the configured address can still claim a fresh install. Do not leave a new deployment reachable before setup is done.

### 6. The validation-logs API response changed shape

`GET /api/v1/admin/validation-logs` returned a bare array. It now returns `{ total, limit, offset, data }` so the dashboard can page over all matches. Any script calling this endpoint has to read `.data`.

Other admin responses only gained fields (`status`, `is_expired`, `slug`, `notes`, `updated_at`, `active_machines`, `renewals`).

### 7. Log cleanup exists but is off

`LOG_RETENTION_DAYS` deletes validation logs older than that many days. The default is `0`, which keeps everything, so the table still grows without limit until someone sets it. Suggested: `180`.

### 8. Product check: a license without a product works for any app

The product check is in force: a license created for `ryasai-chatbot` is rejected (`wrong_product`) when another app, or an app sending no product, validates with it.

A license can now also be created with no product ("Any app" in the dashboard). Such a license validates for every app. Use it only when that is intended.

### 9. Client address behind a proxy is detected, not configured

`X-Forwarded-For` can be written by any client, so it is not trusted blindly:

- Connection from a **public** address: the header is ignored; the connection's own address is the client.
- Connection from a **loopback or private** address: taken to be a reverse proxy, and the last entry of the header is the client.

**Residual risk:** a client that reaches the server directly over a private network (same LAN, or through Docker's port mapping, where every connection appears to come from the Docker gateway) can still choose its own address with the header. That lets it sidestep the per-IP rate limits and pick which machine slot it matches. If the server is exposed this way with no proxy, set `TRUSTED_PROXY_HOPS=0` to never trust the header; with a known number of proxies, set that number.

The public-address path could not be exercised in testing, which ran on localhost; the loopback path and `TRUSTED_PROXY_HOPS=0` were tested.

## Decisions made without a product owner

These are in the renewal endpoint. Each is a one-place change in `src/server/routes/license.ts` if the business rule differs.

| Decision | Alternative |
|---|---|
| Renewing early keeps the time left: days are added to the current expiry | Count from the day of payment |
| An expired license extends from now | Extend from the old expiry (back-charging the gap) |
| A revoked license is refused (`409`), not reactivated | Let a payment reactivate it |
| A lifetime license is refused (`409`) | Ignore silently |
| Renewal changes only the expiry | Let the request also change plan or machine limit |
| A slug must match exactly one active license | Renew all licenses with that slug |

## Still open

### A. No password recovery

There is no email setup, so there is no "forgot password". Another admin can set a new password from the Admins page. If the only admin loses theirs, the account cannot be recovered through the app; the row in `admin_users` has to be fixed by hand. Create a second admin as a backup.

### B. `/license/deactivate` needs only the license key

Anyone holding a license key and a machine id can free that machine's slot. This was left as is because the shipped client apps call it without any other credential, and tightening it would break them. The damage is limited: the machine takes its slot back on its next validation if one is free.

### C. The dashboard has not been checked in a browser

The server side is covered by an automated run (fresh database and migrated old database) and every page loads, but the new screens — license edit form, machine removal, logs filters, Admins page — were not looked at by a person. Click through them once before relying on them.

### D. Request signing is only on renewal

`/license/validate` accepts unsigned requests, as before. The HMAC helper is in place (`src/server/hmac.ts`) but requiring it there means changing every client app first.

### E. API reference is maintained by hand

The in-app API Docs page is built from `src/lib/apiDocs.ts`, not generated from the routes. A route change that is not mirrored there leaves the page wrong without any error.

### F. `npm audit` reports 7 vulnerabilities

2 moderate and 5 high in dependencies, as of install. Not touched: `npm audit fix --force` can pull in breaking upgrades. Review them before going to production.
