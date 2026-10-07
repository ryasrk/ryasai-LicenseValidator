/** Database setup for License Validator (SQLite via node:sqlite). The schema is documented in NEW_SCHEMA.md. */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { settings } from './config'
import { nowDb } from './time'

// ─── Master (lookup) rows ────────────────────────────────────────────────────

export interface LicensePlanRow {
  code: string // starter, pro, enterprise, flat
  name: string
  description: string | null
  sort_order: number
}

export interface LicenseStatusRow {
  code: string // active, revoked
  name: string
  description: string | null
  allows_validation: number
  sort_order: number
}

export interface MachineStatusRow {
  code: string // active, deactivated, replaced, stale
  name: string
  description: string | null
  occupies_slot: number
  sort_order: number
}

export interface ValidationResultRow {
  code: string // valid, invalid, inactive, expired, machine_limit, wrong_product
  name: string
  description: string | null
  is_success: number
  sort_order: number
}

// ─── Data rows ───────────────────────────────────────────────────────────────

export interface LicenseRow {
  id: string
  license_key: string
  customer_name: string
  customer_email: string
  plan_code: string // -> license_plans.code
  status_code: string // -> license_statuses.code
  product: string // app identifier e.g. "ryasai-chatbot"; '' = valid for any app
  slug: string | null // downstream organisation slug; renewals are addressed by it
  max_machines: number
  expires_at: string | null // null = lifetime
  created_at: string
  updated_at: string
  notes: string | null
}

export interface MachineActivationRow {
  id: string
  license_id: string
  machine_id: string
  status_code: string // -> machine_statuses.code
  hostname: string | null
  os_info: string | null
  ip_address: string | null
  first_seen: string
  last_seen: string
  status_changed_at: string | null
}

export interface ValidationLogRow {
  id: string
  license_id: string | null
  license_key: string
  machine_id: string
  result_code: string // -> validation_results.code
  ip_address: string | null
  timestamp: string
  metadata: string | null // JSON: what the client sent besides the key and machine id
}

export interface LicenseRenewalRow {
  id: string
  license_id: string
  reference: string // caller's idempotency key (e.g. the payment id)
  source: string | null
  extend_days: number | null
  previous_expires_at: string | null
  new_expires_at: string
  created_at: string
}

export interface AdminUserRow {
  id: string
  email: string
  password_hash: string
  is_active: number
  token_version: number // bumped to invalidate every token issued before
  created_at: string
  updated_at: string | null
}

// ─── Schema ──────────────────────────────────────────────────────────────────

