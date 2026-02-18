import process from "node:process";
import { extractErrorCode, formatUncaughtError } from "./errors.js";

type UnhandledRejectionHandler = (reason: unknown) => boolean;

const handlers = new Set<UnhandledRejectionHandler>();

const FATAL_ERROR_CODES = new Set([
  "ERR_OUT_OF_MEMORY",
  "ERR_SCRIPT_EXECUTION_TIMEOUT",
  "ERR_WORKER_OUT_OF_MEMORY",
  "ERR_WORKER_UNCAUGHT_EXCEPTION",
  "ERR_WORKER_INITIALIZATION_FAILED",
]);

const CONFIG_ERROR_CODES = new Set(["INVALID_CONFIG", "MISSING_API_KEY", "MISSING_CREDENTIALS"]);

// Network error codes that indicate transient failures (shouldn't crash the gateway)
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_DNS_RESOLVE_FAILED",
  "UND_ERR_CONNECT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function getErrorCause(err: unknown): unknown {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  return (err as { cause?: unknown }).cause;
}

function extractErrorCodeWithCause(err: unknown): string | undefined {
  const direct = extractErrorCode(err);
  if (direct) {
    return direct;
  }
  return extractErrorCode(getErrorCause(err));
}

/**
 * Checks if an error is an AbortError.
 * These are typically intentional cancellations (e.g., during shutdown) and shouldn't crash.
 */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const name = "name" in err ? String(err.name) : "";
  if (name === "AbortError") {
    return true;
  }
  // Check for "This operation was aborted" message from Node's undici
  const message = "message" in err && typeof err.message === "string" ? err.message : "";
  if (message === "This operation was aborted") {
    return true;
  }
  return false;
}

function isFatalError(err: unknown): boolean {
  const code = extractErrorCodeWithCause(err);
  return code !== undefined && FATAL_ERROR_CODES.has(code);
}

function isConfigError(err: unknown): boolean {
  const code = extractErrorCodeWithCause(err);
  return code !== undefined && CONFIG_ERROR_CODES.has(code);
}

/**
 * Checks if an error is a transient network error that shouldn't crash the gateway.
 * These are typically temporary connectivity issues that will resolve on their own.
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (!err) {
    return false;
  }

  const code = extractErrorCodeWithCause(err);
  if (code && TRANSIENT_NETWORK_CODES.has(code)) {
    return true;
  }

  // "fetch failed" TypeError from undici (Node's native fetch)
  if (err instanceof TypeError && err.message === "fetch failed") {
    const cause = getErrorCause(err);
    if (cause) {
      return isTransientNetworkError(cause);
    }
    return true;
  }

  // Check the cause chain recursively
  const cause = getErrorCause(err);
  if (cause && cause !== err) {
    return isTransientNetworkError(cause);
  }

  // AggregateError may wrap multiple causes
  if (err instanceof AggregateError && err.errors?.length) {
    return err.errors.some((e) => isTransientNetworkError(e));
  }

  return false;
}

export function registerUnhandledRejectionHandler(handler: UnhandledRejectionHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function isUnhandledRejectionHandled(reason: unknown): boolean {
  for (const handler of handlers) {
    try {
      if (handler(reason)) {
        return true;
      }
    } catch (err) {
      console.error(
        "[openclaw] Unhandled rejection handler failed:",
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
    }
  }
  return false;
}

/**
 * Detects the known undici TLS session resumption bug where `TLSSocket.setSession`
 * is called after the socket handle has been destroyed, causing a synchronous
 * TypeError that bypasses all try/catch and Promise rejection handlers.
 *
 * This is a race condition in undici's connection pool: when a TLS socket closes,
 * undici immediately tries to reconnect in the same tick via `_resume()`. During
 * `tls.connect()`, it passes a cached session to the new socket, but the internal
 * `_handle` is already null — causing `this._handle.setSession(session)` to throw.
 *
 * The error is safe to suppress because:
 * - The socket was already closing (no in-flight data is lost)
 * - undici will create a fresh connection on the next request
 * - No application state is corrupted
 *
 * Tracked upstream:
 * - https://github.com/nodejs/undici/issues/3869
 * - https://github.com/openclaw/openclaw/issues/16206
 *
 * @see https://github.com/nodejs/node/blob/main/lib/_tls_wrap.js (TLSSocket.setSession)
 */
export function isUndiciTlsSessionBug(err: unknown): boolean {
  if (!(err instanceof TypeError)) {
    return false;
  }

  const message = err.message || "";
  if (!message.includes("reading 'setSession'")) {
    return false;
  }

  const stack = err.stack || "";
  return stack.includes("TLSSocket.setSession") && stack.includes("undici");
}

/**
 * The handler function reference, used for deregistration in tests.
 * @internal Exported for test cleanup only.
 */
export let _uncaughtExceptionHandler: ((error: Error) => void) | null = null;

/**
 * Installs a global `uncaughtException` handler that suppresses known transient
 * errors (like the undici TLS session bug) instead of crashing the process.
 *
 * Unknown exceptions still trigger `process.exit(1)` to preserve crash semantics
 * for genuinely unexpected errors.
 *
 * Safe to call multiple times — only the first call registers a listener.
 *
 * @returns A cleanup function that removes the listener (primarily for tests).
 */
export function installUncaughtExceptionHandler(): () => void {
  if (_uncaughtExceptionHandler) {
    return () => {
      /* already installed, no-op cleanup */
    };
  }

  const handler = (error: Error): void => {
    if (isUndiciTlsSessionBug(error)) {
      console.warn(
        "[openclaw] Suppressed undici TLS session bug (non-fatal):",
        formatUncaughtError(error),
      );
      return;
    }

    console.error("[openclaw] Uncaught exception:", formatUncaughtError(error));
    process.exit(1);
  };

  _uncaughtExceptionHandler = handler;
  process.on("uncaughtException", handler);

  return () => {
    process.removeListener("uncaughtException", handler);
    _uncaughtExceptionHandler = null;
  };
}

export function installUnhandledRejectionHandler(): void {
  process.on("unhandledRejection", (reason, _promise) => {
    if (isUnhandledRejectionHandled(reason)) {
      return;
    }

    // AbortError is typically an intentional cancellation (e.g., during shutdown)
    // Log it but don't crash - these are expected during graceful shutdown
    if (isAbortError(reason)) {
      console.warn("[openclaw] Suppressed AbortError:", formatUncaughtError(reason));
      return;
    }

    if (isFatalError(reason)) {
      console.error("[openclaw] FATAL unhandled rejection:", formatUncaughtError(reason));
      process.exit(1);
      return;
    }

    if (isConfigError(reason)) {
      console.error("[openclaw] CONFIGURATION ERROR - requires fix:", formatUncaughtError(reason));
      process.exit(1);
      return;
    }

    if (isTransientNetworkError(reason)) {
      console.warn(
        "[openclaw] Non-fatal unhandled rejection (continuing):",
        formatUncaughtError(reason),
      );
      return;
    }

    console.error("[openclaw] Unhandled promise rejection:", formatUncaughtError(reason));
    process.exit(1);
  });
}
