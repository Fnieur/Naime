/**
 * Heimdall Security Layer — Type Definitions
 *
 * Deterministic security enforcement: GATE → SANITIZE → AUTHORIZE → FILTER
 *
 * Sender Tiers:
 *   OWNER   - Account owner (full access by default)
 *   SYSTEM  - Trusted internal runtime (same access as MEMBER; trust boundary marker)
 *   MEMBER  - Team member (read + safe operations)
 *   GUEST   - External user (minimal access, configurable)
 *
 * Resolution order: isTrustedInternal → OWNER → MEMBER → allowFrom → GUEST
 * Privilege order: OWNER >> SYSTEM = MEMBER > GUEST
 */

// ---------------------------------------------------------------------------
// SenderTier
// ---------------------------------------------------------------------------

/**
 * Sender tier constants (authorization hierarchy).
 *
 * Evaluation order (most to least privileged):
 * - **OWNER:** Account owner or admin. Full unrestricted access by default (hardcoded bypass).
 *   - Cannot be restricted by toolACL config
 *   - Used for human administrators, CLI with owner credentials
 * - **SYSTEM:** Trusted internal runtime calls (cron, heartbeat, maintenance).
 *   - Conservative baseline: same as MEMBER safe list (read-only tools)
 *   - Non-delegable: subagents do NOT inherit SYSTEM tier (security by design)
 *   - To extend: add custom toolACL entry with "system" in allowedTiers
 *   - Examples: `internal: true` in pi-tools, cron jobs, scheduled tasks
 * - **MEMBER:** Team member with normal privileges.
 *   - Safe list: read-only tools + low-risk operations (search, web_fetch, memory_search)
 *   - No file writes, no command execution by default
 * - **GUEST:** External user or unauthorized sender.
 *   - Minimal access (read-only if defaultGuestPolicy = "read-only", else deny-all)
 *
 * **Migration from senderIsOwner:**
 * - Old: `senderIsOwner: true` → forced OWNER tier (privilege escalation risk)
 * - New: `internal: true` (pi-tools param) → SecurityContext.isTrustedInternal → SYSTEM tier (least privilege, auditable)
 */
export const SenderTier = {
  /** Account owner or admin. Full unrestricted access (hardcoded bypass). */
  OWNER: "owner",
  /**
   * Trusted internal runtime calls (cron, heartbeat, maintenance).
   * Conservative baseline: same as MEMBER safe list (read-only tools).
   * Non-delegable: subagents do NOT inherit SYSTEM tier.
   */
  SYSTEM: "system",
  /** Team member with normal privileges. Safe list: read-only + low-risk tools. */
  MEMBER: "member",
  /** External user or unauthorized sender. Minimal access (read-only or deny-all). */
  GUEST: "guest",
} as const;

export type SenderTier = (typeof SenderTier)[keyof typeof SenderTier];

// ---------------------------------------------------------------------------
// SecurityContext — flows through the tool pipeline
// ---------------------------------------------------------------------------