/** Bump when the schema changes, and add the step to migrate(). */
const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE license_plans (
    code VARCHAR(20) NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

CREATE TABLE license_statuses (
    code VARCHAR(20) NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    allows_validation BOOLEAN NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

CREATE TABLE machine_statuses (
    code VARCHAR(20) NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    occupies_slot BOOLEAN NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

CREATE TABLE validation_results (
    code VARCHAR(20) NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_success BOOLEAN NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
);

CREATE TABLE licenses (
    id VARCHAR(36) NOT NULL,
    license_key VARCHAR(64) NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(200) NOT NULL,
    plan_code VARCHAR(20) NOT NULL DEFAULT 'starter',
    status_code VARCHAR(20) NOT NULL DEFAULT 'active',
    product VARCHAR(50) NOT NULL DEFAULT '',
    slug VARCHAR(100),
    max_machines INTEGER NOT NULL DEFAULT 1 CHECK (max_machines >= 1),
    expires_at DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    notes TEXT,
    PRIMARY KEY (id),
    FOREIGN KEY (plan_code) REFERENCES license_plans (code) ON UPDATE CASCADE,
    FOREIGN KEY (status_code) REFERENCES license_statuses (code) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX ix_licenses_license_key ON licenses (license_key);
CREATE INDEX ix_licenses_slug ON licenses (slug);
CREATE INDEX ix_licenses_status_code ON licenses (status_code);
CREATE INDEX ix_licenses_plan_code ON licenses (plan_code);

CREATE TABLE machine_activations (
    id VARCHAR(36) NOT NULL,
    license_id VARCHAR(36) NOT NULL,
    machine_id VARCHAR(255) NOT NULL,
    status_code VARCHAR(20) NOT NULL DEFAULT 'active',
    hostname VARCHAR(200),
    os_info VARCHAR(200),
    ip_address VARCHAR(45),
    first_seen DATETIME NOT NULL,
    last_seen DATETIME NOT NULL,
    status_changed_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY (license_id) REFERENCES licenses (id) ON DELETE CASCADE,
    FOREIGN KEY (status_code) REFERENCES machine_statuses (code) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX ux_machine_activations_license_machine ON machine_activations (license_id, machine_id);
CREATE INDEX ix_machine_activations_status_code ON machine_activations (status_code);

CREATE TABLE validation_logs (
    id VARCHAR(36) NOT NULL,
    license_id VARCHAR(36),
    license_key VARCHAR(64) NOT NULL,
    machine_id VARCHAR(255) NOT NULL,
    result_code VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45),
    timestamp DATETIME NOT NULL,
    metadata JSON,
    PRIMARY KEY (id),
    FOREIGN KEY (license_id) REFERENCES licenses (id) ON DELETE SET NULL,
    FOREIGN KEY (result_code) REFERENCES validation_results (code) ON UPDATE CASCADE
);
CREATE INDEX ix_validation_logs_license_id ON validation_logs (license_id);
CREATE INDEX ix_validation_logs_timestamp ON validation_logs (timestamp);
CREATE INDEX ix_validation_logs_result_code ON validation_logs (result_code);

CREATE TABLE license_renewals (
    id VARCHAR(36) NOT NULL,
    license_id VARCHAR(36) NOT NULL,
    reference VARCHAR(100) NOT NULL,
    source VARCHAR(50),
    extend_days INTEGER,
    previous_expires_at DATETIME,
    new_expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (license_id) REFERENCES licenses (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ux_license_renewals_reference ON license_renewals (reference);
CREATE INDEX ix_license_renewals_license_id ON license_renewals (license_id);

CREATE TABLE admin_users (
    id VARCHAR(36) NOT NULL,
    email VARCHAR(200) NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME,
    PRIMARY KEY (id),
    UNIQUE (email)
);
`

/** Master rows, inserted on every start so a new code only needs adding here. Existing rows are left alone. */
const MASTERS = `
INSERT OR IGNORE INTO license_plans (code, name, description, sort_order) VALUES
    ('starter', 'Starter', 'Entry plan', 10),
    ('pro', 'Pro', 'Professional plan', 20),
    ('enterprise', 'Enterprise', 'Enterprise plan', 30),
    ('flat', 'Flat', 'Flat-rate plan', 40);

INSERT OR IGNORE INTO license_statuses (code, name, description, allows_validation, sort_order) VALUES
    ('active', 'Active', 'Validates until it expires', 1, 10),
    ('revoked', 'Revoked', 'Disabled by an admin; every validation is rejected', 0, 20);

INSERT OR IGNORE INTO machine_statuses (code, name, description, occupies_slot, sort_order) VALUES
    ('active', 'Active', 'Holds a machine slot', 1, 10),
    ('deactivated', 'Deactivated', 'Released by the client app or an admin', 0, 20),
    ('replaced', 'Replaced', 'Its slot was taken over by a new machine id from the same IP', 0, 30),
    ('stale', 'Stale', 'Released automatically after not being seen for MACHINE_STALE_DAYS', 0, 40);

INSERT OR IGNORE INTO validation_results (code, name, description, is_success, sort_order) VALUES
    ('valid', 'Valid', 'License accepted', 1, 10),
    ('invalid', 'Invalid', 'License key not found', 0, 20),
    ('inactive', 'Inactive', 'License is revoked', 0, 30),
    ('expired', 'Expired', 'License is past its expiry date', 0, 40),
    ('machine_limit', 'Machine limit', 'No free machine slot', 0, 50),
    ('wrong_product', 'Wrong product', 'License is for a different product', 0, 60);

-- Wording from when the product check was briefly removed
UPDATE validation_results SET description = 'License is for a different product'
WHERE code = 'wrong_product' AND description LIKE 'Legacy:%';
`

const LEGACY_TABLES = ['licenses', 'machine_activations', 'validation_logs', 'admin_users']

// ─── Migration ───────────────────────────────────────────────────────────────

function tableExists(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column)
}

/**
 * Version 0 -> 1: the normalized schema. A database written by the Python server (or by
 * this server before the masters existed) has its four tables rebuilt and its rows copied over.
 */
function migrateToV1(db: DatabaseSync) {
  const legacy = LEGACY_TABLES.filter((table) => tableExists(db, table))

  for (const table of legacy) {
    // An index keeps its name when its table is renamed, so the old ones have to go first
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL")
      .all(table) as { name: string }[]
    for (const index of indexes) db.exec(`DROP INDEX "${index.name}"`)
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_legacy`)
  }

  db.exec(SCHEMA)
  db.exec(MASTERS)

  const now = nowDb()
  const had = (table: string) => legacy.includes(table)

  if (had('licenses')) {
    // Plans were free text: keep any unknown one as a master row instead of losing it
    db.exec(`
      INSERT OR IGNORE INTO license_plans (code, name, sort_order)
      SELECT DISTINCT plan, plan, 100 FROM licenses_legacy WHERE plan IS NOT NULL`)
    const slug = hasColumn(db, 'licenses_legacy', 'slug') ? 'slug' : 'NULL'
    db.prepare(`
      INSERT INTO licenses
        (id, license_key, customer_name, customer_email, plan_code, status_code, product, slug,
         max_machines, expires_at, created_at, updated_at, notes)
      SELECT id, license_key, customer_name, customer_email, COALESCE(plan, 'starter'),
             CASE WHEN COALESCE(is_active, 1) THEN 'active' ELSE 'revoked' END,
             COALESCE(product, ''), ${slug}, MAX(1, COALESCE(max_machines, 1)), expires_at,
             COALESCE(created_at, ?), COALESCE(updated_at, created_at, ?), notes
      FROM licenses_legacy`).run(now, now)
  }

  if (had('machine_activations')) {
    // One row per machine now: keep the active (else the most recent) row, and its earliest first_seen
    db.prepare(`
      INSERT INTO machine_activations
        (id, license_id, machine_id, status_code, hostname, os_info, ip_address, first_seen, last_seen)
      SELECT id, license_id, machine_id, CASE WHEN COALESCE(is_active, 1) THEN 'active' ELSE 'deactivated' END,
             hostname, os_info, ip_address, COALESCE(earliest, last_seen, ?), COALESCE(last_seen, first_seen, ?)
      FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY license_id, machine_id ORDER BY COALESCE(is_active, 1) DESC, last_seen DESC) AS rn,
               MIN(first_seen) OVER (PARTITION BY license_id, machine_id) AS earliest
        FROM machine_activations_legacy
      )
      WHERE rn = 1 AND license_id IN (SELECT id FROM licenses)`).run(now, now)
  }

  if (had('validation_logs')) {
    db.exec(`
      INSERT OR IGNORE INTO validation_results (code, name, sort_order)
      SELECT DISTINCT result, result, 100 FROM validation_logs_legacy WHERE result IS NOT NULL`)
    const metadata = hasColumn(db, 'validation_logs_legacy', 'metadata') ? 'metadata' : 'NULL'
    db.prepare(`
      INSERT INTO validation_logs (id, license_id, license_key, machine_id, result_code, ip_address, timestamp, metadata)
      SELECT id, CASE WHEN license_id IN (SELECT id FROM licenses) THEN license_id END,
             license_key, machine_id, result, ip_address, COALESCE(timestamp, ?), ${metadata}
      FROM validation_logs_legacy`).run(now)
  }

  if (had('admin_users')) {
    db.prepare(`
      INSERT INTO admin_users (id, email, password_hash, is_active, created_at)
      SELECT id, email, password_hash, COALESCE(is_active, 1), COALESCE(created_at, ?) FROM admin_users_legacy`).run(now)
  }

  for (const table of legacy) db.exec(`DROP TABLE ${table}_legacy`)
}

/** Bring the database up to SCHEMA_VERSION. Each step runs in a transaction: it applies fully or not at all. */
function migrate(db: DatabaseSync, path: string) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (version >= SCHEMA_VERSION) return

  // Keep the pre-migration file, once, next to the database
  const backup = `${path}.v${version}.bak`
  if (LEGACY_TABLES.some((table) => tableExists(db, table)) && existsSync(path) && !existsSync(backup)) {
    copyFileSync(path, backup)
    console.info(`License Manager: database backed up to ${backup} before migrating`)
  }

  // Foreign keys cannot be switched inside a transaction, and must be off while tables are rebuilt
  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN')
  try {
    if (version < 1) migrateToV1(db)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  console.info(`License Manager: database migrated from schema v${version} to v${SCHEMA_VERSION}`)
}

// ─── Connection ──────────────────────────────────────────────────────────────

// Kept on globalThis so dev hot-reloads reuse one connection
const globalStore = globalThis as typeof globalThis & { __licenseDb?: DatabaseSync }

/** Open the database on first use, migrate it and make sure the master rows exist. */
export function getDb(): DatabaseSync {
  if (!globalStore.__licenseDb) {
    // Ensure data directory exists for SQLite file
    mkdirSync(dirname(settings.DATABASE_PATH), { recursive: true })
    const db = new DatabaseSync(settings.DATABASE_PATH)
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db, settings.DATABASE_PATH)
    db.exec(MASTERS)
    globalStore.__licenseDb = db
    console.info('License Manager: database initialized')
    if (!db.prepare('SELECT id FROM admin_users LIMIT 1').get()) {
      console.warn('No admin user found. First-login setup required at /api/v1/admin/auth/setup')
    }
  }
  return globalStore.__licenseDb
}

/** Run fn in a transaction; it is rolled back if fn throws. */
export function transaction<T>(fn: () => T): T {
  const db = getDb()
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** LIKE pattern matching `text` literally anywhere (use with ESCAPE '\'): % and _ are not wildcards. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}
