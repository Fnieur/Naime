#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  harden-agent-docs.sh <target_dir> [--mode docs|workspace] [--agent-user node] [--agent-group node]

Goal:
  Keep the agent productive while preventing it from unexpectedly deleting
  or mutating identity-defining files.

What it does:
  - Always: sets <target_dir> to root-owned + sticky bit (mode 1775).

  Mode: docs (default)
    - Defaults all children under <target_dir> to <agent-user>:<agent-group>,
      dirs 0775 and files 0664 (skips symlinks).
    - Locks these files (root:root 0444) if present:
        IDENTITY.md, SOUL.md, TOOLS.md
    - Allows edits but prevents deletion/rename (root:<group> 0664) if present:
        MEMORY.md, HEARTBEAT.md

  Mode: workspace
    - Does NOT recursively chmod/chown the whole workspace (avoids touching
      large trees like node_modules/ and .git/).
    - Locks key top-level identity/config files (root:root 0444) if present:
        AGENTS.md, IDENTITY.md, SOUL.md, TOOLS.md, USER.md, CODING.md,
        BOOTSTRAP.md, ROLES.md
    - Allows edits but prevents deletion/rename for these top-level files
      (root:<group> 0664) if present:
        MEMORY.md, HEARTBEAT.md
    - If <target_dir>/docs exists, hardens it in docs mode.

Run this as root (e.g. `docker exec -u root ...`).
EOF
}

DOCS_DIR="${1:-}"
shift || true

AGENT_USER="node"
AGENT_GROUP="node"
MODE="docs"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"; shift 2 || true ;;
    --agent-user)
      AGENT_USER="${2:-}"; shift 2 || true ;;
    --agent-group)
      AGENT_GROUP="${2:-}"; shift 2 || true ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${DOCS_DIR}" ]]; then
  usage
  exit 2
fi

if [[ "$(id -u)" != "0" ]]; then
  echo "Error: must run as root (try: docker exec -u root ...)." >&2
  exit 1
fi

if ! id "${AGENT_USER}" >/dev/null 2>&1; then
  echo "Error: user not found: ${AGENT_USER}" >&2
  exit 1
fi

if ! getent group "${AGENT_GROUP}" >/dev/null 2>&1; then
  echo "Error: group not found: ${AGENT_GROUP}" >&2
  exit 1
fi

if [[ "${MODE}" != "docs" && "${MODE}" != "workspace" ]]; then
  echo "Error: invalid --mode: ${MODE} (expected: docs|workspace)" >&2
  exit 2
fi

mkdir -p "${DOCS_DIR}"

lock_readonly_root() {
  local f="$1"
  local p="${DOCS_DIR%/}/${f}"
  if [[ -f "${p}" ]]; then
    chown root:root "${p}"
    chmod 0444 "${p}"
  fi
}

lock_editable_group() {
  local f="$1"
  local p="${DOCS_DIR%/}/${f}"
  if [[ -f "${p}" ]]; then
    chown root:"${AGENT_GROUP}" "${p}"
    chmod 0664 "${p}"
  fi
}

harden_docs_tree() {
  local dir="$1"

  mkdir -p "${dir}"

  # 1) Directory policy: sticky bit + root-owned so the agent can't delete/rename
  #    files it doesn't own (even if it can write in the directory).
  chown root:"${AGENT_GROUP}" "${dir}"
  chmod 1775 "${dir}"

  # 2) Defaults for children (skip symlinks to avoid touching unexpected targets).
  find "${dir}" -mindepth 1 -type d -exec chown "${AGENT_USER}:${AGENT_GROUP}" {} + -exec chmod 0775 {} +
  find "${dir}" -mindepth 1 -type f -exec chown "${AGENT_USER}:${AGENT_GROUP}" {} + -exec chmod 0664 {} +

  # 3) Lock identity-defining docs files (read-only, root-owned).
  for f in IDENTITY.md SOUL.md TOOLS.md; do
    p="${dir%/}/${f}"
    if [[ -f "${p}" ]]; then
      chown root:root "${p}"
      chmod 0444 "${p}"
    fi
  done

  # 4) Allow edits but prevent deletion/rename (root-owned; writable via group).
  for f in MEMORY.md HEARTBEAT.md; do
    p="${dir%/}/${f}"
    if [[ -f "${p}" ]]; then
      chown root:"${AGENT_GROUP}" "${p}"
      chmod 0664 "${p}"
    fi
  done

  # 5) Re-assert directory policy in case an earlier operation changed it.
  chown root:"${AGENT_GROUP}" "${dir}"
  chmod 1775 "${dir}"
}

if [[ "${MODE}" == "docs" ]]; then
  harden_docs_tree "${DOCS_DIR}"
  echo "OK: hardened ${DOCS_DIR}"
  exit 0
fi

# MODE=workspace
# Directory policy: sticky bit + root-owned so the agent can't delete/rename
# files it doesn't own (even if it can write in the directory).
chown root:"${AGENT_GROUP}" "${DOCS_DIR}"
chmod 1775 "${DOCS_DIR}"

# Lock key top-level identity/config files.
for f in AGENTS.md IDENTITY.md SOUL.md TOOLS.md USER.md CODING.md BOOTSTRAP.md ROLES.md; do
  lock_readonly_root "$f"
done

# Allow edits but prevent deletion/rename (root-owned; writable via group).
for f in MEMORY.md HEARTBEAT.md; do
  lock_editable_group "$f"
done

# If docs exists, harden it in docs mode (recursive, but scoped to docs/ only).
if [[ -d "${DOCS_DIR%/}/docs" ]]; then
  harden_docs_tree "${DOCS_DIR%/}/docs"
fi

echo "OK: hardened ${DOCS_DIR} (workspace mode)"
