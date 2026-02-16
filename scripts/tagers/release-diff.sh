#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  release-diff.sh <from_tag> <to_tag>

Prints:
  - commits (oneline)
  - diffstat
  - name-status
EOF
}

FROM="${1:-}"
TO="${2:-}"

if [[ -z "${FROM}" || -z "${TO}" ]]; then
  usage
  exit 2
fi

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Error: must run inside a git repo." >&2
  exit 1
}

if ! git rev-parse --verify --quiet "${FROM}" >/dev/null; then
  echo "Error: ref not found: ${FROM}" >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "${TO}" >/dev/null; then
  echo "Error: ref not found: ${TO}" >&2
  exit 1
fi

echo "from=${FROM}"
echo "to=${TO}"
echo

echo "Commits:"
git log --oneline --no-merges "${FROM}..${TO}" || true
echo

echo "Diffstat:"
git diff --stat "${FROM}..${TO}" || true
echo

echo "Files:"
git diff --name-status "${FROM}..${TO}" || true

