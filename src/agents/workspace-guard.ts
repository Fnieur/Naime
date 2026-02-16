import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { resolveUserPath } from "../utils.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
} from "./workspace.js";

// Keep the agent from "self-destructing" by restoring key workspace files if they go missing.
// This is intentionally narrow (restore missing only) to avoid breaking legitimate edits.

const PROTECTED_WORKSPACE_FILES = [
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
] as const;

const DEFAULT_KEEP_RUNS = 50;
const MEMORY_DIRNAME = "memory";
const MAX_MEMORY_FILES = 120;
const MAX_MEMORY_FILE_BYTES = 256 * 1024;

export type WorkspaceGuardSnapshot = {
  workspaceDir: string;
  backupDir: string;
  copied: string[];
};

function normalizeAgentId(agentId?: string) {
  const raw = agentId?.trim();
  if (!raw) {
    return "main";
  }
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return safe || "main";
}

function runId() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = [
    String(d.getFullYear()),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "-",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${ts}-${suffix}`;
}

async function copyFileIfExists(src: string, dest: string) {
  try {
    const stat = await fs.lstat(src);
    if (!stat.isFile()) {
      return false;
    }
    if (stat.isSymbolicLink()) {
      return false;
    }
    await fs.copyFile(src, dest);
    return true;
  } catch {
    return false;
  }
}

async function cleanupOldRuns(runsDir: string, keepRuns: number) {
  const keep = Number.isFinite(keepRuns) ? Math.max(0, Math.floor(keepRuns)) : DEFAULT_KEEP_RUNS;
  if (keep <= 0) {
    return;
  }
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .toSorted(); // runId prefix is time-sortable
    const extra = dirs.length - keep;
    if (extra <= 0) {
      return;
    }
    for (const name of dirs.slice(0, extra)) {
      await fs.rm(path.join(runsDir, name), { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup.
  }
}

async function snapshotMemoryDir(params: { workspaceDir: string; backupDir: string }) {
  const srcDir = path.join(params.workspaceDir, MEMORY_DIRNAME);
  const destDir = path.join(params.backupDir, MEMORY_DIRNAME);
  try {
    const stat = await fs.lstat(srcDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return [];
    }
  } catch {
    return [];
  }

  let entries: Array<{ name: string; src: string; size: number }> = [];
  try {
    const dirents = await fs.readdir(srcDir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (!dirent.isFile()) {
        continue;
      }
      const name = dirent.name;
      if (!name.toLowerCase().endsWith(".md")) {
        continue;
      }
      const src = path.join(srcDir, name);
      try {
        const stat = await fs.lstat(src);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          continue;
        }
        if (stat.size > MAX_MEMORY_FILE_BYTES) {
          continue;
        }
        entries.push({ name, src, size: stat.size });
      } catch {
        // ignore unreadable entries
      }
    }
  } catch {
    return [];
  }

  entries = entries
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .slice(Math.max(0, entries.length - MAX_MEMORY_FILES));
  if (entries.length === 0) {
    return [];
  }

  try {
    await fs.mkdir(destDir, { recursive: true });
  } catch {
    return [];
  }

  const copied: string[] = [];
  for (const entry of entries) {
    const dest = path.join(destDir, entry.name);
    if (await copyFileIfExists(entry.src, dest)) {
      copied.push(`${MEMORY_DIRNAME}/${entry.name}`);
    }
  }
  return copied;
}

async function restoreMemoryDirIfMissing(params: { workspaceDir: string; backupDir: string }) {
  const srcDir = path.join(params.backupDir, MEMORY_DIRNAME);
  const destDir = path.join(params.workspaceDir, MEMORY_DIRNAME);
  try {
    const stat = await fs.lstat(srcDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return [];
    }
  } catch {
    return [];
  }

  try {
    await fs.mkdir(destDir, { recursive: true });
  } catch {
    return [];
  }

  let dirents: Array<{ name: string }> = [];
  try {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    dirents = entries.filter((e) => e.isFile()).map((e) => ({ name: e.name }));
  } catch {
    return [];
  }

  const restored: string[] = [];
  for (const entry of dirents) {
    const name = entry.name;
    if (!name.toLowerCase().endsWith(".md")) {
      continue;
    }
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    try {
      await fs.access(dest);
      continue;
    } catch {
      // missing, restore
    }
    try {
      const stat = await fs.lstat(src);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        continue;
      }
      if (stat.size > MAX_MEMORY_FILE_BYTES) {
        continue;
      }
      await fs.copyFile(src, dest);
      restored.push(`${MEMORY_DIRNAME}/${name}`);
    } catch {
      // ignore restore failures
    }
  }
  return restored;
}

export async function snapshotWorkspaceGuard(params: {
  workspaceDir?: string;
  agentId?: string;
  keepRuns?: number;
}): Promise<WorkspaceGuardSnapshot | null> {
  const rawWorkspaceDir = params.workspaceDir?.trim() ?? "";
  if (!rawWorkspaceDir) {
    return null;
  }
  const workspaceDir = resolveUserPath(rawWorkspaceDir);
  const agentId = normalizeAgentId(params.agentId);

  // Keep backups out of the workspace, so "rm -rf workspace" doesn't wipe the backup too.
  const stateDir = resolveStateDir();
  const runsDir = path.join(stateDir, "workspace-guard", agentId, "runs");
  const backupDir = path.join(runsDir, runId());
  try {
    await fs.mkdir(backupDir, { recursive: true });
  } catch {
    return null;
  }

  const copied: string[] = [];
  for (const name of PROTECTED_WORKSPACE_FILES) {
    const src = path.join(workspaceDir, name);
    const dest = path.join(backupDir, name);
    if (await copyFileIfExists(src, dest)) {
      copied.push(name);
    }
  }

  copied.push(...(await snapshotMemoryDir({ workspaceDir, backupDir })));

  void cleanupOldRuns(runsDir, params.keepRuns ?? DEFAULT_KEEP_RUNS);

  return { workspaceDir, backupDir, copied };
}

export async function restoreWorkspaceGuardIfMissing(params: {
  workspaceDir?: string;
  backupDir?: string;
}): Promise<{ restored: string[] }> {
  const rawWorkspaceDir = params.workspaceDir?.trim() ?? "";
  const rawBackupDir = params.backupDir?.trim() ?? "";
  if (!rawWorkspaceDir || !rawBackupDir) {
    return { restored: [] };
  }

  const workspaceDir = resolveUserPath(rawWorkspaceDir);
  const backupDir = resolveUserPath(rawBackupDir);

  try {
    await fs.mkdir(workspaceDir, { recursive: true });
  } catch {
    return { restored: [] };
  }

  const restored: string[] = [];
  for (const name of PROTECTED_WORKSPACE_FILES) {
    const target = path.join(workspaceDir, name);
    try {
      await fs.access(target);
      continue;
    } catch {
      // missing, try restore
    }
    const backupFile = path.join(backupDir, name);
    try {
      await fs.copyFile(backupFile, target);
      restored.push(name);
    } catch {
      // ignore missing backups
    }
  }
  restored.push(...(await restoreMemoryDirIfMissing({ workspaceDir, backupDir })));
  return { restored };
}

export const __testing = {
  PROTECTED_WORKSPACE_FILES,
  normalizeAgentId,
};
