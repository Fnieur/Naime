import { formatErrorMessage } from "./errors.js";

// -- CLOUDFLARE DETECTION --

export const CLOUDFLARE_BLOCK_RE = /cloudflare|cf-ray|challenge-platform|1020.*access denied/i;

export function isCloudflareBlock(err: unknown): boolean {
  return CLOUDFLARE_BLOCK_RE.test(formatErrorMessage(err));
}

export function cloudflareBackoffMs(attempt: number): number {
  // Standard 60s minimum for Cloudflare blocks, doubling each time
  return Math.min(60_000 * Math.pow(2, attempt - 1), 600_000);
}

// -- OPENROUTER SPECIFIC UTILS --

export interface OpenRouterProfile {
  id: string;
  isFree: boolean;
  dailyLimit?: number;
}

export const OPENROUTER_MODEL_PROFILES: Record<string, OpenRouterProfile> = {
  "google/gemini-pro": { id: "google/gemini-pro", isFree: false },
  "anthropic/claude-3-haiku": { id: "anthropic/claude-3-haiku", isFree: false },
};

export function getModelProfile(model: string): OpenRouterProfile {
  return (
    OPENROUTER_MODEL_PROFILES[model] ?? {
      id: model,
      isFree: model.includes(":free"),
    }
  );
}

export interface OpenRouterState {
  lastCheckedAt?: Date;
  modelRequestCounts: Record<string, number>;
}

export function isDailyLimitExceeded(
  model: string,
  state: OpenRouterState,
  dailyLimit = 200,
): boolean {
  const profile = getModelProfile(model);
  if (!profile.isFree) {
    return false;
  }
  return (state.modelRequestCounts[model] ?? 0) >= dailyLimit;
}

export function isStateStale(state: OpenRouterState, staleAfterMs = 3600000): boolean {
  if (!state.lastCheckedAt) {
    return true;
  }
  return Date.now() - state.lastCheckedAt.getTime() > staleAfterMs;
}

export type ProviderType = "anthropic" | "openrouter" | "local" | "unknown";

export function detectProvider(model: string, baseUrl?: string): ProviderType {
  if (baseUrl) {
    if (/openrouter\.ai/i.test(baseUrl)) {
      return "openrouter";
    }
    if (/anthropic\.com/i.test(baseUrl)) {
      return "anthropic";
    }
    if (/localhost|127\.0\.0\.1|ollama/i.test(baseUrl)) {
      return "local";
    }
  }

  // Model string heuristics
  if (/^openrouter\//i.test(model)) {
    return "openrouter";
  }
  if (/^anthropic\//i.test(model)) {
    return "anthropic";
  }
  if (/^ollama\//i.test(model) || model === "qwen-local") {
    return "local";
  }

  // Models routed through OpenRouter typically have org/ prefix
  if (/^(moonshotai|deepseek|meta-llama|google|mistralai)\//i.test(model)) {
    return "openrouter";
  }

  return "unknown";
}
