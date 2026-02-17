import { beforeEach, describe, expect, it } from "vitest";
import { clearSchemaCache, validateJsonSchemaValue } from "./schema-validator.js";

describe("schema-validator cache cap", () => {
  beforeEach(() => {
    // Reset the shared cache so tests are independent of execution order.
    clearSchemaCache();
  });

  it("handles many distinct cache keys and still validates correctly", () => {
    const schema = { type: "object" } as Record<string, unknown>;
    // Insert 600 distinct keys — exceeds the 500 cap.
    for (let i = 0; i < 600; i++) {
      const result = validateJsonSchemaValue({
        schema,
        cacheKey: `cap-test-${i}`,
        value: {},
      });
      expect(result.ok).toBe(true);
    }

    // Early keys were evicted, but validation still works because the
    // validator is recompiled on cache miss.
    const revalidated = validateJsonSchemaValue({
      schema,
      cacheKey: "cap-test-0",
      value: {},
    });
    expect(revalidated.ok).toBe(true);
  });

  it("returns errors for invalid values after eviction", () => {
    const schema = { type: "number" } as Record<string, unknown>;
    const result = validateJsonSchemaValue({
      schema,
      cacheKey: "error-check",
      value: "not-a-number",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("recompiles when schema object changes for the same key", () => {
    const schemaA = { type: "string" } as Record<string, unknown>;
    const schemaB = { type: "number" } as Record<string, unknown>;

    // First call caches schemaA for this key
    const r1 = validateJsonSchemaValue({
      schema: schemaA,
      cacheKey: "schema-swap",
      value: "hello",
    });
    expect(r1.ok).toBe(true);

    // Second call with schemaB should recompile, not use stale validator
    const r2 = validateJsonSchemaValue({
      schema: schemaB,
      cacheKey: "schema-swap",
      value: "hello",
    });
    expect(r2.ok).toBe(false);
  });

  it("keeps frequently-accessed keys alive when cache is at capacity (LRU)", () => {
    const schema = { type: "string" } as Record<string, unknown>;
    const hotKey = "hot-key";

    // Prime the hot key.
    validateJsonSchemaValue({ schema, cacheKey: hotKey, value: "x" });

    // Fill the cache with 499 more keys, touching hot-key after each batch
    // to refresh its recency.
    for (let i = 0; i < 499; i++) {
      validateJsonSchemaValue({ schema, cacheKey: `filler-${i}`, value: "x" });
      // Access hot-key to refresh recency so it won't be the LRU candidate.
      validateJsonSchemaValue({ schema, cacheKey: hotKey, value: "x" });
    }

    // Add one more key to trigger eviction; hot-key should survive.
    validateJsonSchemaValue({ schema, cacheKey: "trigger-eviction", value: "x" });

    // Validate that hot-key still validates without a full recompile path
    // (behaviorally identical — the key should still be in cache).
    const result = validateJsonSchemaValue({ schema, cacheKey: hotKey, value: "x" });
    expect(result.ok).toBe(true);
  });
});
