-- ============================================================================
-- 1. Tabel Utama Lisensi (licenses)
-- Menyimpan kunci lisensi, batas kuota mesin, dan masa aktif
-- ============================================================================
CREATE TABLE IF NOT EXISTS licenses (
    id              VARCHAR(36)  NOT NULL,            -- UUID v4
    license_key     VARCHAR(64)  NOT NULL,            -- Format: PREFIX-XXXX-XXXX-XXXX
    customer_name   VARCHAR(200) NOT NULL,            -- Nama pemilik / organisasi
    customer_email  VARCHAR(200) NOT NULL,            -- Email pemilik
    plan            VARCHAR(20)  NOT NULL,            -- starter | pro | enterprise | flat
    product         VARCHAR(50)  NOT NULL DEFAULT '', -- Legacy/opsional (e.g. ryasai-chatbot, visia)
    slug            VARCHAR(100),                     -- Slug organisasi downstream (anchor perpanjangan otomatis)
    max_machines    INTEGER      DEFAULT 1,           -- Batas maksimal node mesin yang diizinkan aktif
    is_active       BOOLEAN      DEFAULT 1,           -- 1 = aktif, 0 = dinonaktifkan/revoked
    expires_at      DATETIME,                         -- Tanggal kedaluwarsa ISO 8601 (NULL = lifetime)
    created_at      DATETIME,                         -- Waktu pembuatan lisensi
    updated_at      DATETIME,                         -- Waktu pembaruan data lisensi
    notes           TEXT,                             -- Catatan admin
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_licenses_license_key ON licenses (license_key);
CREATE INDEX IF NOT EXISTS ix_licenses_slug ON licenses (slug);


-- ============================================================================
-- 2. Tabel Aktivasi Mesin (machine_activations)
-- Mencatat mesin/kontainer yang mengaktifkan lisensi
-- ============================================================================
CREATE TABLE IF NOT EXISTS machine_activations (
    id          VARCHAR(36)  NOT NULL,            -- UUID v4
    license_id  VARCHAR(36)  NOT NULL,            -- Foreign Key merujuk ke licenses.id
    machine_id  VARCHAR(64)  NOT NULL,            -- Identifier mesin stabil ({slug}:{host})
    hostname    VARCHAR(200),                     -- Nama host mesin
    os_info     VARCHAR(200),                     -- Informasi OS mesin klien
    ip_address  VARCHAR(45),                      -- IP publik/private klien saat request
    first_seen  DATETIME,                         -- Waktu aktivasi pertama kali
    last_seen   DATETIME,                         -- Waktu verifikasi heartbeat terakhir
    is_active   BOOLEAN      DEFAULT 1,           -- 1 = slot terpakai, 0 = slot telah dideaktivasi
    PRIMARY KEY (id),
    FOREIGN KEY (license_id) REFERENCES licenses (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_machine_activations_license_id ON machine_activations (license_id);


-- ============================================================================
-- 3. Tabel Riwayat Audit Validasi (validation_logs)
-- Log audit setiap kali endpoint /api/v1/license/validate dipanggil
-- ============================================================================
CREATE TABLE IF NOT EXISTS validation_logs (
    id          VARCHAR(36) NOT NULL,             -- UUID v4
    license_id  VARCHAR(36),                      -- Nullable jika kunci tidak ditemukan
    license_key VARCHAR(64) NOT NULL,             -- Kunci lisensi yang di-submit
    machine_id  VARCHAR(64) NOT NULL,             -- Machine ID yang di-submit
    result      VARCHAR(20) NOT NULL,             -- valid | invalid | inactive | expired | machine_limit
    ip_address  VARCHAR(45),                      -- IP pemanggil
    timestamp   DATETIME,                         -- Waktu percobaan validasi
    metadata    JSON,                             -- Data tambahan request
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_validation_logs_license_id ON validation_logs (license_id);


-- ============================================================================
-- 4. Tabel Administrator (admin_users)
-- Akun administrator untuk login ke Dashboard License Validator
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_users (
    id            VARCHAR(36)  NOT NULL,          -- UUID v4
    email         VARCHAR(200) NOT NULL,          -- Email login admin
    password_hash VARCHAR(200) NOT NULL,          -- Bcrypt hash (cost factor 12)
    is_active     BOOLEAN      DEFAULT 1,         -- Status keaktifan admin
    created_at    DATETIME,                       -- Waktu pembuatan akun
    PRIMARY KEY (id),
    UNIQUE (email)
);