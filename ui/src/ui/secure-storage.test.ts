import { afterEach, describe, expect, it } from "vitest";
import { secureGet, secureRemove, secureSet } from "./secure-storage.ts";

describe("secure-storage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("encrypts and decrypts a value round-trip", async () => {
    await secureSet("test-key", "secret-value");
    const result = await secureGet("test-key");
    expect(result).toBe("secret-value");
  });

  it("stores values with enc: prefix", async () => {
    await secureSet("test-key", "hello");
    const raw = localStorage.getItem("test-key");
    expect(raw).not.toBeNull();
    expect(raw!.startsWith("enc:")).toBe(true);
  });

  it("returns null for missing keys", async () => {
    const result = await secureGet("nonexistent");
    expect(result).toBeNull();
  });

  it("handles unencrypted values gracefully (migration)", async () => {
    localStorage.setItem("legacy-key", "plain-value");
    const result = await secureGet("legacy-key");
    expect(result).toBe("plain-value");
  });

  it("removes values", async () => {
    await secureSet("remove-me", "value");
    secureRemove("remove-me");
    const result = await secureGet("remove-me");
    expect(result).toBeNull();
  });

  it("handles empty string values", async () => {
    await secureSet("empty", "");
    const result = await secureGet("empty");
    expect(result).toBe("");
  });

  it("handles unicode values", async () => {
    const unicode = "日本語テスト 🔑🔒";
    await secureSet("unicode-key", unicode);
    const result = await secureGet("unicode-key");
    expect(result).toBe(unicode);
  });

  it("produces different ciphertexts for same value (random IV)", async () => {
    await secureSet("key1", "same-value");
    const ct1 = localStorage.getItem("key1");
    localStorage.removeItem("key1");
    await secureSet("key1", "same-value");
    const ct2 = localStorage.getItem("key1");
    // Different IVs should produce different ciphertexts
    expect(ct1).not.toBe(ct2);
  });
});
