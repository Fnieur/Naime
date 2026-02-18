import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ModelCatalogEntry } from "./model-catalog.js";
import { buildAllowedModelSet } from "./model-selection.js";

describe("buildAllowedModelSet", () => {
  it("allows forward-compat models when configured in allowlist", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-sonnet-4-6": {},
            "anthropic/claude-opus-4-6": {},
            "google-antigravity/claude-opus-4-6-thinking": {},
            "zai/glm-5": {},
            "openai-codex/gpt-5.3-codex": {},
          },
        },
      },
      models: {
        providers: {}, // No configured providers
      },
    } as unknown as OpenClawConfig;

    const catalog: ModelCatalogEntry[] = [
      { provider: "anthropic", id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet" },
    ];

    const result = buildAllowedModelSet({
      cfg,
      catalog,
      defaultProvider: "anthropic",
    });

    expect(result.allowedKeys.has("anthropic/claude-sonnet-4-6")).toBe(true);
    expect(result.allowedKeys.has("anthropic/claude-opus-4-6")).toBe(true);
    expect(result.allowedKeys.has("google-antigravity/claude-opus-4-6-thinking")).toBe(true);
    expect(result.allowedKeys.has("zai/glm-5")).toBe(true);
    expect(result.allowedKeys.has("openai-codex/gpt-5.3-codex")).toBe(true);
  });

  it("does not allow random models not in forward-compat list", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-random-9-9": {},
          },
        },
      },
    } as unknown as OpenClawConfig;

    const catalog: ModelCatalogEntry[] = [];

    const result = buildAllowedModelSet({
      cfg,
      catalog,
      defaultProvider: "anthropic",
    });

    expect(result.allowedKeys.has("anthropic/claude-random-9-9")).toBe(false);
  });

  it("allows models in catalog", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-3-5-sonnet-20240620": {},
          },
        },
      },
    } as unknown as OpenClawConfig;

    const catalog: ModelCatalogEntry[] = [
      { provider: "anthropic", id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet" },
    ];

    const result = buildAllowedModelSet({
      cfg,
      catalog,
      defaultProvider: "anthropic",
    });

    expect(result.allowedKeys.has("anthropic/claude-3-5-sonnet-20240620")).toBe(true);
  });
});
