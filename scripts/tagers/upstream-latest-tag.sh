#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  upstream-latest-tag.sh [--remote upstream]

Prints the latest upstream release tag (e.g. v2026.2.13) by version sort.
EOF
}

REMOTE="upstream"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      REMOTE="${2:-}"; shift 2 || true ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Error: must run inside a git repo." >&2
  exit 1
}

git fetch "${REMOTE}" --tags --quiet

latest="$(
  git tag --list 'v*' --sort=-version:refname \
    | grep -E '^v[0-9]{4}\.[0-9]+\.[0-9]+([-.][0-9]+)?$' \
    | head -n 1 || true
)"

if [[ -z "${latest}" ]]; then
  echo "Error: could not determine latest tag." >&2
  exit 1
fi

echo "${latest}"
