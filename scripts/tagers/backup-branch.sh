#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  backup-branch.sh --branch <branch> [--out-dir <dir>]

Creates a lightweight upgrade backup:
  - status, describe, recent log
  - local patch series (format-patch) relative to nearest tag

Notes:
  - Backups are written under .tagers/backups/ by default (gitignored).
EOF
}

BRANCH=""
OUT_DIR=".tagers/backups"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"; shift 2 || true ;;
    --out-dir)
      OUT_DIR="${2:-}"; shift 2 || true ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${BRANCH}" ]]; then
  usage
  exit 2
fi

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Error: must run inside a git repo." >&2
  exit 1
}

if ! git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "Error: branch not found: ${BRANCH}" >&2
  exit 1
fi

ts="$(date -u +%Y%m%d-%H%M%S)"
dir="${OUT_DIR%/}/${ts}-${BRANCH//\//_}"
mkdir -p "${dir}"

{
  echo "branch=${BRANCH}"
  echo "created_utc=${ts}"
  echo "head=$(git rev-parse "${BRANCH}")"
  echo "describe=$(git describe --tags --long --always "${BRANCH}")"
  echo "nearest_tag=$(git describe --tags --abbrev=0 "${BRANCH}" 2>/dev/null || true)"
} > "${dir}/meta.env"

git status -sb > "${dir}/status.txt" || true
git log --oneline --decorate -100 "${BRANCH}" > "${dir}/log.txt" || true

base_tag="$(git describe --tags --abbrev=0 "${BRANCH}" 2>/dev/null || true)"
if [[ -n "${base_tag}" ]]; then
  git format-patch --stdout "${base_tag}..${BRANCH}" > "${dir}/local-patches.mbox" || true
  git diff "${base_tag}..${BRANCH}" > "${dir}/local-diff.patch" || true
else
  echo "Warning: no base tag found for ${BRANCH}; skipping patch backup." >&2
fi

echo "${dir}"

