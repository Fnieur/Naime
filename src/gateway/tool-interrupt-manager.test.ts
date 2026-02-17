import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ToolInterruptManager } from "./tool-interrupt-manager.js";

async function createTempInterruptPath() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tool-interrupts-"));
  return path.join(root, "gateway", "tool-interrupts.json");
}

describe("ToolInterruptManager", () => {
  it("stores only token hashes and resumes emitted waits", async () => {
    const filePath = await createTempInterruptPath();
    const manager = new ToolInterruptManager({ filePath });
    await manager.load();

    const emitted = await manager.emit({
      approvalRequestId: "approval-1",
      runId: "run-1",
      sessionKey: "agent:main:main",
      toolCallId: "tool-1",
      interrupt: { type: "approval", reason: "needs human confirmation" },
      timeoutMs: 60_000,
    });

    const token = emitted.requested.resumeToken;
    const waitPromise = emitted.wait;
    const persisted = JSON.parse(await fs.readFile(filePath, "utf-8")) as {
      interrupts?: Record<string, { resumeTokenHash?: string }>;
    };
    const record = persisted.interrupts?.["approval-1"];
    expect(record?.resumeTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(token);

    const resumed = await manager.resume({
      approvalRequestId: "approval-1",
      runId: "run-1",
      sessionKey: "agent:main:main",
      toolCallId: "tool-1",
      resumeToken: token,
      result: { ok: true, resumed: "done" },
      resumedBy: "tester",
    });
    expect(resumed.ok).toBe(true);
    await expect(waitPromise).resolves.toMatchObject({
      status: "resumed",
      approvalRequestId: "approval-1",
      runId: "run-1",
      sessionKey: "agent:main:main",
      toolCallId: "tool-1",
      resumedBy: "tester",
      result: { ok: true, resumed: "done" },
    });
    manager.stop();
  });

  it("binds resume to run/session/tool identity", async () => {
    const filePath = await createTempInterruptPath();
    const manager = new ToolInterruptManager({ filePath });
    await manager.load();

    const emitted = await manager.emit({
      approvalRequestId: "approval-2",
      runId: "run-2",
      sessionKey: "agent:main:main",
      toolCallId: "tool-2",
      interrupt: { type: "approval" },
      timeoutMs: 60_000,
    });

    const mismatch = await manager.resume({
      approvalRequestId: "approval-2",
      runId: "run-other",
      sessionKey: "agent:main:main",
      toolCallId: "tool-2",
      resumeToken: emitted.requested.resumeToken,
      result: { ok: true },
    });
    expect(mismatch).toMatchObject({
      ok: false,
      code: "binding_mismatch",
    });
    manager.stop();
  });

  it("enforces expiry and survives restart with persisted records", async () => {
    const filePath = await createTempInterruptPath();
    let now = 1_000_000;
    const nowMs = () => now;
    const manager = new ToolInterruptManager({ filePath, nowMs });
    await manager.load();

    const emitted = await manager.emit({
      approvalRequestId: "approval-3",
      runId: "run-3",
      sessionKey: "agent:main:main",
      toolCallId: "tool-3",
      interrupt: { type: "approval" },
      timeoutMs: 2_000,
    });
    now += 3_000;

    const expired = await manager.resume({
      approvalRequestId: "approval-3",
      runId: "run-3",
      sessionKey: "agent:main:main",
      toolCallId: "tool-3",
      resumeToken: emitted.requested.resumeToken,
      result: { ok: true },
    });
    expect(expired).toMatchObject({
      ok: false,
      code: "expired",
    });
    await expect(emitted.wait).resolves.toMatchObject({
      status: "expired",
      approvalRequestId: "approval-3",
    });

    manager.stop();
    const reloaded = new ToolInterruptManager({ filePath, nowMs });
    await reloaded.load();
    const snapshot = reloaded.getSnapshot("approval-3");
    expect(snapshot?.expiredAtMs).toBeDefined();
    reloaded.stop();
  });
});
