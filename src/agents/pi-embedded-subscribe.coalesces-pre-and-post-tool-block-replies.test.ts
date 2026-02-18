import { describe, expect, it, vi } from "vitest";
import { createBlockReplyPipeline } from "../auto-reply/reply/block-reply-pipeline.js";
import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

type StubSession = {
  subscribe: (fn: (evt: unknown) => void) => () => void;
};

type SessionEventHandler = (evt: unknown) => void;

describe("subscribeEmbeddedPiSession tool boundary coalescing", () => {
  it("coalesces text emitted before and after a tool call when hold/resume hooks are available", async () => {
    let handler: SessionEventHandler | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const delivered: Array<{ text?: string }> = [];
    const pipeline = createBlockReplyPipeline({
      onBlockReply: (payload) => {
        delivered.push(payload);
      },
      timeoutMs: 5_000,
      coalescing: {
        minChars: 1,
        maxChars: 1_000,
        idleMs: 0,
        joiner: "",
      },
    });
    const onBlockReplyFlush = vi.fn(async () => {
      await pipeline.flush({ force: true });
    });

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run-coalesce-tool-boundary",
      onBlockReply: (payload) => {
        pipeline.enqueue(payload);
      },
      onBlockReplyFlush,
      onBlockReplyHold: () => {
        pipeline.hold();
      },
      onBlockReplyResume: () => {
        pipeline.resume();
      },
      blockReplyBreak: "text_end",
    });

    handler?.({
      type: "message_start",
      message: { role: "assistant" },
    });
    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Before ",
      },
    });
    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_end",
      },
    });

    handler?.({
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId: "tool-coalesce-1",
      args: { command: "echo hi" },
    });

    expect(onBlockReplyFlush).not.toHaveBeenCalled();
    expect(delivered).toHaveLength(0);

    handler?.({
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId: "tool-coalesce-1",
      isError: false,
      result: { ok: true },
    });

    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: "after",
      },
    });
    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_end",
      },
    });

    await pipeline.flush({ force: true });

    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.text).toBe("Beforeafter");
  });
});
