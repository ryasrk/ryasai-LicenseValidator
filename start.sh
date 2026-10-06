#!/usr/bin/env bash
# Start the server on port 9000.
#   ./start.sh          development (hot reload)
#   ./start.sh --prod   production (build, then serve)
set -euo pipefail
cd "$(dirname "$0")"

mode=dev
case "${1:-}" in
  "") ;;
  --prod) mode=prod ;;
  *)
    echo "Usage: $0 [--prod]" >&2
    exit 1
    ;;
esac

if [ ! -d node_modules ]; then
  echo "Error: dependencies are not installed. Run ./install.sh first." >&2
  exit 1
fi

if [ "$mode" = prod ]; then
  echo "==> Building"
  npm run build
  echo "==> Starting production server on http://localhost:9000"
  exec npm start
fi

echo "==> Starting dev server on http://localhost:9000"
exec npm run dev
