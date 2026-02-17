/**
 * Utilities for extracting and monitoring Anthropic API rate limit headers.
 * Used by the subagent orchestration system to make dynamic spawn delay decisions.
 */

export interface AnthropicRateLimitState {
  requestsRemaining: number | null;
  inputTokensRemaining: number | null;
  outputTokensRemaining: number | null;
  requestsReset: Date | null;
  inputTokensReset: Date | null;
  outputTokensReset: Date | null;
  requestsLimit: number | null;
  inputTokensLimit: number | null;
  outputTokensLimit: number | null;
}

/**
 * Extract rate limit information from Anthropic API response headers.
 * Headers are rounded to nearest 1000 for input/output tokens.
 */
export function extractAnthropicRateLimitState(
  headers: Record<string, string>,
): AnthropicRateLimitState {
  const parseNumber = (value: string | undefined): number | null => {
    if (!value) {
      return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseDate = (value: string | undefined): Date | null => {
    if (!value) {
      return null;
    }
    try {
      return new Date(value);
    } catch {
      return null;
    }
  };

  return {
    requestsRemaining: parseNumber(headers["anthropic-ratelimit-requests-remaining"]),
    inputTokensRemaining: parseNumber(headers["anthropic-ratelimit-input-tokens-remaining"]),
    outputTokensRemaining: parseNumber(headers["anthropic-ratelimit-output-tokens-remaining"]),
    requestsReset: parseDate(headers["anthropic-ratelimit-requests-reset"]),
    inputTokensReset: parseDate(headers["anthropic-ratelimit-input-tokens-reset"]),
    outputTokensReset: parseDate(headers["anthropic-ratelimit-output-tokens-reset"]),
    requestsLimit: parseNumber(headers["anthropic-ratelimit-requests-limit"]),
    inputTokensLimit: parseNumber(headers["anthropic-ratelimit-input-tokens-limit"]),
    outputTokensLimit: parseNumber(headers["anthropic-ratelimit-output-tokens-limit"]),
  };
}

/**
 * Calculate the percentage of rate limit capacity consumed.
 * Returns null if either limit or remaining is unknown.
 */
export function getCapacityPercentage(
  limit: number | null,
  remaining: number | null,
): number | null {
  if (limit === null || remaining === null) {
    return null;
  }
  if (limit === 0) {
    return null;
  }
  return (limit - remaining) / limit;
}

/**
 * Recommend a spawn delay based on current capacity consumption.
 * Conservative: scale from 2s (spare capacity) to 16s (near limit).
 *
 * @param capacityPercentage 0.0 (spare) to 1.0 (full)
 * @returns recommended delay in milliseconds
 */
export function recommendSpawnDelayMs(capacityPercentage: number | null): number {
  if (capacityPercentage === null) {
    return 2000; // Default: 2s
  }

  // Clamp to valid range
  const capped = Math.max(0, Math.min(1, capacityPercentage));

  // Linear scaling: 2s at 0%, 16s at 100%
  // Formula: 2000 + (capped * 14000)
  return Math.round(2000 + capped * 14000);
}

/**
 * Determine if we should warn about approaching rate limits.
 */
export function shouldWarnRateLimit(capacityPercentage: number | null, warnAt: number): boolean {
  if (capacityPercentage === null) {
    return false;
  }
  return capacityPercentage >= warnAt;
}

/**
 * Determine if we should halt spawning to avoid rate limit errors.
 */
export function shouldHaltSpawning(capacityPercentage: number | null, haltAt: number): boolean {
  if (capacityPercentage === null) {
    return false;
  }
  return capacityPercentage >= haltAt;
}

/**
 * Calculate effective ITPM given cache hit rate.
 * With caching, only uncached tokens count toward ITPM.
 * Example: 1M ITPM raw + 80% cache hit = 5M effective (1M / 0.2).
 */
export function calculateEffectiveITPM(rawITPM: number, estimatedCacheHitRate: number): number {
  const uncachedPortion = Math.max(0.01, 1 - estimatedCacheHitRate);
  return Math.round(rawITPM / uncachedPortion);
}

/**
 * Estimate cost (input tokens) for a subagent spawn before execution.
 * Accounts for system prompt, context, and estimated cache behavior.
 */
export function estimateSpawnCost(params: {
  systemPromptTokens: number;
  contextTokens: number;
  estimatedCacheHitRate: number;
}): number {
  // Assume system prompt is in cache (high reuse), context varies
  const cachedTokens = params.systemPromptTokens;
  const uncachedTokens = params.contextTokens;

  // Only uncached tokens count toward ITPM
  return uncachedTokens;
}
