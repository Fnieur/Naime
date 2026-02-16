import { spawn, execSync } from "node:child_process";

/**
 * Get all child PIDs for a given PID on Unix using pgrep.
 */
function getChildrenUnix(pid: number): number[] {
  try {
    // pgrep -P <pid> returns child PIDs, one per line.
    // Use stdio: 'pipe' to capture output, 'ignore' stderr.
    const output = execSync(`pgrep -P ${pid}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .trim()
      .split(/\s+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    // pgrep returns exit code 1 if no processes found, which throws error.
    return [];
  }
}

/**
 * Best-effort process-tree termination.
 * - Windows: use taskkill /T to include descendants.
 * - Unix: try process-group kill first; if that fails (e.g. shared group), manual tree traversal using pgrep.
 */
export function killProcessTree(pid: number): void {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        detached: true,
      });
    } catch {
      // ignore taskkill failures
    }
    return;
  }

  // Unix: Try process group kill first (most efficient)
  try {
    process.kill(-pid, "SIGKILL");
    return; // Success (pid was group leader)
  } catch (err) {
    // ESRCH: process not found or group not found
    // EPERM: permission denied (shouldn't happen if we own it)
    // If pid is not a group leader, process.kill(-pid) fails.
    // Fall back to manual tree traversal.
  }

  // Collect all descendants first (snapshot)
  const descendants: number[] = [];
  const queue = [pid];
  const seen = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const children = getChildrenUnix(current);
    for (const child of children) {
      descendants.push(child);
      queue.push(child);
    }
  }

  // Kill descendants (reverse order not strictly necessary for SIGKILL, but good practice)
  for (const childPid of descendants.reverse()) {
    try {
      process.kill(childPid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  // Finally kill the root
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // process already gone or inaccessible
  }
}
