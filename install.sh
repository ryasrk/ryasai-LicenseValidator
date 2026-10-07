#!/usr/bin/env bash
# Install dependencies and create a .env with fresh secrets if none exists.
set -euo pipefail
cd "$(dirname "$0")"

# node:sqlite (src/server/db.ts) needs a recent Node; the Dockerfile targets 24
REQUIRED_NODE_MAJOR=24

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed (need v${REQUIRED_NODE_MAJOR}+)." >&2
  exit 1
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "Error: Node.js v${REQUIRED_NODE_MAJOR}+ required, found $(node --version)." >&2
  exit 1
fi

echo "==> Installing dependencies"
npm ci

if [ -f .env ]; then
  echo "==> .env already exists, leaving it untouched"
else
  echo "==> Creating .env"
  secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'; }
  cat > .env <<EOF
# Shared with the apps that send signed requests (license renewal from the chat app)
SECRET_KEY=$(secret)
JWT_SECRET=$(secret)
JWT_EXPIRE_HOURS=24
# The only email the first-time setup accepts
ADMIN_EMAIL=admin@ryasai.com
DATABASE_URL=./data/license.db

# Comma-separated additional origins
CORS_ORIGINS=

# Reverse proxies (nginx, Caddy, ...) in front of this server that set X-Forwarded-For.
# Empty = detect: the header is believed only when the connection comes from a local or
# private address. Set 0 to never believe it, or the exact number of proxies to always do.
TRUSTED_PROXY_HOPS=

# An active machine not seen for this many days gives its slot back. 0 = never.
MACHINE_STALE_DAYS=30

# Validation logs older than this many days are deleted. 0 = keep forever.
LOG_RETENTION_DAYS=0

# Ed25519 private key (PKCS8 DER, hex) used to sign validation responses.
# Must match the public key shipped in the client apps, so it is not generated here.
LICENSE_SIGNING_PRIVATE_KEY=
EOF
  echo "    Set ADMIN_EMAIL and LICENSE_SIGNING_PRIVATE_KEY in .env before going live."
fi

echo "==> Done. Run ./start.sh to start the server."
