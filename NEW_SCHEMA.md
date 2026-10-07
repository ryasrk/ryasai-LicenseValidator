# Database Schema v1 — ryasai License Validator

The schema used by `ryasai-LicenseValidator` (SQLite through `node:sqlite`, file `./data/license.db`, which is `/app/data/license.db` in Docker). It replaces the schema described in `db.md` and `Welcome-261006.md`.

The source of truth is [src/server/db.ts](src/server/db.ts). If this file and the code disagree, the code is right.

## What changed from the old schema

| Old | New |
|---|---|
| `licenses.plan` free text | `licenses.plan_code` → master table `license_plans` |
| `licenses.is_active` boolean | `licenses.status_code` → master table `license_statuses` |
| `validation_logs.result` free text | `validation_logs.result_code` → master table `validation_results` |
| `machine_activations.is_active` boolean | `machine_activations.status_code` → master table `machine_statuses` |
| A new machine row on every re-activation | One row per `(license_id, machine_id)`, enforced by a unique index |
| No `slug` | `licenses.slug`, indexed |
| No renewal record | `license_renewals`, one row per applied renewal |
| No foreign keys | Foreign keys on every reference, enforced (`PRAGMA foreign_keys = ON`) |
| `max_machines` nullable, any value | `NOT NULL`, `CHECK (max_machines >= 1)` |
| `machine_id VARCHAR(64)` | `VARCHAR(255)`, so `{slug}:{host}` fits |
| `admin_users` without token control | `token_version`, `updated_at` |
| Schema changes by hand | `PRAGMA user_version` and a migration step per version |

The API still returns `plan`, `is_active` and `result` under those names, so existing clients are unaffected.

## Relations

```
license_plans ────────┐
  code (PK)           │ plan_code
                      ▼
license_statuses ──► licenses ◄──────────── license_renewals
  code (PK)   status_code   id (PK)   license_id (CASCADE)    id (PK)
                            license_key (UQ)                  reference (UQ)
                            slug (IX)
                              ▲      ▲
          license_id (CASCADE)│      │license_id (SET NULL)
                              │      │
machine_statuses ──► machine_activations     validation_logs ◄── validation_results
  code (PK)   status_code   id (PK)            id (PK)     result_code   code (PK)
                            (license_id, machine_id) UQ

admin_users   (stands alone)
```

## Master tables

Master rows are inserted with `INSERT OR IGNORE` every time the server starts, so adding a code means adding one line to `MASTERS` in `db.ts`. Rows already in the database are never overwritten, so a name edited by hand survives a restart. `GET /api/v1/admin/meta` returns all four tables; the dashboard builds its dropdowns from it.

### `license_plans` — type of license

| code | name |
|---|---|
| `starter` | Starter |
| `pro` | Pro |
| `enterprise` | Enterprise |
| `flat` | Flat |

### `license_statuses` — status of a license

| code | name | allows_validation | meaning |
|---|---|---|---|
| `active` | Active | 1 | Validates until it expires |
| `revoked` | Revoked | 0 | Disabled by an admin; every validation is rejected |

"Expired" is not a stored status. A license is expired when its status is `active` and `expires_at` is in the past; the API reports that as `is_expired`. Storing it would need a job to flip the status at the right moment, and a renewal would have to flip it back.

### `machine_statuses` — status of a machine on a license

| code | name | occupies_slot | set when |
|---|---|---|---|
| `active` | Active | 1 | The machine validated and holds a slot |
| `deactivated` | Deactivated | 0 | The client called `/license/deactivate`, or an admin removed it |
| `replaced` | Replaced | 0 | A new machine id from the same IP took over its slot |
| `stale` | Stale | 0 | It was not seen for `MACHINE_STALE_DAYS` (default 30) |

### `validation_results` — status of a validation attempt

| code | name | is_success | meaning |
|---|---|---|---|
| `valid` | Valid | 1 | License accepted |
| `invalid` | Invalid | 0 | License key not found |
| `inactive` | Inactive | 0 | License is revoked |
| `expired` | Expired | 0 | License is past its expiry date |
| `machine_limit` | Machine limit | 0 | No free machine slot |
| `wrong_product` | Wrong product | 0 | The license is for a different product |

## DDL

