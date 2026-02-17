/**
 * Heimdall Audit Logger — structured security event logging.
 *
 * Uses the existing subsystem logger infrastructure.
 * JSON lines to file, same pattern as command-logger.
 */

import type { HeimdallAuditConfig, SanitizeWarning, SenderTier } from "./types.js";

export interface HeimdallAuditLogger {
  logToolBlocked(event: {
    toolName: string;
    senderTier: SenderTier;
    reason: string;
    /**
     * Optional: context for internal operations (cron, heartbeat, maintenance).
     * Most relevant for SYSTEM tier events.
     */
    internal_reason?: string;
    /**
     * Optional: correlation ID for tracing multi-step operations.
     * Useful for linking related audit events.
     */
    correlation_id?: string;
  }): void;
  logRedaction(event: {
    patterns: string[];
    totalMatches: number;
    /** True when the match was detected across a streaming chunk boundary. */
    crossChunk?: boolean;
    correlation_id?: string;
  }): void;
  logRateLimit(event: {
    senderId: string | number;
    senderTier: SenderTier;
    internal_reason?: string;
    correlation_id?: string;
  }): void;
  logSanitization(event: { warnings: SanitizeWarning[]; correlation_id?: string }): void;
}

const noopLogger: HeimdallAuditLogger = {
  logToolBlocked: () => {},
  logRedaction: () => {},
  logRateLimit: () => {},
  logSanitization: () => {},
};

let singleton: HeimdallAuditLogger | null = null;
let singletonConfigKey: string | undefined;

/** Stable cache key from audit config fields that affect behavior. */
function auditConfigKey(config?: HeimdallAuditConfig): string {
  if (!config?.enabled) {
    return "disabled";
  }
  return `${config.logBlockedTools}:${config.logRedactions}:${config.logRateLimits}:${config.logSanitization}`;
}

export function createHeimdallAuditLogger(config?: HeimdallAuditConfig): HeimdallAuditLogger {
  if (!config?.enabled) {
    return noopLogger;
  }

  // Lazy-import subsystem logger to avoid circular deps at module load.
  // The actual import is cheap and cached after first call.
  let loggerPromise: Promise<typeof import("../../logging/subsystem.js")> | null = null;
  const getSubsystemModule = () => {
    if (!loggerPromise) {
      loggerPromise = import("../../logging/subsystem.js");
    }
    return loggerPromise;
  };

  // Cache the resolved logger instance to avoid re-creation on every event.
  let cachedLogger: Awaited<
    ReturnType<typeof import("../../logging/subsystem.js").createSubsystemLogger>
  > | null = null;

  const emit = async (event: string, data: Record<string, unknown>) => {
    try {
      if (!cachedLogger) {
        const { createSubsystemLogger } = await getSubsystemModule();
        cachedLogger = createSubsystemLogger("heimdall/audit");
      }
      cachedLogger.info(`[${event}] ${JSON.stringify(data)}`, { event, ...data });
    } catch {
      // never block on audit log failures
    }
  };

  return {
    logToolBlocked(event) {
      if (!config.logBlockedTools) {
        return;
      }
      void emit("tool_blocked", {
        toolName: event.toolName,
        senderTier: event.senderTier,
        reason: event.reason,
        ...(event.internal_reason && { internal_reason: event.internal_reason }),
        ...(event.correlation_id && { correlation_id: event.correlation_id }),
      });
    },
    logRedaction(event) {
      if (!config.logRedactions) {
        return;
      }
      void emit("redaction", {
        patterns: event.patterns,
        totalMatches: event.totalMatches,
        ...(event.crossChunk && { crossChunk: true }),
        ...(event.correlation_id && { correlation_id: event.correlation_id }),
      });
    },
    logRateLimit(event) {
      if (!config.logRateLimits) {
        return;
      }
      void emit("rate_limit", {
        senderId: event.senderId,
        senderTier: event.senderTier,
        ...(event.internal_reason && { internal_reason: event.internal_reason }),
        ...(event.correlation_id && { correlation_id: event.correlation_id }),
      });
    },
    logSanitization(event) {
      if (!config.logSanitization) {
        return;
      }
      void emit("sanitization", {
        warnings: event.warnings,
        ...(event.correlation_id && { correlation_id: event.correlation_id }),
      });
    },
  };
}

export function getHeimdallAuditLogger(config?: HeimdallAuditConfig): HeimdallAuditLogger {
  const key = auditConfigKey(config);
  if (singleton && singletonConfigKey === key) {
    return singleton;
  }
  singleton = createHeimdallAuditLogger(config);
  singletonConfigKey = key;
  return singleton;
}

/** Reset singleton (for testing). */
export function __resetAuditLogger(): void {
  singleton = null;
  singletonConfigKey = undefined;
}
