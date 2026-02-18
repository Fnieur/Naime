import { describe, expect, it } from "vitest";
import { resolveTranscriptPolicy } from "./transcript-policy.js";

describe("resolveTranscriptPolicy", () => {
  it("enables sanitizeToolCallIds for Anthropic provider", () => {
    const policy = resolveTranscriptPolicy({
      provider: "anthropic",
      modelId: "claude-opus-4-5",
      modelApi: "anthropic-messages",
    });
    expect(policy.sanitizeToolCallIds).toBe(true);
    expect(policy.toolCallIdMode).toBe("strict");
  });

  it("enables sanitizeToolCallIds for Google provider", () => {
    const policy = resolveTranscriptPolicy({
      provider: "google",
      modelId: "gemini-2.0-flash",
      modelApi: "google-generative-ai",
    });
    expect(policy.sanitizeToolCallIds).toBe(true);
  });

  it("enables sanitizeToolCallIds for Mistral provider", () => {
    const policy = resolveTranscriptPolicy({
      provider: "mistral",
      modelId: "mistral-large-latest",
    });
    expect(policy.sanitizeToolCallIds).toBe(true);
    expect(policy.toolCallIdMode).toBe("strict9");
  });

  it("disables sanitizeToolCallIds for OpenAI provider", () => {
    const policy = resolveTranscriptPolicy({
      provider: "openai",
      modelId: "gpt-4o",
      modelApi: "openai",
    });
    expect(policy.sanitizeToolCallIds).toBe(false);
    expect(policy.toolCallIdMode).toBeUndefined();
  });

  it("enables sanitizeToolCallIds for unknown OpenAI-compatible providers", () => {
    const policy = resolveTranscriptPolicy({
      provider: "nvidia",
      modelId: "moonshotai/kimi-k2.5",
      modelApi: "openai-completions",
    });
    expect(policy.sanitizeToolCallIds).toBe(true);
    expect(policy.toolCallIdMode).toBe("strict");
  });

  it("enables sanitizeToolCallIds when provider is empty and modelApi is not OpenAI", () => {
    const policy = resolveTranscriptPolicy({
      provider: "",
      modelId: "some-model",
      modelApi: "anthropic-messages",
    });
    expect(policy.sanitizeToolCallIds).toBe(true);
  });

  it("disables sanitizeToolCallIds for openai-codex provider", () => {
    const policy = resolveTranscriptPolicy({
      provider: "openai-codex",
      modelId: "codex-mini",
      modelApi: "openai-codex-responses",
    });
    expect(policy.sanitizeToolCallIds).toBe(false);
    expect(policy.toolCallIdMode).toBeUndefined();
  });

  it("disables sanitizeToolCallIds when no provider and modelApi is openai-completions", () => {
    // No provider + OpenAI API => treated as OpenAI
    const policy = resolveTranscriptPolicy({
      modelApi: "openai-completions",
    });
    expect(policy.sanitizeToolCallIds).toBe(false);
  });

  it("enables sanitizeToolCallIds for openrouter with non-gemini model", () => {
    const policy = resolveTranscriptPolicy({
      provider: "openrouter",
      modelId: "anthropic/claude-opus-4-5",
      modelApi: "openai-completions",
    });
    expect(policy.sanitizeToolCallIds).toBe(true);
    expect(policy.toolCallIdMode).toBe("strict");
  });

  it("uses strict9 for Mistral model on third-party provider", () => {
    const policy = resolveTranscriptPolicy({
      provider: "openrouter",
      modelId: "mistralai/devstral-2512:free",
      modelApi: "openai-responses",
    });
    expect(policy.sanitizeToolCallIds).toBe(true);
    expect(policy.toolCallIdMode).toBe("strict9");
  });
});
