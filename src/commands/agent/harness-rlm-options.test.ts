import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveRlmOptions } from "./harness-rlm-options.js";

describe("resolveRlmOptions", () => {
  it("uses defaults when config is missing", () => {
    const out = resolveRlmOptions({});
    expect(out.maxDepth).toBe(2);
    expect(out.timeoutSeconds).toBe(120);
    expect(out.timeoutMs).toBe(120_000);
    expect(out.maxIterations).toBeUndefined();
    expect(out.maxLlmCalls).toBeUndefined();
    expect(out.extractOnMaxIterations).toBeUndefined();
  });

  it("normalizes and clamps config values", () => {
    const cfg = {
      tools: {
        rlm: {
          maxDepth: 99,
          maxIterations: 0,
          maxLlmCalls: 9_999,
          timeoutSeconds: -15,
        },
      },
    } as OpenClawConfig;
    const out = resolveRlmOptions({ cfg });
    expect(out.maxDepth).toBe(8);
    expect(out.maxIterations).toBe(1);
    expect(out.maxLlmCalls).toBe(2_048);
    expect(out.timeoutSeconds).toBe(1);
    expect(out.timeoutMs).toBe(1_000);
  });

  it("applies request overrides for depth and timeout", () => {
    const cfg = {
      tools: {
        rlm: {
          maxDepth: 2,
          timeoutSeconds: 120,
        },
      },
    } as OpenClawConfig;
    const out = resolveRlmOptions({
      cfg,
      requestedMaxDepth: 5.9,
      requestedTimeoutSeconds: 45.1,
    });
    expect(out.maxDepth).toBe(5);
    expect(out.timeoutSeconds).toBe(45);
    expect(out.timeoutMs).toBe(45_000);
  });
});
