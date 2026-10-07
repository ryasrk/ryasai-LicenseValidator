# License renewal, triggered from the chat app

How `ryasai-chatbot` (or any other app) extends a customer's license on the License Validator. The License Validator does not decide when a license is renewed — the chat app does, for example after a payment succeeds, and tells the License Validator with one signed HTTP request.

The endpoint exists and is tested on the License Validator side. What remains is the call from the chat app, described here.

## The flow

1. The customer pays (or whatever event means "renew") in the chat app.
2. The chat app sends `POST /api/v1/license/renew` to the License Validator, signed with a shared secret.
3. The License Validator moves the license's expiry date and records the renewal.
4. The customer's running app sees the new expiry on its next `/license/validate` call. Nothing has to be restarted and the license key does not change.

## Setup, once

| Where | What |
|---|---|
| License Validator `.env` | `SECRET_KEY` must be set to a long random value. Renewal answers `503` while it is still the built-in placeholder. `install.sh` generates one. |
| Chat app config | The same value, plus the License Validator's base URL. Treat it like a password: it lets its holder extend any license. |
| Each license | Set its **Organisation Slug** in the dashboard (Licenses → open a license → Edit) to the organisation's slug in the chat app. Without it, renew by license key instead. |

## The request

```
POST /api/v1/license/renew
Content-Type: application/json
X-Timestamp: 1791267098
X-Signature: 4c1f0b…(64 hex characters)

{"reference":"pay_8f3a2c","slug":"acme-corp","extend_days":30,"source":"ryasai-chatbot"}
```

### Body

| Field | Type | Required | Meaning |
|---|---|---|---|
| `reference` | string, ≤ 100 | yes | Your unique id for this renewal — the payment or invoice id. This is what makes retries safe (see below). |
| `slug` | string, ≤ 100 | one of the two | The organisation's slug. Exactly one active license must carry it. |
| `license_key` | string, ≤ 64 | one of the two | The license key, if you have it instead of a slug. |
| `extend_days` | integer, 1–3660 | one of the two | Days to add. |
| `expires_at` | string | one of the two | The new expiry as an ISO date or datetime. Must be in the future. A date alone (`2027-06-30`) means the end of that day, UTC. |
| `source` | string, ≤ 50 | no | Who sent it. Shown in the renewal history in the dashboard. |

Send exactly one of `slug` / `license_key`, and exactly one of `extend_days` / `expires_at`.

### How `extend_days` is applied

- License **not yet expired**: the days are added to its current expiry, so the customer keeps the time they had left. Expiry 31 Oct + 30 days = 30 Nov, whenever the request arrives.
- License **already expired**: the days are counted from now.

### Signature

```
signature = HMAC-SHA256(key = SECRET_KEY, message = "<timestamp>:POST:/api/v1/license/renew:<body>")
```

as lower-case hex.

- `<timestamp>` is the current unix time in seconds, the same value sent in `X-Timestamp`. The server rejects a timestamp more than 5 minutes from its own clock, so keep the chat app's clock in sync.
- `<body>` is the request body **exactly as sent**, byte for byte. Serialize the JSON once, sign that string, and send that same string. Signing an object and letting the HTTP library serialize it again can change spacing or key order and break the signature.
- The path is always `/api/v1/license/renew`, even if a proxy serves the License Validator under a prefix: the server signs the path it sees.

## Responses

### 200 — applied

```json
{
  "renewed": true,
  "reference": "pay_8f3a2c",
  "license_key": "RYASAI-9F2C41AB-07D3E6B1-C45A0F92",
  "slug": "acme-corp",
  "plan": "pro",
  "previous_expires_at": "2026-10-31T16:59:59.999000",
  "expires_at": "2026-11-30T16:59:59.999000"
}
```

Datetimes are UTC without a zone suffix.

### 200 — this reference was applied before

Same body with `"renewed": false`. Nothing changed; the values are those of the first time. Treat it as success.

