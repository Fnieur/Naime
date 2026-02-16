# Tagers OpenClaw Worklog

## 2026-02-14

- Upgraded to upstream tag: v2026.2.13 (local patch queue rebased on top).
- Added upgrade/runbook tooling:
  - .tagers/UPGRADING.md
  - scripts/tagers/{upstream-latest-tag,release-diff,backup-branch,audit-patches,upgrade-release}.sh
- Added workspace hardening script to protect Pulse identity/memory docs:
  - scripts/harden-agent-docs.sh

## 2026-02-02

- Added upstream remote: https://github.com/openclaw/openclaw.git
- Created and pushed branch: tagers/main (tracks origin/tagers/main)
- Branch strategy:
  - upstream/main: upstream only
  - tagers/main: our deploy branch (upstream + local patches)
  - fix/_ and feature/_: short-lived branches
- Recent patches in tagers/main:
  - Webchat assistant identity resolves default agent for non-agent session keys
    - commit: 63628f490
  - Webchat user message persistence
    - commit(s): caaa84fa7 + prior

## Notes

- Use rebase or merge to bring upstream/main into tagers/main.
- Cherry-pick upstreamable fixes into fix/\* branches and open PRs.
