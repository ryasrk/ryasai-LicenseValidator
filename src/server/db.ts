/** Database setup for License Validator (SQLite via node:sqlite). */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { settings } from './config'

export interface LicenseRow {
  id: string
  license_key: string
  customer_name: string
  customer_email: string
  plan: string // starter, pro, enterprise
  product: string // app identifier e.g. "d2t", "peopledet"
  max_machines: number
  is_active: number
  expires_at: string | null // null = lifetime
  created_at: string | null
  updated_at: string | null
  notes: string | null
}

export interface MachineActivationRow {
  id: string
  license_id: string
  machine_id: string
  hostname: string | null
  os_info: string | null
  ip_address: string | null
  first_seen: string | null
  last_seen: string | null
  is_active: number
}

export interface ValidationLogRow {
  id: string
  license_id: string | null
  license_key: string
  machine_id: string
  result: string // valid, invalid, inactive, wrong_product, expired, machine_limit
  ip_address: string | null
  timestamp: string | null
}

export interface AdminUserRow {
  id: string
  email: string
  password_hash: string
  is_active: number
  created_at: string | null
}

// Same DDL SQLAlchemy generated, so an existing license.db is picked up unchanged
const SCHEMA = `
CREATE TABLE IF NOT EXISTS licenses (
    id VARCHAR(36) NOT NULL,
    license_key VARCHAR(64) NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(200) NOT NULL,
    plan VARCHAR(20) NOT NULL,
    product VARCHAR(50) NOT NULL,
    max_machines INTEGER,
    is_active BOOLEAN,
    expires_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    notes TEXT,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_licenses_license_key ON licenses (license_key);

CREATE TABLE IF NOT EXISTS machine_activations (
    id VARCHAR(36) NOT NULL,
    license_id VARCHAR(36) NOT NULL,
    machine_id VARCHAR(64) NOT NULL,
    hostname VARCHAR(200),
    os_info VARCHAR(200),
    ip_address VARCHAR(45),
    first_seen DATETIME,
    last_seen DATETIME,
    is_active BOOLEAN,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_machine_activations_license_id ON machine_activations (license_id);

CREATE TABLE IF NOT EXISTS validation_logs (
    id VARCHAR(36) NOT NULL,
    license_id VARCHAR(36),
    license_key VARCHAR(64) NOT NULL,
    machine_id VARCHAR(64) NOT NULL,
    result VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45),
    timestamp DATETIME,
    metadata JSON,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(36) NOT NULL,
    email VARCHAR(200) NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    is_active BOOLEAN,
    created_at DATETIME,
    PRIMARY KEY (id),
    UNIQUE (email)
);
`

// Kept on globalThis so dev hot-reloads reuse one connection
const globalStore = globalThis as typeof globalThis & { __licenseDb?: DatabaseSync }

/** Open the database on first use and create all tables. */
export function getDb(): DatabaseSync {
  if (!globalStore.__licenseDb) {
    // Ensure data directory exists for SQLite file
    mkdirSync(dirname(settings.DATABASE_PATH), { recursive: true })
    const db = new DatabaseSync(settings.DATABASE_PATH)
    db.exec(SCHEMA)
    globalStore.__licenseDb = db
    console.info('License Manager: database initialized')
    if (!db.prepare('SELECT id FROM admin_users LIMIT 1').get()) {
      console.warn('No admin user found. First-login setup required at /api/v1/admin/auth/setup')
    }
  }
  return globalStore.__licenseDb
}
