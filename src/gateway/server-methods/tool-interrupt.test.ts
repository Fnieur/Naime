import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ToolInterruptManager } from "../tool-interrupt-manager.js";
import { createToolInterruptHandlers } from "./tool-interrupt.js";
import type { GatewayRequestHandlerOptions } from "./types.js";

async function createTempInterruptPath() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tool-interrupt-handler-"));
  return path.join(root, "gateway", "tool-interrupts.json");
}

function baseHandlerArgs(
  overrides: Partial<GatewayRequestHandlerOptions>,
): GatewayRequestHandlerOptions {
  return {
    req: {
      id: "req-1",
      type: "req",
      method: "tool.interrupt.emit",
    } as GatewayRequestHandlerOptions["req"],
    params: {},
    client: null,
    isWebchatConnect: () => false,
    respond: () => {},
    context: {
      broadcast: () => {},
    } as unknown as GatewayRequestHandlerOptions["context"],
    ...overrides,
  };
}

describe("tool interrupt handlers", () => {
  it("emits requested/resumed events and returns resumed payload", async () => {
    const filePath = await createTempInterruptPath();
    const manager = new ToolInterruptManager({ filePath });
    await manager.load();
    const handlers = createToolInterruptHandlers(manager);
    const broadcasts: Array<{ event: string; payload: unknown }> = [];

    const emitRespond = vi.fn();
    const emitPromise = handlers["tool.interrupt.emit"](
      baseHandlerArgs({
        req: { id: "req-emit", type: "req", method: "tool.interrupt.emit" } as never,
        params: {
          approvalRequestId: "approval-emit-1",
          runId: "run-emit-1",
          sessionKey: "agent:main:main",
          toolCallId: "tool-emit-1",
          interrupt: { type: "approval", text: "approve this" },
          timeoutMs: 60_000,
        },
        respond: emitRespond,
        context: {
          broadcast: (event: string, payload: unknown) => {
            broadcasts.push({ event, payload });
          },
        } as never,
      }),
    );

    await vi.waitFor(() => {
      expect(broadcasts.some((entry) => entry.event === "tool.interrupt.requested")).toBe(true);
    });

    const requested = broadcasts.find((entry) => entry.event === "tool.interrupt.requested");
    const requestedPayload = (requested?.payload ?? {}) as {
      resumeToken?: string;
    };
    expect(typeof requestedPayload.resumeToken).toBe("string");

    const resumeRespond = vi.fn();
    await handlers["tool.interrupt.resume"](
      baseHandlerArgs({
        req: { id: "req-resume", type: "req", method: "tool.interrupt.resume" } as never,
        params: {
          approvalRequestId: "approval-emit-1",
          runId: "run-emit-1",
          sessionKey: "agent:main:main",
          toolCallId: "tool-emit-1",
          resumeToken: requestedPayload.resumeToken,
          result: {
            content: [{ type: "text", text: "resumed" }],
            details: { status: "completed" },
          },
        },
        respond: resumeRespond,
        context: {
          broadcast: (event: string, payload: unknown) => {
            broadcasts.push({ event, payload });
          },
        } as never,
        client: {
          connect: { client: { id: "client-1", displayName: "Operator" } },
        } as never,
      }),
    );

    expect(resumeRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true }),
      undefined,
    );

    await emitPromise;

    expect(emitRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        status: "resumed",
        approvalRequestId: "approval-emit-1",
      }),
      undefined,
    );
    expect(broadcasts.some((entry) => entry.event === "tool.interrupt.resumed")).toBe(true);
    manager.stop();
  });
});