export interface SecurityContext {
  senderId: string | number;
  senderUsername?: string;
  senderTier: SenderTier;
  /**
   * Set to true for trusted internal runtime calls.
   *
   * Examples: cron jobs, scheduled heartbeats, maintenance tasks.
   * These run without direct user interaction and should use SYSTEM tier
   * to prevent privilege escalation if compromised.
   *
   * **Note:** Takes precedence over all tier resolution — even senders in
   * the owners list will resolve to SYSTEM (not OWNER) when this is set.
   * This is intentional: automated calls should have minimal privileges.
   */
  isTrustedInternal?: boolean;
  channel: string;
  accountId?: string;
  groupId?: string;
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Tool ACL
// ---------------------------------------------------------------------------

export interface ToolACLEntry {
  /** Glob pattern: "exec", "mcp__*", "browser_*" */
  pattern: string;
  /** Tiers allowed to invoke tools matching this pattern. */
  allowedTiers: SenderTier[];
}

// ---------------------------------------------------------------------------
// Output Filter
// ---------------------------------------------------------------------------

export interface OutputFilterPattern {
  /** Human-readable label (e.g. "OpenAI API Key"). */
  name: string;
  /** Regex source string (compiled at runtime). */
  regex: string;
  /** Regex flags (default: "g"). */
  flags?: string;
}

export interface OutputFilterConfig {
  enabled?: boolean;
  /** Extra patterns beyond built-in defaults. */
  customPatterns?: OutputFilterPattern[];
}

export interface RedactionMatch {
  pattern: string;
  count: number;
}

export interface RedactionResult {
  redacted: string;
  matches: RedactionMatch[];
}

// ---------------------------------------------------------------------------
// Input Sanitize
// ---------------------------------------------------------------------------

export interface SanitizeConfig {
  /** Max input length in characters (default: 100_000). */
  maxLength?: number;
  /** Apply NFKC unicode normalization (default: true). */
  nfkcNormalize?: boolean;
  /**
   * Max density of control characters (0-1) before stripping (default: 0.1).
   * Control chars = U+0000-U+001F excluding \t \n \r, plus U+007F-U+009F.
   */
  controlCharDensityThreshold?: number;
}

export interface SanitizeWarning {
  type: "truncated" | "normalized" | "control_chars_stripped";
  detail: string;
}

export interface SanitizeResult {
  text: string;
  warnings: SanitizeWarning[];
}

// ---------------------------------------------------------------------------
// Sender Tiers Config
// ---------------------------------------------------------------------------

export interface SenderTiersConfig {
  /** Sender IDs or usernames recognized as OWNER. */
  owners?: Array<string | number>;
  /** Sender IDs or usernames recognized as MEMBER. */
  members?: Array<string | number>;
  /**
   * No "system" list — SYSTEM tier is only assigned via SecurityContext.isTrustedInternal flag.
   * This prevents external callers from claiming SYSTEM privileges via config.
   * SYSTEM tier is reserved for trusted internal runtime (cron, heartbeat, CLI with `internal: true`).
   */
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export interface HeimdallRateLimitConfig {
  /** Enable rate limiting (default: false). */
  enabled?: boolean;
  /** Sliding window duration in milliseconds (default: 60_000). */
  windowMs?: number;
  /** Max messages per sender per window (default: 30). */
  maxMessages?: number;
  /** Stricter limit for GUEST senders (default: 5). */
  guestMaxMessages?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

// ---------------------------------------------------------------------------
// Audit Logging
// ---------------------------------------------------------------------------

export interface HeimdallAuditConfig {
  /** Enable audit logging (default: false). */
  enabled?: boolean;
  /** Log blocked tool calls. */
  logBlockedTools?: boolean;
  /** Log output redaction events. */
  logRedactions?: boolean;
  /** Log rate limit hits. */
  logRateLimits?: boolean;
  /** Log input sanitization warnings. */
  logSanitization?: boolean;
}

// ---------------------------------------------------------------------------
// Heimdall Top-Level Config
// ---------------------------------------------------------------------------

export interface HeimdallConfig {
  /** Master switch (default: false). */
  enabled?: boolean;

  /** Explicit sender tier mappings. */
  senderTiers?: SenderTiersConfig;

  /** Default policy for GUEST senders: deny all tools or allow read-only. */
  defaultGuestPolicy?: "deny" | "read-only";

  /** Custom tool ACL entries (merged with built-in defaults). */
  toolACL?: ToolACLEntry[];

  /** Output redaction settings. */
  outputFilter?: OutputFilterConfig;

  /** Input sanitization settings. */
  sanitize?: SanitizeConfig;

  /** Per-sender rate limiting. */
  rateLimit?: HeimdallRateLimitConfig;

  /** Audit logging for security events. */
  audit?: HeimdallAuditConfig;
}
