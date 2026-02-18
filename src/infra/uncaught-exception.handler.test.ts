import process from "node:process";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { installUncaughtExceptionHandler } from "./unhandled-rejections.js";

describe("installUncaughtExceptionHandler", () => {
  let exitCalls: Array<string | number | null> = [];
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let originalExit: typeof process.exit;
  let cleanup: () => void;

  beforeAll(() => {
    originalExit = process.exit.bind(process);
    cleanup = installUncaughtExceptionHandler();
  });

  beforeEach(() => {
    exitCalls = [];

    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null): never => {
      if (code !== undefined && code !== null) {
        exitCalls.push(code);
      }
      return undefined as never;
    });

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  afterAll(() => {
    cleanup();
    process.exit = originalExit;
  });

  it("suppresses the undici TLS setSession crash without exiting", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = [
      "TypeError: Cannot read properties of null (reading 'setSession')",
      "    at TLSSocket.setSession (node:_tls_wrap:1132:16)",
      "    at Object.connect (node:_tls_wrap:1826:13)",
      "    at Client.connect (undici/lib/core/connect.js:70:20)",
      "    at connect (undici/lib/dispatcher/client.js:452:21)",
      "    at _resume (undici/lib/dispatcher/client.js:627:7)",
    ].join("\n");

    process.emit("uncaughtException", err, "uncaughtException");

    expect(exitCalls).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[openclaw] Suppressed undici TLS session bug (non-fatal):",
      expect.stringContaining("setSession"),
    );
  });

  it("still exits on unknown uncaught exceptions", () => {
    const err = new Error("Something completely unexpected");

    process.emit("uncaughtException", err, "uncaughtException");

    expect(exitCalls).toEqual([1]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[openclaw] Uncaught exception:",
      expect.stringContaining("Something completely unexpected"),
    );
  });

  it("still exits on TypeErrors that are NOT the TLS bug", () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'foo')");

    process.emit("uncaughtException", err, "uncaughtException");

    expect(exitCalls).toEqual([1]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[openclaw] Uncaught exception:",
      expect.stringContaining("foo"),
    );
  });

  it("does not register duplicate handlers on repeated calls", () => {
    const secondCleanup = installUncaughtExceptionHandler();

    const err = new Error("Single fire test");
    process.emit("uncaughtException", err, "uncaughtException");

    // Should only fire once (one exit call), not twice
    expect(exitCalls).toEqual([1]);

    secondCleanup();
  });
});
