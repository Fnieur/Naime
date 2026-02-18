import { describe, expect, it } from "vitest";
import {
  serializeCodeForHistory,
  serializeErrorForHistory,
  serializeStdoutForHistory,
  truncateHeadTail,
} from "./harness-rlm.js";

describe("harness-rlm serializers", () => {
  it("truncateHeadTail keeps short text intact", () => {
    const out = truncateHeadTail("abc", 10);
    expect(out.preview).toBe("abc");
    expect(out.truncated).toBe(false);
    expect(out.omittedChars).toBe(0);
  });

  it("truncateHeadTail truncates long text", () => {
    const long = "x".repeat(120);
    const out = truncateHeadTail(long, 30);
    expect(out.truncated).toBe(true);
    expect(out.originalLength).toBe(120);
    expect(out.preview.length).toBeLessThanOrEqual(60);
    expect(out.preview).toContain("[truncated]");
  });

  it("serializeCodeForHistory redacts oversized literals", () => {
    const literal = "a".repeat(700);
    const out = serializeCodeForHistory(`const s = "${literal}";\nsubmit(s);`);
    expect(out.preview).toContain("redacted string literal");
  });

  it("serializeStdoutForHistory truncates huge stdout", () => {
    const out = serializeStdoutForHistory("o".repeat(20_000));
    expect(out.truncated).toBe(true);
    expect(out.originalLength).toBe(20_000);
  });

  it("serializeErrorForHistory truncates huge errors", () => {
    const out = serializeErrorForHistory("e".repeat(10_000));
    expect(out.truncated).toBe(true);
    expect(out.originalLength).toBe(10_000);
  });
});
