# Upgrades (Tagers)

Objetivo: mantener OpenClaw siempre en el release mas reciente de upstream, pero conservando solo los cambios locales que siguen siendo necesarios (y eliminando los que upstream ya resolvio).

Este documento asume que usan un "patch queue" pequeno sobre tags de upstream.

## Estrategia de branches

- `upstream/main`: upstream sin cambios (remote).
- `tagers/main`: branch de deploy (upstream tag + parches locales).
- `fix/*`: branches temporales (solo para desarrollar/correcciones). Cuando algo queda, se cherry-pick a `tagers/main`.

Regla: `tagers/main` idealmente no lleva merges, solo commits lineales, para que el upgrade por `rebase` sea predecible.

## Workflow profesional por release

Cuando sale un release upstream:

1. Ver el release y los cambios:
   - Release page: https://github.com/openclaw/openclaw/releases
   - En el repo: `bash scripts/tagers/release-diff.sh <from_tag> <to_tag>`
2. Backup antes de tocar nada:
   - `bash scripts/tagers/backup-branch.sh --branch tagers/main`
3. Auditoria de parches locales (para decidir que tirar si upstream ya lo trae):
   - `bash scripts/tagers/audit-patches.sh --branch tagers/main --target <to_tag>`
4. Upgrade (rebase de `tagers/main` al tag nuevo):
   - `bash scripts/tagers/upgrade-release.sh --branch tagers/main --target <to_tag>`
5. Validacion local minima (antes de deploy):
   - `pnpm -s test:fast`
   - Si tocaron identidad/prompt: `pnpm -s vitest run --config vitest.e2e.config.ts src/agents/system-prompt.e2e.test.ts src/agents/cli-runner.e2e.test.ts`
   - Build: `pnpm -s build`
6. Deploy a prod (Vultr):
   - Hacer `git pull` en el host en el repo de build.
   - `pnpm i --frozen-lockfile` (o `pnpm i` si no fijan lock).
   - `pnpm -s build`
   - Restart: `docker compose restart openclaw-prod`
7. Post-deploy: proteger "identidad" y archivos base del agente en workspace:
   - Script: `scripts/harden-agent-docs.sh`
   - Ejemplo (dentro del host):
     - `docker exec -u root openclaw-prod bash /app/scripts/harden-agent-docs.sh /home/node/.openclaw/workspace-pulse/docs`
8. Verificacion:
   - UI: abrir `https://openclaw-tagers.tail81772f.ts.net/chat?session=global`
   - CLI health (si aplica): `openclaw health` o `openclaw status`

## Como decidir si un parche local ya no es necesario

Orden de preferencia:

1. Si al rebase el commit queda "empty" o Git te pide `--skip`, casi seguro ya esta en upstream (o dejo de aplicar).
2. Si `audit-patches.sh` marca `UPSTREAM` (patch-id match), elimina ese commit del patch queue.
3. Si no hay match pero sospechas que upstream ya lo resolvio:
   - Busca por string/archivo en upstream: `git log -S '...' <from>..<to> -- <path>`
   - Compara comportamiento con smoke test.

Regla practica: si un cambio es "workaround temporal", documentalo en el commit message (o en `.tagers/WORKLOG.md`) con el issue/PR upstream, para que sea facil retirarlo luego.

## Identidad / Workspace (Pulse)

Para evitar que el agente "pierda identidad" (IDENTITY/SOUL/TOOLS) por permisos:

- Mantener `IDENTITY.md`, `SOUL.md`, `TOOLS.md` como root:root 0444.
- Mantener `MEMORY.md` y `HEARTBEAT.md` editables pero no borrables (root:<group> 0664).
- Directorio `docs/` root-owned con sticky bit (1775).

Eso lo aplica `scripts/harden-agent-docs.sh`.
