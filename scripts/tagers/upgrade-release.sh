#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  upgrade-release.sh [--branch tagers/main] [--target <tag>|latest] [--remote upstream]

What it does:
  - Ensures a clean working tree
  - Fetches upstream tags
  - Creates a backup under .tagers/backups/
  - Rebases <branch> onto <target>
  - Prints a patch audit report (patch-id match) before/after

Examples:
  bash scripts/tagers/upgrade-release.sh --branch tagers/main --target latest
  bash scripts/tagers/upgrade-release.sh --branch tagers/main --target v2026.2.13
EOF
}

BRANCH="tagers/main"
TARGET="latest"
REMOTE="upstream"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"; shift 2 || true ;;
    --target)
      TARGET="${2:-}"; shift 2 || true ;;
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

if ! git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "Error: branch not found: ${BRANCH}" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree not clean. Commit/stash changes first." >&2
  git status -sb >&2 || true
  exit 1
fi

git fetch "${REMOTE}" --tags --prune --quiet

base_tag="$(git describe --tags --abbrev=0 "${BRANCH}" 2>/dev/null || true)"
if [[ -z "${base_tag}" ]]; then
  echo "Error: could not determine base tag for ${BRANCH}." >&2
  exit 1
fi

target_tag="${TARGET}"
if [[ "${TARGET}" == "latest" ]]; then
  target_tag="$(bash scripts/tagers/upstream-latest-tag.sh --remote "${REMOTE}")"
fi

if ! git rev-parse --verify --quiet "${target_tag}" >/dev/null; then
  echo "Error: target tag not found: ${target_tag}" >&2
  exit 1
fi

echo "branch=${BRANCH}"
echo "base=${base_tag}"
echo "target=${target_tag}"

if [[ "${base_tag}" == "${target_tag}" ]]; then
  echo "Already on ${target_tag} (nearest tag for ${BRANCH})."
  exit 0
fi

backup_dir="$(bash scripts/tagers/backup-branch.sh --branch "${BRANCH}")"
echo "backup=${backup_dir}"

echo
echo "Audit (before):"
bash scripts/tagers/audit-patches.sh --branch "${BRANCH}" --base "${base_tag}" --target "${target_tag}" || true

echo
echo "Rebasing ${BRANCH} onto ${target_tag}..."

current_branch="$(git branch --show-current || true)"
if [[ "${current_branch}" != "${BRANCH}" ]]; then
  git checkout "${BRANCH}"
fi

# Standard patch-queue rebase: apply local commits (since merge-base) onto the target tag.
set +e
git rebase "${target_tag}"
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  cat <<EOF >&2

Rebase stopped (conflicts or manual action needed).

Next steps:
  1) Resolve conflicts
  2) git add -A
  3) git rebase --continue

To abort:
  git rebase --abort

Backup is at:
  ${backup_dir}
EOF
  exit $rc
fi

echo
echo "Audit (after):"
nearest_tag="$(git describe --tags --abbrev=0 "${BRANCH}" 2>/dev/null || true)"
echo "nearest_tag=${nearest_tag}"
echo "local_commits_since_target:"
git log --oneline --decorate "${target_tag}..${BRANCH}" || true

echo
echo "OK: ${BRANCH} rebased onto ${target_tag}"
