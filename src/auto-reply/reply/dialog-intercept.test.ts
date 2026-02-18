import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";

vi.mock("../../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));

import { callGateway } from "../../gateway/call.js";
import { checkActiveDialog } from "./dialog-intercept.js";

const mockCallGateway = vi.mocked(callGateway);

afterEach(() => {
  vi.resetAllMocks();
});

function makeEntry(overrides?: Partial<SessionEntry>): SessionEntry {
  return {
    sessionId: "sid-1",
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("checkActiveDialog", () => {
  test("returns null when no activeDialogId", async () => {
    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry(),
      cleanedBody: "hello",
    });
    expect(result).toBeNull();
  });

  test("returns null when no session entry", async () => {
    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: undefined,
      cleanedBody: "hello",
    });
    expect(result).toBeNull();
  });

  test("handles cancel command", async () => {
    mockCallGateway.mockResolvedValue({} as Record<string, unknown>);

    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "/dialog cancel",
    });

    expect(result).not.toBeNull();
    expect(result?.reply.text).toBe("Dialog cancelled.");

    const methods = mockCallGateway.mock.calls.map((call) => call[0].method);
    expect(methods).toContain("dialog.cancel");
    expect(methods).toContain("sessions.patch");
  });

  test("handles /cancel shortcut", async () => {
    mockCallGateway.mockResolvedValue({} as Record<string, unknown>);

    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "/cancel",
    });

    expect(result?.reply.text).toBe("Dialog cancelled.");
  });

  test("submits answer and returns next question", async () => {
    mockCallGateway.mockResolvedValue({
      done: false,
      currentStep: { id: "q2", prompt: "What is your age?" },
    } as Record<string, unknown>);

    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "Alice",
    });

    expect(result?.reply.text).toBe("What is your age?");
  });

  test("handles dialog completion", async () => {
    const calls: Array<{ method: string }> = [];
    mockCallGateway.mockImplementation(async (opts) => {
      calls.push({ method: opts.method });
      if (opts.method === "dialog.answer") {
        return {
          done: true,
          currentStep: null,
          answers: { q1: "Alice", q2: "30" },
          outro: "All done!",
        } as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    });

    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "30",
    });

    expect(result?.reply.text).toBe("All done!");
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("sessions.patch");
    expect(methods).toContain("agent");
  });

  test("returns null and clears dialog on answer error", async () => {
    let patchCalled = false;
    mockCallGateway.mockImplementation(async (opts) => {
      if (opts.method === "dialog.answer") {
        throw new Error("dialog not found");
      }
      if (opts.method === "sessions.patch") {
        patchCalled = true;
      }
      return {} as Record<string, unknown>;
    });

    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "hello",
    });

    expect(result).toBeNull();
    expect(patchCalled).toBe(true);
  });

  test("passes user message as answer value", async () => {
    mockCallGateway.mockResolvedValue({
      done: false,
      currentStep: { id: "q2", prompt: "Next?" },
    } as Record<string, unknown>);

    await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "Alice",
    });

    const answerCall = mockCallGateway.mock.calls.find((c) => c[0].method === "dialog.answer");
    expect(answerCall).toBeDefined();
    expect(answerCall![0].params).toEqual(
      expect.objectContaining({ dialogId: "dlg-1", value: "Alice" }),
    );
  });

  test("cancel still succeeds when dialog.cancel throws", async () => {
    mockCallGateway.mockImplementation(async (opts) => {
      if (opts.method === "dialog.cancel") {
        throw new Error("already gone");
      }
      return {} as Record<string, unknown>;
    });

    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "/dialog cancel",
    });

    expect(result?.reply.text).toBe("Dialog cancelled.");
  });

  test("uses default outro when none provided", async () => {
    mockCallGateway.mockImplementation(async (opts) => {
      if (opts.method === "dialog.answer") {
        return {
          done: true,
          currentStep: null,
          answers: { q1: "Alice" },
        } as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    });

    const result = await checkActiveDialog({
      sessionKey: "test:key",
      sessionEntry: makeEntry({ activeDialogId: "dlg-1" }),
      cleanedBody: "Alice",
    });

    expect(result?.reply.text).toBe("Thanks, your responses have been recorded.");
  });
});