```sql
-- ============================================================================
-- Master tables
-- ============================================================================
CREATE TABLE license_plans (
    code        VARCHAR(20) NOT NULL,             -- starter | pro | enterprise | flat
    name        VARCHAR(50) NOT NULL,             -- label shown in the dashboard
    description TEXT,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

CREATE TABLE license_statuses (
    code              VARCHAR(20) NOT NULL,       -- active | revoked
    name              VARCHAR(50) NOT NULL,
    description       TEXT,
    allows_validation BOOLEAN     NOT NULL DEFAULT 0,  -- 1 = a license in this status can validate
    sort_order        INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

CREATE TABLE machine_statuses (
    code          VARCHAR(20) NOT NULL,           -- active | deactivated | replaced | stale
    name          VARCHAR(50) NOT NULL,
    description   TEXT,
    occupies_slot BOOLEAN     NOT NULL DEFAULT 0, -- 1 = counts against max_machines
    sort_order    INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

CREATE TABLE validation_results (
    code        VARCHAR(20) NOT NULL,             -- valid | invalid | inactive | expired | machine_limit | wrong_product
    name        VARCHAR(50) NOT NULL,
    description TEXT,
    is_success  BOOLEAN     NOT NULL DEFAULT 0,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

-- ============================================================================
-- licenses
-- ============================================================================
CREATE TABLE licenses (
    id             VARCHAR(36)  NOT NULL,                 -- UUID v4
    license_key    VARCHAR(64)  NOT NULL,                 -- PREFIX-XXXXXXXX-XXXXXXXX-XXXXXXXX
    customer_name  VARCHAR(200) NOT NULL,
    customer_email VARCHAR(200) NOT NULL,
    plan_code      VARCHAR(20)  NOT NULL DEFAULT 'starter',
    status_code    VARCHAR(20)  NOT NULL DEFAULT 'active',
    product        VARCHAR(50)  NOT NULL DEFAULT '',      -- app the license is for; '' = any app          
    slug           VARCHAR(100),                          -- organisation slug downstream; renewals address the license by it
    max_machines   INTEGER      NOT NULL DEFAULT 1 CHECK (max_machines >= 1),
    expires_at     DATETIME,                              -- NULL = lifetime
    created_at     DATETIME     NOT NULL,
    updated_at     DATETIME     NOT NULL,
    notes          TEXT,
    PRIMARY KEY (id),
    FOREIGN KEY (plan_code)   REFERENCES license_plans (code)    ON UPDATE CASCADE,
    FOREIGN KEY (status_code) REFERENCES license_statuses (code) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX ix_licenses_license_key ON licenses (license_key);
CREATE INDEX ix_licenses_slug        ON licenses (slug);
CREATE INDEX ix_licenses_status_code ON licenses (status_code);
CREATE INDEX ix_licenses_plan_code   ON licenses (plan_code);

-- ============================================================================
-- machine_activations — one row per machine id on a license
-- ============================================================================
CREATE TABLE machine_activations (
    id                VARCHAR(36)  NOT NULL,              -- UUID v4
    license_id        VARCHAR(36)  NOT NULL,
    machine_id        VARCHAR(255) NOT NULL,              -- stable id sent by the client ({slug}:{host})
    status_code       VARCHAR(20)  NOT NULL DEFAULT 'active',
    hostname          VARCHAR(200),
    os_info           VARCHAR(200),
    ip_address        VARCHAR(45),                        -- client address at its last validation
    first_seen        DATETIME     NOT NULL,
    last_seen         DATETIME     NOT NULL,              -- last successful validation
    status_changed_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY (license_id)  REFERENCES licenses (id)           ON DELETE CASCADE,
    FOREIGN KEY (status_code) REFERENCES machine_statuses (code) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX ux_machine_activations_license_machine ON machine_activations (license_id, machine_id);
CREATE INDEX ix_machine_activations_status_code ON machine_activations (status_code);

-- ============================================================================
-- validation_logs — one row per call to /api/v1/license/validate
-- ============================================================================
CREATE TABLE validation_logs (
    id          VARCHAR(36)  NOT NULL,                    -- UUID v4
    license_id  VARCHAR(36),                              -- NULL when the key was not found or the license was deleted
    license_key VARCHAR(64)  NOT NULL,                    -- the key as submitted
    machine_id  VARCHAR(255) NOT NULL,                    -- the machine id as submitted
    result_code VARCHAR(20)  NOT NULL,
    ip_address  VARCHAR(45),
    timestamp   DATETIME     NOT NULL,
    metadata    JSON,                                     -- {"product","version","hostname","os_info"} as sent, absent keys left out
    PRIMARY KEY (id),
    FOREIGN KEY (license_id)  REFERENCES licenses (id)             ON DELETE SET NULL,
    FOREIGN KEY (result_code) REFERENCES validation_results (code) ON UPDATE CASCADE
);
CREATE INDEX ix_validation_logs_license_id  ON validation_logs (license_id);
CREATE INDEX ix_validation_logs_timestamp   ON validation_logs (timestamp);
CREATE INDEX ix_validation_logs_result_code ON validation_logs (result_code);

-- ============================================================================
-- license_renewals — one row per renewal applied through /api/v1/license/renew
-- ============================================================================
CREATE TABLE license_renewals (
    id                  VARCHAR(36)  NOT NULL,            -- UUID v4
    license_id          VARCHAR(36)  NOT NULL,
    reference           VARCHAR(100) NOT NULL,            -- the caller's id for this renewal (e.g. payment id)
    source              VARCHAR(50),                      -- who sent it
    extend_days         INTEGER,                          -- NULL when an explicit expiry date was sent
    previous_expires_at DATETIME,
    new_expires_at      DATETIME     NOT NULL,
    created_at          DATETIME     NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (license_id) REFERENCES licenses (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ux_license_renewals_reference ON license_renewals (reference);
CREATE INDEX ix_license_renewals_license_id ON license_renewals (license_id);

-- ============================================================================
-- admin_users
-- ============================================================================
CREATE TABLE admin_users (
    id            VARCHAR(36)  NOT NULL,                  -- UUID v4
    email         VARCHAR(200) NOT NULL,
    password_hash VARCHAR(200) NOT NULL,                  -- bcrypt, cost 12
    is_active     BOOLEAN      NOT NULL DEFAULT 1,
    token_version INTEGER      NOT NULL DEFAULT 0,        -- bumped to invalidate every token issued before
    created_at    DATETIME     NOT NULL,
    updated_at    DATETIME,
    PRIMARY KEY (id),
    UNIQUE (email)
);
```