### Errors

Every error has the form `{"detail": "…"}`.

| Status | When | What to do |
|---|---|---|
| `401` | Signature missing or wrong, or timestamp off by more than 5 minutes | Fix the secret, the signed string or the clock. Retrying unchanged will not help. |
| `404` | No license with that key, or no active license with that slug | The slug is not set on the license, or is misspelled. Fix it in the dashboard, then retry. |
| `409` | The license is revoked, is a lifetime license, or several active licenses share the slug | Needs a person: reactivate the license, or renew by `license_key`. |
| `422` | The body is not valid; `detail` names the field | Fix the request. |
| `429` | More than 30 requests in a minute from one address | Wait for the `Retry-After` header, then retry. |
| `503` | `SECRET_KEY` is not set on the License Validator | Set it and restart the License Validator. |
| `5xx` / no answer | Server or network trouble | Retry with the **same** `reference`. |

## Retries and `reference`

A renewal is a payment turned into license time, so it must happen exactly once. The License Validator stores each `reference` it has applied. A second request with the same `reference` changes nothing and returns the first result with `renewed: false`.

So:

- Use an id that already identifies the event on your side, such as the payment id. Do not generate a new random value per attempt.
- On a timeout or a 5xx, send the same request again. It is safe however many times you do.
- One payment, one reference. Two payments for the same organisation need two different references.

## Example: Node.js

```js
import { createHmac } from 'node:crypto'

const PATH = '/api/v1/license/renew'

export async function renewLicense({ slug, days, paymentId }) {
  const body = JSON.stringify({ reference: paymentId, slug, extend_days: days, source: 'ryasai-chatbot' })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', process.env.LICENSE_SECRET_KEY)
    .update(`${timestamp}:POST:${PATH}:${body}`)
    .digest('hex')

  const response = await fetch(process.env.LICENSE_SERVER_URL + PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': timestamp, 'X-Signature': signature },
    body, // the same string that was signed
  })
  const result = await response.json()
  if (!response.ok) throw new Error(`License renewal failed (${response.status}): ${result.detail}`)
  return result // { renewed, expires_at, ... }
}
```

## Example: Python

```python
import hashlib, hmac, json, os, time
import requests

PATH = "/api/v1/license/renew"

def renew_license(slug: str, days: int, payment_id: str) -> dict:
    body = json.dumps({"reference": payment_id, "slug": slug, "extend_days": days, "source": "ryasai-chatbot"})
    timestamp = str(int(time.time()))
    signature = hmac.new(
        os.environ["LICENSE_SECRET_KEY"].encode(),
        f"{timestamp}:POST:{PATH}:{body}".encode(),
        hashlib.sha256,
    ).hexdigest()

    response = requests.post(
        os.environ["LICENSE_SERVER_URL"] + PATH,
        data=body.encode(),  # the same string that was signed, not json=
        headers={"Content-Type": "application/json", "X-Timestamp": timestamp, "X-Signature": signature},
        timeout=10,
    )
    result = response.json()
    if not response.ok:
        raise RuntimeError(f"License renewal failed ({response.status_code}): {result.get('detail')}")
    return result
```

## Checking it worked

In the License Validator dashboard, open the license under **Licenses**. The **Expires** field shows the new date, and a **Renewals** section lists each applied renewal with its reference, source and old and new expiry.

## Decisions built into the endpoint

These were chosen while building it and can be changed if the business rule is different:

1. **Time left is kept.** Renewing early does not lose days.
2. **A revoked license is not reactivated by a renewal.** It answers `409`; an admin reactivates it first.
3. **A lifetime license cannot be renewed.** It has no expiry to move.
4. **Renewal changes only the expiry.** Plan and machine limit stay as they are; an upgrade is done in the dashboard or through the admin API.
5. **A slug must point at one active license.** If an organisation has several, renew each by `license_key`.
