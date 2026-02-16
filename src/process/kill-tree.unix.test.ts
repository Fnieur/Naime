import { describe, it, expect, vi, afterEach } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { killProcessTree } from "./kill-tree.js";

// Skip on Windows for now (requires different test strategy)
const isWindows = process.platform === "win32";

describe.skipIf(isWindows)("killProcessTree (Unix)", () => {
  const children: ChildProcess[] = [];

  afterEach(() => {
    for (const child of children) {
      if (child.pid) {
        try {
          process.kill(child.pid, "SIGKILL");
        } catch {}
      }
    }
    children.length = 0;
  });

  it("kills a process tree using manual traversal when group kill fails", async () => {
    // Spawn a parent process that spawns a child
    // We use a shell script that ignores SIGTERM to ensure we need SIGKILL
    // and creates a child that stays alive.
    const script = `
      sh -c 'sleep 100' &
      child_pid=$!
      echo $child_pid
      trap "echo ignoring signal" TERM
      sleep 100
    `;
    
    // Spawn shell. NOT detached, so shares our PGID.
    // killProcessTree(-pid) should fail, triggering manual traversal.
    const parent = spawn("sh", ["-c", script], { stdio: ["pipe", "pipe", "pipe"] });
    children.push(parent);

    const parentPid = parent.pid!;
    expect(parentPid).toBeDefined();

    // Wait for child PID output
    const childPidStr = await new Promise<string>((resolve) => {
      parent.stdout.once("data", (d) => resolve(d.toString().trim()));
    });
    const childPid = Number.parseInt(childPidStr, 10);
    expect(childPid).toBeGreaterThan(0);

    // Verify both are running
    expect(() => process.kill(parentPid, 0)).not.toThrow();
    expect(() => process.kill(childPid, 0)).not.toThrow();

    // Kill the tree
    killProcessTree(parentPid);

    // Wait a bit for system to process signals
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify both are dead
    let parentAlive = true;
    try {
      process.kill(parentPid, 0);
    } catch {
      parentAlive = false;
    }

    let childAlive = true;
    try {
      process.kill(childPid, 0);
    } catch {
      childAlive = false;
    }

    expect(parentAlive).toBe(false);
    expect(childAlive).toBe(false);
  });
});
