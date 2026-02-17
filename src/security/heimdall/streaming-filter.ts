/**
 * Heimdall Streaming Filter — wraps onBlockReply to redact secrets.
 *
 * Each chunk is scanned and redacted independently. Additionally, the tail
 * of the previous chunk is retained and re-scanned together with the current
 * chunk to detect secrets that span chunk boundaries. When a cross-boundary
 * secret is detected, it is logged as an audit event.
 *
 * For complete coverage the batch filter (apply-filter.ts) should be applied
 * to the final assembled response.
 */

import type { HeimdallConfig } from "./types.js";
import { getHeimdallAuditLogger } from "./audit.js";
import { redactOutput } from "./output-filter.js";

/**
 * Number of characters retained from the previous chunk's tail to detect
 * secrets that span chunk boundaries. Must be >= the longest pattern's
 * minimum match length (currently ~50 for Bearer tokens).
 */
const OVERLAP_SIZE = 64;

export interface StreamingPayload {
  text?: string;
  [key: string]: unknown;
}

type BlockReplyFn<T, C> = (payload: T, context?: C) => Promise<void> | void;

/**
 * Wraps an onBlockReply callback to apply output redaction before delivery.
 * Returns the original callback unchanged when Heimdall is disabled.
 */
export function wrapBlockReplyWithFilter<T extends StreamingPayload, C = unknown>(
  onBlockReply: BlockReplyFn<T, C>,
  config?: HeimdallConfig,
): BlockReplyFn<T, C> {
  if (!config?.enabled || config.outputFilter?.enabled === false) {
    return onBlockReply;
  }

  const auditLogger = getHeimdallAuditLogger(config.audit);
  let prevTail = "";

  return (payload: T, context?: C) => {
    if (!payload.text) {
      return onBlockReply(payload, context);
    }

    // Scan current chunk independently.
    const { redacted, matches } = redactOutput(payload.text, config.outputFilter);

    if (matches.length > 0) {
      auditLogger.logRedaction({
        patterns: matches.map((m) => m.pattern),
        totalMatches: matches.reduce((sum, m) => sum + m.count, 0),
      });
    }

    // Cross-boundary detection: scan combined text (prev tail + current) to
    // catch secrets split across chunks. This cannot retroactively redact the
    // partial prefix delivered in the previous chunk, but it logs the event
    // for audit and alerting. The batch filter (apply-filter.ts) provides
    // complete redaction on the final assembled response.
    if (prevTail) {
      const combined = prevTail + payload.text;
      const { matches: combinedMatches } = redactOutput(combined, config.outputFilter);
      if (combinedMatches.length > matches.length) {
        auditLogger.logRedaction({
          patterns: combinedMatches.map((m) => m.pattern),
          totalMatches: combinedMatches.reduce((sum, m) => sum + m.count, 0),
          crossChunk: true,
        });
      }
    }

    // Update overlap tail for next chunk.
    prevTail =
      payload.text.length >= OVERLAP_SIZE ? payload.text.slice(-OVERLAP_SIZE) : payload.text;

    if (redacted === payload.text) {
      return onBlockReply(payload, context);
    }

    return onBlockReply({ ...payload, text: redacted }, context);
  };
}
