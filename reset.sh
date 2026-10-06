#!/usr/bin/env bash
# Wipe local state: the SQLite database (all licenses, activations, logs and the
# admin account) and the Next.js build cache.
#   ./reset.sh          data/ and .next/
#   ./reset.sh --all    also node_modules/ and .env
#   -y, --yes           skip the confirmation prompt
set -euo pipefail
cd "$(dirname "$0")"

all=false
yes=false
for arg in "$@"; do
  case "$arg" in
    --all) all=true ;;
    -y | --yes) yes=true ;;
    *)
      echo "Usage: $0 [--all] [-y|--yes]" >&2
      exit 1
      ;;
  esac
done

# Assumes the default DATABASE_URL (./data/license.db)
targets=(data .next)
if [ "$all" = true ]; then
  targets+=(node_modules .env)
fi

existing=()
for target in "${targets[@]}"; do
  if [ -e "$target" ]; then
    existing+=("$target")
  fi
done

if [ ${#existing[@]} -eq 0 ]; then
  echo "Nothing to reset."
  exit 0
fi

echo "This will permanently delete:"
printf '  %s\n' "${existing[@]}"

if [ "$yes" != true ]; then
  read -r -p "Continue? [y/N] " answer
  case "$answer" in
    y | Y | yes | YES) ;;
    *)
      echo "Aborted."
      exit 1
      ;;
  esac
fi

rm -rf -- "${existing[@]}"

if [ "$all" = true ]; then
  echo "==> Reset complete. Run ./install.sh, then ./start.sh."
else
  echo "==> Reset complete. Run ./start.sh to start with an empty database."
fi
