import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPatch } from "./apply-patch.js";

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("apply_patch workspace protections", () => {
  it("refuses to delete SOUL.md", async () => {
    await withTempDir("openclaw-apply-patch-", async (cwd) => {
      await fs.writeFile(path.join(cwd, "SOUL.md"), "# soul", "utf8");

      const patch = ["*** Begin Patch", "*** Delete File: SOUL.md", "*** End Patch"].join("\n");

      await expect(applyPatch(patch, { cwd })).rejects.toThrow(/Refusing to delete protected/);
      await expect(fs.readFile(path.join(cwd, "SOUL.md"), "utf8")).resolves.toContain("# soul");
    });
  });

  it("refuses to delete daily memory logs under memory/", async () => {
    await withTempDir("openclaw-apply-patch-", async (cwd) => {
      await fs.mkdir(path.join(cwd, "memory"), { recursive: true });
      await fs.writeFile(path.join(cwd, "memory", "2026-02-14.md"), "log", "utf8");

      const patch = [
        "*** Begin Patch",
        "*** Delete File: memory/2026-02-14.md",
        "*** End Patch",
      ].join("\n");

      await expect(applyPatch(patch, { cwd })).rejects.toThrow(/Refusing to delete protected/);
      await expect(fs.readFile(path.join(cwd, "memory", "2026-02-14.md"), "utf8")).resolves.toBe(
        "log",
      );
    });
  });

  it("refuses to delete HEARTBEAT.md and BOOTSTRAP.md", async () => {
    await withTempDir("openclaw-apply-patch-", async (cwd) => {
      await fs.writeFile(path.join(cwd, "HEARTBEAT.md"), "hb", "utf8");
      await fs.writeFile(path.join(cwd, "BOOTSTRAP.md"), "boot", "utf8");

      const patch = [
        "*** Begin Patch",
        "*** Delete File: HEARTBEAT.md",
        "*** Delete File: BOOTSTRAP.md",
        "*** End Patch",
      ].join("\n");

      await expect(applyPatch(patch, { cwd })).rejects.toThrow(/Refusing to delete protected/);
      await expect(fs.readFile(path.join(cwd, "HEARTBEAT.md"), "utf8")).resolves.toBe("hb");
      await expect(fs.readFile(path.join(cwd, "BOOTSTRAP.md"), "utf8")).resolves.toBe("boot");
    });
  });

  it("allows deleting non-protected files", async () => {
    await withTempDir("openclaw-apply-patch-", async (cwd) => {
      await fs.writeFile(path.join(cwd, "ok.txt"), "ok", "utf8");

      const patch = ["*** Begin Patch", "*** Delete File: ok.txt", "*** End Patch"].join("\n");

      const result = await applyPatch(patch, { cwd });
      expect(result.summary.deleted).toEqual(["ok.txt"]);
      await expect(fs.access(path.join(cwd, "ok.txt"))).rejects.toThrow();
    });
  });
});
