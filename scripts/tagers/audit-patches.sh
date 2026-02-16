#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  audit-patches.sh --branch <branch> --target <tag> [--base <tag>]

Goal:
  Identify which local patch commits are already present upstream between
  <base>..<target>, using git patch-id (exact patch match).

Output:
  Prints one line per local commit with:
    - status: UPSTREAM | LOCAL
    - local sha
    - subject
    - matching upstream sha (if UPSTREAM)

Notes:
  - This only catches exact patch matches. It will NOT catch "equivalent but
    different" upstream fixes.
EOF
}

BRANCH=""
BASE=""
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"; shift 2 || true ;;
    --base)
      BASE="${2:-}"; shift 2 || true ;;
    --target)
      TARGET="${2:-}"; shift 2 || true ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${BRANCH}" || -z "${TARGET}" ]]; then
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

if [[ -z "${BASE}" ]]; then
  BASE="$(git describe --tags --abbrev=0 "${BRANCH}" 2>/dev/null || true)"
fi

if [[ -z "${BASE}" ]]; then
  echo "Error: could not determine base tag for ${BRANCH}. Pass --base." >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "${BASE}" >/dev/null; then
  echo "Error: base ref not found: ${BASE}" >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "${TARGET}" >/dev/null; then
  echo "Error: target ref not found: ${TARGET}" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${tmpdir}"; }
trap cleanup EXIT

# Build patch-id maps (patch-id -> commit sha) for:
# - upstream changes: BASE..TARGET
# - local patches: BASE..BRANCH
git format-patch --stdout "${BASE}..${TARGET}" > "${tmpdir}/upstream.mbox" 2>/dev/null || true
git format-patch --stdout "${BASE}..${BRANCH}" > "${tmpdir}/local.mbox" 2>/dev/null || true

git patch-id --stable < "${tmpdir}/upstream.mbox" > "${tmpdir}/upstream.patchids" 2>/dev/null || true
git patch-id --stable < "${tmpdir}/local.mbox" > "${tmpdir}/local.patchids" 2>/dev/null || true

printf "branch=%s base=%s target=%s\n" "${BRANCH}" "${BASE}" "${TARGET}"

if [[ ! -s "${tmpdir}/local.patchids" ]]; then
  echo "No local commits in ${BASE}..${BRANCH}"
  exit 0
fi

awk '
  NR==FNR { upstream[$1]=$2; next }
  {
    pid=$1; sha=$2;
    if (pid in upstream) {
      printf("UPSTREAM %s %s\n", sha, upstream[pid]);
    } else {
      printf("LOCAL    %s -\n", sha);
    }
  }
' "${tmpdir}/upstream.patchids" "${tmpdir}/local.patchids" \
  | while read -r status local_sha upstream_sha; do
      subject="$(git show -s --format=%s "${local_sha}" 2>/dev/null || echo "?")"
      if [[ "${status}" == "UPSTREAM" ]]; then
        printf "%s %s %s (matches %s)\n" "${status}" "${local_sha:0:12}" "${subject}" "${upstream_sha:0:12}"
      else
        printf "%s %s %s\n" "${status}" "${local_sha:0:12}" "${subject}"
      fi
    done

