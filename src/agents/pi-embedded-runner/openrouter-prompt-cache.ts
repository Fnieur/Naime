import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { SimpleStreamOptions } from "@mariozechner/pi-ai";
import { log } from "./logger.js";

/**
 * OpenRouter Prompt Caching Wrapper
 *
 * Injects cache_control headers into message content for OpenRouter models
 * that support prompt caching (Gemini, Claude via OpenRouter, etc.)
 *
 * Caching is applied to:
 * - System messages (full cache for stable instructions)
 * - Long user messages (first 90% marked for cache, last 10% for context)
 * - Tool results (stable reference content)
 *
 * This reduces latency and costs by up to 90% on cached tokens.
 * @see https://openrouter.ai/docs/guides/caching
 */

type ContentBlock = {
  type: string;
  text?: string;
  cache_control?: { type: "ephemeral" | "static"; ttl?: string };
  [key: string]: unknown;
};

type Message = {
  role: string;
  content?: string | ContentBlock[] | null;
  [key: string]: unknown;
};

type StreamPayload = {
  messages?: Message[];
  system?: string | ContentBlock[] | null;
  [key: string]: unknown;
};

/**
 * Check if a provider/model should use prompt caching
 */
function shouldUseCaching(provider: string, modelId: string): boolean {
  // Only enable for OpenRouter with supported models
  if (provider !== "openrouter") {
    return false;
  }

  // Supported models for caching
  const cacheSupportedModels = [
    "google/gemini", // All Gemini variants
    "anthropic/claude", // Claude via OpenRouter
  ];

  return cacheSupportedModels.some((supported) => modelId.includes(supported));
}

/**
 * Convert a string message to content block format with caching
 */
function stringToContentBlocks(text: string, isCacheable: boolean): ContentBlock[] {
  if (!isCacheable || text.length < 1024) {
    // Too short to cache, return as simple text
    return [{ type: "text", text }];
  }

  // For longer messages, split into cache and non-cache sections
  // Keep last 10% for context window flexibility, cache first 90%
  const cacheSize = Math.floor(text.length * 0.9);
  const cachedText = text.slice(0, cacheSize);
  const contextText = text.slice(cacheSize);

  const blocks: ContentBlock[] = [];

  if (cachedText) {
    blocks.push({
      type: "text",
      text: cachedText,
      cache_control: { type: "ephemeral" },
    });
  }

  if (contextText) {
    blocks.push({
      type: "text",
      text: contextText,
    });
  }

  return blocks;
}

/**
 * Add cache_control to existing content blocks
 */
function addCachingToContentBlocks(
  blocks: ContentBlock[],
  cacheablePart: "full" | "partial",
): ContentBlock[] {
  return blocks.map((block, index) => {
    if (block.type !== "text" || !block.text) {
      return block;
    }

    if (cacheablePart === "full") {
      // Mark entire block for caching (e.g., system messages)
      // Add cache_control to all text blocks
      return {
        ...block,
        cache_control: { type: "ephemeral" },
      };
    }

    // Partial: only cache if not the last block
    if (index < blocks.length - 1) {
      return {
        ...block,
        cache_control: { type: "ephemeral" },
      };
    }

    return block;
  });
}

/**
 * Process messages to add prompt caching headers
 */
function processMessagesForCaching(messages: Message[] | undefined): Message[] | undefined {
  if (!messages || !Array.isArray(messages)) {
    return messages;
  }

  return messages.map((msg) => {
    // Convert string content to blocks if needed
    if (typeof msg.content === "string") {
      return {
        ...msg,
        content: stringToContentBlocks(
          msg.content,
          msg.role !== "assistant", // Cache user/system messages, not assistant
        ),
      };
    }

    // Already an array of content blocks
    if (Array.isArray(msg.content)) {
      // Only cache non-assistant messages
      if (msg.role === "assistant") {
        return msg;
      }

      return {
        ...msg,
        content: addCachingToContentBlocks(msg.content, "partial"),
      };
    }

    return msg;
  });
}

/**
 * Process system message/prompt for caching
 * System prompts are always cached entirely since they're stable reference material
 */
function processSystemForCaching(
  system: string | ContentBlock[] | null | undefined,
): string | ContentBlock[] | null | undefined {
  if (!system) {
    return system;
  }

  if (typeof system === "string") {
    // System messages are stable, cache entirely as a single block
    // No length check needed as both branches used identical logic
    return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  }

  if (Array.isArray(system)) {
    // Cache all blocks in system prompt
    return addCachingToContentBlocks(system, "full");
  }

  return system;
}

/**
 * Create a streamFn wrapper that injects prompt caching for OpenRouter
 */
export function createOpenRouterPromptCacheWrapper(
  baseStreamFn: StreamFn | undefined,
  provider: string,
  modelId: string,
): StreamFn | undefined {
  if (!shouldUseCaching(provider, modelId)) {
    return undefined;
  }

  log.debug(
    `[OpenRouter Caching] enabled for ${provider}/${modelId} - will inject cache_control headers`,
  );

  const underlying =
    baseStreamFn ??
    (() => {
      throw new Error("baseStreamFn required for caching wrapper");
    });

  const wrappedStreamFn: StreamFn = (model, context, options) => {
    const originalOnPayload = options?.onPayload;

    return underlying(model, context, {
      ...options,
      onPayload: (payload: unknown) => {
        if (!payload || typeof payload !== "object") {
          originalOnPayload?.(payload);
          return;
        }

        const streamPayload = payload as StreamPayload;

        // Process messages for caching
        if (streamPayload.messages) {
          const processedMessages = processMessagesForCaching(streamPayload.messages);
          if (processedMessages) {
            streamPayload.messages = processedMessages;
            log.debug(
              `[OpenRouter Caching] processed ${streamPayload.messages.length} messages with cache_control headers`,
            );
          }
        }

        // Process system prompt for caching
        if (streamPayload.system !== undefined) {
          const originalSystem = streamPayload.system;
          const processedSystem = processSystemForCaching(originalSystem);
          // Update if type changed (string → array) or content was modified
          const wasString = typeof originalSystem === "string";
          const nowArray = Array.isArray(processedSystem);
          if (wasString && nowArray) {
            streamPayload.system = processedSystem;
            log.debug(`[OpenRouter Caching] processed system prompt with cache_control headers`);
          }
        }

        originalOnPayload?.(payload);
      },
    });
  };

  return wrappedStreamFn;
}
