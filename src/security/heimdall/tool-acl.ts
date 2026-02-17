/**
 * Heimdall Security Layer — Tool ACL
 *
 * Determines whether a given tool is allowed for a specific sender tier.
 * Evaluation order:
 *   1. OWNER bypass (always allowed, cannot be restricted by config)
 *   2. Normalize tool name via normalizeToolName
 *   3. Custom toolACL entries (glob-matched, first match wins)
 *   4. Default rules: dangerous patterns → deny; safe lists → allow; else deny
 *      (SYSTEM tier uses MEMBER safe list as conservative baseline)
 */

import type { HeimdallConfig, SenderTier } from "./types.js";
import { normalizeToolName } from "../../agents/tool-policy.js";
import { SenderTier as SenderTierEnum } from "./types.js";

// ---------------------------------------------------------------------------
// Glob helper
// ---------------------------------------------------------------------------

/**
 * Convert a glob pattern (with `*` wildcards) to a RegExp.
 * `*` matches any sequence of characters (including none).
 * All other regex-special characters are escaped.
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^]*");
  return new RegExp(`^${escaped}$`);
}

// ---------------------------------------------------------------------------
// Built-in tool lists
// ---------------------------------------------------------------------------

/** Dangerous tools — only OWNER may invoke these by default. */
const DEFAULT_DANGEROUS_PATTERNS: string[] = [
  "exec",
  "process",
  "apply_patch",
  "write",
  "edit",
  "sandboxed_write",
  "sandboxed_edit",
  "mcp__*__execute_*",
  "mcp__*__write_*",
  "mcp__*__delete_*",
];

/**
 * Tools considered safe for MEMBER tier by default.
 *
 * **SYSTEM tier also uses this list** as conservative baseline (Task 1.3, Phase 1).
 * SYSTEM tier gets read-only tools + audit trail, without OWNER privileges.
 *
 * **Rationale:**
 * - All tools in this list are read-only or low-risk queries
 * - No file writes, no command execution, no destructive operations
 * - Suitable for internal runtime operations (cron, heartbeat, CLI)
 *
 * **To extend for SYSTEM tier**, add custom toolACL entry in config:
 * ```typescript
 * heimdall: {
 *   enabled: true,
 *   toolACL: [
 *     {
 *       pattern: "message",  // Allow notification delivery
 *       allowedTiers: ["system", "member", "owner"],
 *     },
 *     {
 *       pattern: "sessions_send",  // Allow agent-to-agent messaging
 *       allowedTiers: ["system", "member", "owner"],
 *     },
 *   ],
 * }
 * ```
 */
const DEFAULT_MEMBER_SAFE: Set<string> = new Set([
  "search",
  "read",
  "sessions_list",
  "sessions_history",
  "session_status",
  "image",
  "memory_search",
  "memory_get",
  "web_search",
  "web_fetch",
  "agents_list",
]);

/** Read-only tools available to GUEST when defaultGuestPolicy is "read-only". */
const GUEST_READ_ONLY: Set<string> = new Set([
  "search",
  "read",
  "sessions_list",
  "sessions_history",
  "session_status",
  "image",
  "memory_search",
]);

// ---------------------------------------------------------------------------
// Pre-compiled regexes for default dangerous patterns
// ---------------------------------------------------------------------------

const DANGEROUS_REGEXES: RegExp[] = DEFAULT_DANGEROUS_PATTERNS.map(globToRegex);

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/** Cache for compiled ACL glob patterns — config doesn't change at runtime. */
const aclPatternCache = new Map<string, RegExp>();

function matchesPattern(toolName: string, pattern: string): boolean {
  let re = aclPatternCache.get(pattern);
  if (!re) {
    re = globToRegex(pattern);
    aclPatternCache.set(pattern, re);
  }
  return re.test(toolName);
}

function isDangerous(toolName: string): boolean {
  return DANGEROUS_REGEXES.some((re) => re.test(toolName));
}

/**
 * Check whether `toolName` is allowed for `senderTier` under the given config.
 *
 * Rules (evaluated in order):
 * 1. OWNER → always `true` (hardcoded bypass, config cannot restrict).
 * 2. Normalize tool name.
 * 3. Custom `toolACL` — first matching glob wins; allow if tier is listed.
 * 4. Defaults:
 *    a. Matches a dangerous pattern → deny.
 *    b. SYSTEM + tool in MEMBER safe list → allow (conservative baseline).
 *       - SYSTEM tier uses same baseline as MEMBER (read-only tools)
 *       - Rationale: internal operations (cron, CLI) need minimal privileges
 *       - To extend: add custom toolACL entry with "system" in allowedTiers
 *    c. MEMBER + tool in MEMBER safe list → allow.
 *    d. GUEST + "read-only" policy + tool in read-only list → allow.
 *    e. Otherwise → deny.
 *
 * @example Extend SYSTEM tier baseline
 * ```typescript
 * // In heimdall config:
 * toolACL: [
 *   {
 *     pattern: "message",  // Allow notifications
 *     allowedTiers: ["system", "member", "owner"],
 *   },
 * ]
 * ```
 */
export function isToolAllowed(
  toolName: string,
  senderTier: SenderTier,
  config: Pick<HeimdallConfig, "defaultGuestPolicy" | "toolACL">,
): boolean {
  // 1. OWNER bypass
  if (senderTier === SenderTierEnum.OWNER) {
    return true;
  }

  // 2. Normalize
  const normalized = normalizeToolName(toolName);

  // 3. Custom ACL — first matching entry wins
  if (config.toolACL && config.toolACL.length > 0) {
    for (const entry of config.toolACL) {
      if (matchesPattern(normalized, entry.pattern)) {
        return entry.allowedTiers.includes(senderTier);
      }
    }
  }

  // 4a. Dangerous patterns → deny non-OWNER
  if (isDangerous(normalized)) {
    return false;
  }

  // 4b. SYSTEM tier — conservative baseline (same as MEMBER safe list)
  if (senderTier === SenderTierEnum.SYSTEM && DEFAULT_MEMBER_SAFE.has(normalized)) {
    return true;
  }

  // 4c. MEMBER safe list
  if (senderTier === SenderTierEnum.MEMBER && DEFAULT_MEMBER_SAFE.has(normalized)) {
    return true;
  }

  // 4d. GUEST read-only policy
  if (
    senderTier === SenderTierEnum.GUEST &&
    config.defaultGuestPolicy === "read-only" &&
    GUEST_READ_ONLY.has(normalized)
  ) {
    return true;
  }

  // 4e. Default deny
  return false;
}
