import type { OpenClawConfig } from "../../config/config.js";

const RLM_DEFAULT_MAX_DEPTH = 2;
const RLM_DEFAULT_TIMEOUT_SECONDS = 120;
const RLM_MAX_DEPTH_HARD = 8;
const RLM_MAX_ITERATIONS_HARD = 96;
const RLM_MAX_LLM_CALLS_HARD = 2_048;

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export type ResolvedRlmOptions = {
  maxDepth: number;
  maxIterations?: number;
  maxLlmCalls?: number;
  extractOnMaxIterations?: boolean;
  timeoutSeconds: number;
  timeoutMs: number;
};

export function resolveRlmOptions(params: {
  cfg?: OpenClawConfig;
  requestedMaxDepth?: number;
  requestedTimeoutSeconds?: number;
}): ResolvedRlmOptions {
  const cfg = params.cfg;

  const cfgDepth = toFiniteNumber(cfg?.tools?.rlm?.maxDepth);
  const reqDepth = toFiniteNumber(params.requestedMaxDepth);
  const maxDepth = clampInt(reqDepth ?? cfgDepth ?? RLM_DEFAULT_MAX_DEPTH, 0, RLM_MAX_DEPTH_HARD);

  const cfgMaxIterations = toFiniteNumber(cfg?.tools?.rlm?.maxIterations);
  const maxIterations =
    cfgMaxIterations === undefined
      ? undefined
      : clampInt(cfgMaxIterations, 1, RLM_MAX_ITERATIONS_HARD);

  const cfgMaxLlmCalls = toFiniteNumber(cfg?.tools?.rlm?.maxLlmCalls);
  const maxLlmCalls =
    cfgMaxLlmCalls === undefined ? undefined : clampInt(cfgMaxLlmCalls, 1, RLM_MAX_LLM_CALLS_HARD);

  const extractOnMaxIterations =
    typeof cfg?.tools?.rlm?.extractOnMaxIterations === "boolean"
      ? cfg.tools.rlm.extractOnMaxIterations
      : undefined;

  const cfgTimeoutSeconds = toFiniteNumber(cfg?.tools?.rlm?.timeoutSeconds);
  const reqTimeoutSeconds = toFiniteNumber(params.requestedTimeoutSeconds);
  const timeoutSeconds = Math.max(
    1,
    Math.floor(reqTimeoutSeconds ?? cfgTimeoutSeconds ?? RLM_DEFAULT_TIMEOUT_SECONDS),
  );

  return {
    maxDepth,
    maxIterations,
    maxLlmCalls,
    extractOnMaxIterations,
    timeoutSeconds,
    timeoutMs: timeoutSeconds * 1_000,
  };
}
