import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecApprovalsResolved } from "../infra/exec-approvals.js";

const isWin = process.platform === "win32";

vi.mock("../infra/shell-env.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../infra/shell-env.js")>();
  return {
    ...mod,
    getShellPathFromLoginShell: () => null,
  };
});

vi.mock("../infra/exec-approvals.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../infra/exec-approvals.js")>();
  const approvals: ExecApprovalsResolved = {
    path: "/tmp/exec-approvals.json",
    socketPath: "/tmp/exec-approvals.sock",
    token: "token",
    defaults: {
      security: "full",
      ask: "off",
      askFallback: "full",
      autoAllowSkills: false,
    },
    agent: {
      security: "full",
      ask: "off",
      askFallback: "full",
      autoAllowSkills: false,
    },
    allowlist: [],
    file: {
      version: 1,
      socket: { path: "/tmp/exec-approvals.sock", token: "token" },
      defaults: {
        security: "full",
        ask: "off",
        askFallback: "full",
        autoAllowSkills: false,
      },
      agents: {},
    },
  };
  return { ...mod, resolveExecApprovals: () => approvals };
});

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("exec workspace guard", () => {
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;

  afterEach(() => {
    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }
  });

  it("restores protected workspace files if they are deleted by exec", async () => {
    if (isWin) {
      return;
    }

    await withTempDir("openclaw-ws-", async (workspaceDir) => {
      await withTempDir("openclaw-state-", async (stateDir) => {
        process.env.OPENCLAW_STATE_DIR = stateDir;

        const soulPath = path.join(workspaceDir, "SOUL.md");
        const originalSoul = "# Soul\n\nUnique content\n";
        await fs.writeFile(soulPath, originalSoul, "utf8");

        const memoryDir = path.join(workspaceDir, "memory");
        const memoryPath = path.join(memoryDir, "2026-02-14.md");
        const originalMemory = "daily log\n";
        await fs.mkdir(memoryDir, { recursive: true });
        await fs.writeFile(memoryPath, originalMemory, "utf8");

        const { createExecTool } = await import("./bash-tools.exec.js");
        const tool = createExecTool({
          host: "gateway",
          security: "full",
          ask: "off",
          allowBackground: false,
          cwd: workspaceDir,
        });

        await tool.execute("call1", { command: "rm -f SOUL.md && rm -rf memory" });

        const restored = await fs.readFile(soulPath, "utf8");
        expect(restored).toBe(originalSoul);

        const restoredMemory = await fs.readFile(memoryPath, "utf8");
        expect(restoredMemory).toBe(originalMemory);
      });
    });
  });
});
