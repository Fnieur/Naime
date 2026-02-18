import { describe, it, expect } from "vitest";
import { isUndiciTlsSessionBug } from "./unhandled-rejections.js";

describe("isUndiciTlsSessionBug", () => {
  it("detects the exact undici TLS setSession crash", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = [
      "TypeError: Cannot read properties of null (reading 'setSession')",
      "    at TLSSocket.setSession (node:_tls_wrap:1132:16)",
      "    at Object.connect (node:_tls_wrap:1826:13)",
      "    at Client.connect (openclaw/node_modules/undici/lib/core/connect.js:70:20)",
      "    at connect (openclaw/node_modules/undici/lib/dispatcher/client.js:452:21)",
      "    at _resume (openclaw/node_modules/undici/lib/dispatcher/client.js:627:7)",
      "    at resume (openclaw/node_modules/undici/lib/dispatcher/client.js:561:3)",
      "    at Client.<computed> (openclaw/node_modules/undici/lib/dispatcher/client.js:285:31)",
      "    at TLSSocket.onHttpSocketClose (openclaw/node_modules/undici/lib/dispatcher/client-h1.js:942:18)",
    ].join("\n");

    expect(isUndiciTlsSessionBug(err)).toBe(true);
  });

  it("detects the crash with varying undici paths (npm global, pnpm, etc.)", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = [
      "TypeError: Cannot read properties of null (reading 'setSession')",
      "    at TLSSocket.setSession (node:_tls_wrap:1132:16)",
      "    at Object.connect (node:_tls_wrap:1826:13)",
      "    at Client.connect (/opt/homebrew/lib/node_modules/openclaw/node_modules/undici/lib/core/connect.js:70:20)",
    ].join("\n");

    expect(isUndiciTlsSessionBug(err)).toBe(true);
  });

  it("rejects non-TypeError errors", () => {
    const err = new Error("Cannot read properties of null (reading 'setSession')");
    err.stack = [
      "Error: Cannot read properties of null (reading 'setSession')",
      "    at TLSSocket.setSession (node:_tls_wrap:1132:16)",
      "    at undici/lib/core/connect.js:70:20",
    ].join("\n");

    expect(isUndiciTlsSessionBug(err)).toBe(false);
  });

  it("rejects TypeErrors with different messages", () => {
    const err = new TypeError("Cannot read properties of null (reading 'write')");
    err.stack = [
      "TypeError: Cannot read properties of null (reading 'write')",
      "    at TLSSocket.write (node:_tls_wrap:500:16)",
      "    at undici/lib/core/connect.js:70:20",
    ].join("\n");

    expect(isUndiciTlsSessionBug(err)).toBe(false);
  });

  it("rejects setSession errors NOT from undici", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = [
      "TypeError: Cannot read properties of null (reading 'setSession')",
      "    at TLSSocket.setSession (node:_tls_wrap:1132:16)",
      "    at myApp/src/tls-client.js:42:10",
    ].join("\n");

    expect(isUndiciTlsSessionBug(err)).toBe(false);
  });

  it("rejects null/undefined/non-error inputs", () => {
    expect(isUndiciTlsSessionBug(null)).toBe(false);
    expect(isUndiciTlsSessionBug(undefined)).toBe(false);
    expect(isUndiciTlsSessionBug("a string")).toBe(false);
    expect(isUndiciTlsSessionBug(42)).toBe(false);
  });

  it("rejects errors with no stack trace", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = undefined;

    expect(isUndiciTlsSessionBug(err)).toBe(false);
  });
});
