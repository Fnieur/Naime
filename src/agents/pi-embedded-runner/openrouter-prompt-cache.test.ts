import { describe, it, expect } from "vitest";
import { createOpenRouterPromptCacheWrapper } from "./openrouter-prompt-cache.js";
import type { StreamFn } from "@mariozechner/pi-agent-core";

describe("OpenRouter Prompt Cache", () => {
  it("should detect cacheable models", () => {
    // Should create wrapper for Gemini
    const geminiWrapper = createOpenRouterPromptCacheWrapper(
      (() => {}) as StreamFn,
      "openrouter",
      "google/gemini-3-flash-preview",
    );
    expect(geminiWrapper).toBeDefined();

    // Should create wrapper for Claude via OpenRouter
    const claudeWrapper = createOpenRouterPromptCacheWrapper(
      (() => {}) as StreamFn,
      "openrouter",
      "anthropic/claude-sonnet-4-5",
    );
    expect(claudeWrapper).toBeDefined();

    // Should not create wrapper for non-OpenRouter
    const anthropicWrapper = createOpenRouterPromptCacheWrapper(
      (() => {}) as StreamFn,
      "anthropic",
      "claude-sonnet-4-5",
    );
    expect(anthropicWrapper).toBeUndefined();

    // Should not create wrapper for non-cacheable OpenRouter models
    const autoWrapper = createOpenRouterPromptCacheWrapper(
      (() => {}) as StreamFn,
      "openrouter",
      "auto",
    );
    expect(autoWrapper).toBeUndefined();
  });

  it("should inject cache_control for system prompts", async () => {
    return new Promise<void>((resolve) => {
      // Use a long system prompt to ensure it gets cached
      const longSystemPrompt =
        "You are a helpful assistant. " +
        "a".repeat(2000) +
        " Always be helpful and provide clear explanations.";

      const mockStreamFn: StreamFn = (model, context, options) => {
        const payload = {
          system: longSystemPrompt,
          messages: [],
        };
        options?.onPayload?.(payload);
        return Promise.resolve("");
      };

      const wrapper = createOpenRouterPromptCacheWrapper(
        mockStreamFn,
        "openrouter",
        "google/gemini-3-flash-preview",
      );

      if (!wrapper) {
        throw new Error("Wrapper not created");
      }

      wrapper({} as any, {} as any, {
        onPayload: (payload: any) => {
          expect(payload.system).toBeDefined();
          expect(Array.isArray(payload.system)).toBe(true);

          const systemBlocks = payload.system as any[];
          // All blocks should have cache_control for system prompts
          expect(systemBlocks.every((b) => b.cache_control)).toBe(true);
          resolve();
        },
      });
    });
  });

  it("should inject cache_control for user messages", async () => {
    return new Promise<void>((resolve) => {
      const longText = "a".repeat(2000); // Long enough to cache

      const mockStreamFn: StreamFn = (model, context, options) => {
        const payload = {
          messages: [
            {
              role: "user",
              content: longText,
            },
          ],
        };
        options?.onPayload?.(payload);
        return Promise.resolve("");
      };

      const wrapper = createOpenRouterPromptCacheWrapper(
        mockStreamFn,
        "openrouter",
        "google/gemini-3-flash-preview",
      );

      if (!wrapper) {
        throw new Error("Wrapper not created");
      }

      wrapper({} as any, {} as any, {
        onPayload: (payload: any) => {
          const messages = payload.messages as any[];
          expect(messages).toHaveLength(1);
          expect(Array.isArray(messages[0].content)).toBe(true);

          const contentBlocks = messages[0].content as any[];
          // Should have cache_control on at least one block
          expect(contentBlocks.some((b) => b.cache_control)).toBe(true);

          // Should have the full text content across blocks
          const fullText = contentBlocks.map((b) => b.text || "").join("");
          expect(fullText).toBe(longText);

          resolve();
        },
      });
    });
  });

  it("should handle short messages without caching", async () => {
    return new Promise<void>((resolve) => {
      const shortText = "Hi there";

      const mockStreamFn: StreamFn = (model, context, options) => {
        const payload = {
          messages: [
            {
              role: "user",
              content: shortText,
            },
          ],
        };
        options?.onPayload?.(payload);
        return Promise.resolve("");
      };

      const wrapper = createOpenRouterPromptCacheWrapper(
        mockStreamFn,
        "openrouter",
        "google/gemini-3-flash-preview",
      );

      if (!wrapper) {
        throw new Error("Wrapper not created");
      }

      wrapper({} as any, {} as any, {
        onPayload: (payload: any) => {
          const messages = payload.messages as any[];
          expect(messages).toHaveLength(1);
          expect(Array.isArray(messages[0].content)).toBe(true);

          const contentBlocks = messages[0].content as any[];
          // Short messages should not have cache_control
          expect(contentBlocks.every((b) => !b.cache_control)).toBe(true);

          resolve();
        },
      });
    });
  });

  it("should preserve assistant messages without caching", async () => {
    return new Promise<void>((resolve) => {
      const mockStreamFn: StreamFn = (model, context, options) => {
        const payload = {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "a".repeat(2000),
                  cache_control: { type: "ephemeral" },
                },
              ],
            },
          ],
        };
        options?.onPayload?.(payload);
        return Promise.resolve("");
      };

      const wrapper = createOpenRouterPromptCacheWrapper(
        mockStreamFn,
        "openrouter",
        "google/gemini-3-flash-preview",
      );

      if (!wrapper) {
        throw new Error("Wrapper not created");
      }

      wrapper({} as any, {} as any, {
        onPayload: (payload: any) => {
          const messages = payload.messages as any[];
          const assistantContent = messages[0].content as any[];

          // Assistant messages should pass through unchanged
          // (they shouldn't have cache_control added or removed)
          expect(assistantContent[0].cache_control).toBeDefined();

          resolve();
        },
      });
    });
  });
});
