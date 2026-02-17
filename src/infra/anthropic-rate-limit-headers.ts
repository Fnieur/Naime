export function parseRateLimitHeaders(headers: Headers) {
  const parseNumber = (value: string | undefined): number | null => {
    if (!value) {
      return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseDate = (value: string | undefined): Date | null => {
    if (!value) {
      return null;
    }
    try {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };

  return {
    requestsLimit: parseNumber(headers.get("anthropic-ratelimit-requests-limit")),
    requestsRemaining: parseNumber(headers.get("anthropic-ratelimit-requests-remaining")),
    requestsReset: parseDate(headers.get("anthropic-ratelimit-requests-reset")),
    tokensLimit: parseNumber(headers.get("anthropic-ratelimit-tokens-limit")),
    tokensRemaining: parseNumber(headers.get("anthropic-ratelimit-tokens-remaining")),
    tokensReset: parseDate(headers.get("anthropic-ratelimit-tokens-reset")),
    retryAfter: parseNumber(headers.get("retry-after")),
  };
}

export function calculateCapacityPercentage(
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

export interface RateLimitMetrics {
  requestsCapacity: number | null;
  tokensCapacity: number | null;
}

export function getRateLimitMetrics(headers: Headers): RateLimitMetrics {
  const parsed = parseRateLimitHeaders(headers);
  return {
    requestsCapacity: calculateCapacityPercentage(parsed.requestsLimit, parsed.requestsRemaining),
    tokensCapacity: calculateCapacityPercentage(parsed.tokensLimit, parsed.tokensRemaining),
  };
}

export interface RateLimitStatus {
  isWarning: boolean;
  isHaltNeeded: boolean;
  metrics: RateLimitMetrics;
}

export function shouldWarnRateLimit(capacityPercentage: number | null, warnAt: number): boolean {
  if (capacityPercentage === null) {
    return false;
  }
  return capacityPercentage >= warnAt;
}

export function shouldHaltSpawning(capacityPercentage: number | null, haltAt: number): boolean {
  if (capacityPercentage === null) {
    return false;
  }
  return capacityPercentage >= haltAt;
}

export function analyzeRateLimits(
  headers: Headers,
  config: { warnAt: number; haltAt: number },
): RateLimitStatus {
  const metrics = getRateLimitMetrics(headers);
  const isWarning =
    shouldWarnRateLimit(metrics.requestsCapacity, config.warnAt) ||
    shouldWarnRateLimit(metrics.tokensCapacity, config.warnAt);
  const isHaltNeeded =
    shouldHaltSpawning(metrics.requestsCapacity, config.haltAt) ||
    shouldHaltSpawning(metrics.tokensCapacity, config.haltAt);

  return { isWarning, isHaltNeeded, metrics };
}

export interface SpawnThrottleParams {
  systemPromptTokens: number;
  contextTokens: number;
  availableTokens: number | null;
}

export function estimateSpawnImpact(params: SpawnThrottleParams): number | null {
  if (params.availableTokens === null) {
    return null;
  }
  const uncachedTokens = params.contextTokens;
  return uncachedTokens / params.availableTokens;
}
