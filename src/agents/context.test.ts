import { describe, expect, it } from "vitest";
import {
  _lookupFromCache,
  applyConfiguredContextWindows,
  applyDiscoveredContextWindows,
} from "./context.js";
import { createSessionManagerRuntimeRegistry } from "./pi-extensions/session-manager-runtime-registry.js";

describe("applyDiscoveredContextWindows", () => {
  it("keeps the smallest context window when duplicate model ids are discovered", () => {
    const cache = new Map<string, number>();
    applyDiscoveredContextWindows({
      cache,
      models: [
        { id: "claude-sonnet-4-5", contextWindow: 1_000_000 },
        { id: "claude-sonnet-4-5", contextWindow: 200_000 },
      ],
    });

    expect(cache.get("claude-sonnet-4-5")).toBe(200_000);
  });
});

describe("applyConfiguredContextWindows", () => {
  it("stores entries under provider-qualified keys (provider/modelId)", () => {
    const cache = new Map<string, number>();
    applyConfiguredContextWindows({
      cache,
      modelsConfig: {
        providers: {
          openrouter: {
            models: [{ id: "anthropic/claude-opus-4-6", contextWindow: 200_000 }],
          },
        },
      },
    });

    // OpenRouter uses "provider/model" style IDs — the resulting cache key is
    // "openrouter/anthropic/claude-opus-4-6". Keys are opaque; we never split them.
    expect(cache.get("openrouter/anthropic/claude-opus-4-6")).toBe(200_000);
    expect(cache.has("anthropic/claude-opus-4-6")).toBe(false);
  });

  it("separates same model id from different providers", () => {
    const cache = new Map<string, number>();
    applyConfiguredContextWindows({
      cache,
      modelsConfig: {
        providers: {
          anthropic: { models: [{ id: "claude-sonnet-4-5", contextWindow: 64_000 }] },
          openrouter: { models: [{ id: "claude-sonnet-4-5", contextWindow: 200_000 }] },
        },
      },
    });

    expect(cache.get("anthropic/claude-sonnet-4-5")).toBe(64_000);
    expect(cache.get("openrouter/claude-sonnet-4-5")).toBe(200_000);
  });

  it("ignores invalid entries (zero contextWindow, empty id)", () => {
    const cache = new Map<string, number>();
    applyConfiguredContextWindows({
      cache,
      modelsConfig: {
        providers: {
          openrouter: {
            models: [
              { id: "custom/model", contextWindow: 150_000 },
              { id: "bad/model", contextWindow: 0 },
              { id: "", contextWindow: 300_000 },
            ],
          },
        },
      },
    });

    expect(cache.get("openrouter/custom/model")).toBe(150_000);
    expect(cache.has("openrouter/bad/model")).toBe(false);
    expect(cache.size).toBe(1);
  });
});

describe("_lookupFromCache", () => {
  it("returns undefined when modelId is absent", () => {
    const cache = new Map<string, number>([["anthropic/m", 100_000]]);
    expect(_lookupFromCache(cache, { provider: "anthropic" })).toBeUndefined();
    expect(_lookupFromCache(cache, {})).toBeUndefined();
  });

  it("returns provider-qualified value when provider + modelId match", () => {
    const cache = new Map<string, number>([["anthropic/claude-sonnet-4-5", 64_000]]);
    expect(
      _lookupFromCache(cache, { provider: "anthropic", modelId: "claude-sonnet-4-5" }),
    ).toBe(64_000);
  });

  it("falls back to bare model-id when provider-qualified key is absent", () => {
    // Simulates a discovered model (no provider prefix in cache)
    const cache = new Map<string, number>([["claude-sonnet-4-5", 200_000]]);
    expect(
      _lookupFromCache(cache, { provider: "anthropic", modelId: "claude-sonnet-4-5" }),
    ).toBe(200_000);
  });

  it("uses bare model-id lookup when no provider is supplied", () => {
    const cache = new Map<string, number>([["some-model", 128_000]]);
    expect(_lookupFromCache(cache, { modelId: "some-model" })).toBe(128_000);
  });

  it("prefers provider-qualified over bare when both exist", () => {
    const cache = new Map<string, number>([
      ["anthropic/claude-sonnet-4-5", 64_000],
      ["claude-sonnet-4-5", 200_000],
    ]);
    expect(
      _lookupFromCache(cache, { provider: "anthropic", modelId: "claude-sonnet-4-5" }),
    ).toBe(64_000);
  });
});

describe("createSessionManagerRuntimeRegistry", () => {
  it("stores, reads, and clears values by object identity", () => {
    const registry = createSessionManagerRuntimeRegistry<{ value: number }>();
    const key = {};
    expect(registry.get(key)).toBeNull();
    registry.set(key, { value: 1 });
    expect(registry.get(key)).toEqual({ value: 1 });
    registry.set(key, null);
    expect(registry.get(key)).toBeNull();
  });

  it("ignores non-object keys", () => {
    const registry = createSessionManagerRuntimeRegistry<{ value: number }>();
    registry.set(null, { value: 1 });
    registry.set(123, { value: 1 });
    expect(registry.get(null)).toBeNull();
    expect(registry.get(123)).toBeNull();
  });
});
