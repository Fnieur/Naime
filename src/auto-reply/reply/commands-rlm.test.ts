import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRlmHarness } from "../../commands/agent/harness-rlm.js";
import type { OpenClawConfig } from "../../config/config.js";
import { handleRlmCommand } from "./commands-rlm.js";
import { buildCommandTestParams } from "./commands.test-harness.js";

vi.mock("../../commands/agent/harness-rlm.js", () => ({
  runRlmHarness: vi.fn(),
}));

describe("handleRlmCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses query from commandBodyNormalized", async () => {
    const cfg = {
      tools: { rlm: { enabled: true, maxDepth: 3, timeoutSeconds: 45 } },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as OpenClawConfig;
    const params = buildCommandTestParams("not-a-command", cfg);
    params.command.rawBodyNormalized = "not-a-command";
    params.command.commandBodyNormalized = "/rlm summarize this";

    vi.mocked(runRlmHarness).mockResolvedValueOnce({
      result: {
        payloads: [{ text: "done" }],
        meta: { durationMs: 1, stopReason: "rlm:submitted" },
      },
      provider: "openai",
      model: "gpt-4",
      stats: { llmCalls: 1, repoSearchCalls: 0, repoReadCalls: 0, steps: 1, warningsCount: 0 },
    });

    const result = await handleRlmCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("done");
    expect(result?.reply?.text).toContain("openai/gpt-4");
    expect(vi.mocked(runRlmHarness)).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: "summarize this",
        maxDepth: 3,
        timeoutMs: 45_000,
      }),
    );
  });

  it("ignores unauthorized senders", async () => {
    const cfg = {
      tools: { rlm: { enabled: true } },
      channels: { whatsapp: { allowFrom: [] } },
    } as OpenClawConfig;
    const params = buildCommandTestParams("/rlm test", cfg);
    params.command.isAuthorizedSender = false;

    const result = await handleRlmCommand(params, true);
    expect(result).toEqual({ shouldContinue: false });
    expect(vi.mocked(runRlmHarness)).not.toHaveBeenCalled();
  });

  it("returns forbidden when tools.rlm.enabled is false", async () => {
    const cfg = {
      tools: { rlm: { enabled: false } },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as OpenClawConfig;
    const params = buildCommandTestParams("/rlm test", cfg);

    const result = await handleRlmCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(JSON.parse(result?.reply?.text ?? "{}")).toMatchObject({
      status: "forbidden",
    });
  });

  it("returns usage when query is missing", async () => {
    const cfg = {
      tools: { rlm: { enabled: true } },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as OpenClawConfig;
    const params = buildCommandTestParams("/rlm", cfg);

    const result = await handleRlmCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("/rlm <query>");
    expect(vi.mocked(runRlmHarness)).not.toHaveBeenCalled();
  });
});