All datetimes are UTC without a zone, stored as `YYYY-MM-DD HH:MM:SS.ffffff` (the format the original Python server wrote) and returned by the API as `YYYY-MM-DDTHH:MM:SS.ffffff`.

## Rules the schema supports

### Validation (`POST /api/v1/license/validate`)

A license validates when all of these hold, checked in this order. The first failure decides the logged result.

1. The key exists — otherwise `invalid`.
2. Its status has `allows_validation = 1` — otherwise `inactive`.
3. `licenses.product` is empty, or equals the `product` the client sent — otherwise `wrong_product`.
4. `expires_at` is NULL or in the future — otherwise `expired`.
5. The machine gets a slot — otherwise `machine_limit`.

A license with an empty `product` works for any app. What the client sent is also recorded in `metadata`.

### Machine slots

- A machine id that is already `active` on the license just updates `last_seen`.
- Otherwise the server looks for an `active` machine on the same license with the **same IP address**. If there is one, the new id takes over its slot and the old one becomes `replaced`. This is what keeps a recreated container from using a second slot.
- A `replaced` machine may not do the same in return while its replacement is still checking in (it may after 24 hours of silence). Two live machines behind one IP therefore cannot share a slot: the second needs a free slot of its own.
- With no same-IP machine to take over, the machine needs a free slot: the count of `active` machines must be below `max_machines`.
- Before counting, `active` machines not seen for `MACHINE_STALE_DAYS` become `stale`.
- A machine that comes back gets its own row back; no second row is created.

### Deleting

- **Revoke** sets `status_code = 'revoked'`. Nothing is deleted.
- **Permanent delete** removes the license row. Its machines and renewals are deleted with it (`ON DELETE CASCADE`); its validation logs stay, with `license_id` set to NULL and the submitted `license_key` still on the row.

### Renewal

`license_renewals.reference` is unique. A renewal request whose reference is already in the table changes nothing and returns the stored result, so a retried request cannot extend a license twice. See `RENEWAL_TRIGGER_FROM_CHAT.md`.

### Admin tokens

A token carries the admin's `token_version` at sign-in. Deactivating an admin, or changing or resetting a password, bumps the version, and every earlier token is rejected.

## Migration

The schema version is kept in `PRAGMA user_version`. On start the server compares it with `SCHEMA_VERSION` in `db.ts` and runs the missing steps, each inside one transaction: it applies fully or not at all.

**Version 0 → 1** covers both a new, empty database and a database written by the old schema:

1. If old tables exist, the database file is copied to `license.db.v0.bak` next to it (once).
2. The four old tables are renamed, the new tables are created and the master rows inserted.
3. Rows are copied over:
   - `plan` → `plan_code`. A plan that is not in the master is added to `license_plans`, so no license is lost or changed.
   - `is_active` → `status_code` (`active` / `revoked`).
   - `max_machines` that is NULL or below 1 becomes 1.
   - An existing `slug` column is carried over.
   - Machines: several rows for the same machine on a license become one — the active row if there is one, otherwise the most recently seen — keeping the earliest `first_seen`. Rows whose license no longer exists are dropped.
   - Logs: `result` → `result_code`, with unknown results added to `validation_results`. A `license_id` pointing at a missing license becomes NULL.
   - Admins are copied with `token_version = 0`, so tokens issued before the migration keep working.
4. The old tables are dropped and `user_version` is set to 1.

To add a later change: bump `SCHEMA_VERSION`, add an `if (version < N)` step in `migrate()`, and update this file.

## Settings that affect this data

| Variable | Default | Effect |
|---|---|---|
| `DATABASE_URL` | `./data/license.db` | Where the database file is |
| `MACHINE_STALE_DAYS` | `30` | Days without a validation before an active machine becomes `stale`. `0` = never |
| `LOG_RETENTION_DAYS` | `0` | Validation logs older than this are deleted. `0` = keep forever |
| `TRUSTED_PROXY_HOPS` | unset | Decides which address is stored as `ip_address`. Unset = `X-Forwarded-For` is believed only when the connection comes from a local or private address (a reverse proxy). `0` = never believed. `N` = exactly N proxies in front |
| `ADMIN_EMAIL` | `admin@ryasai.com` | The only email the first-time setup accepts |
| `SECRET_KEY` | placeholder | Signs renewal requests. Renewal is refused while it is the placeholder |
