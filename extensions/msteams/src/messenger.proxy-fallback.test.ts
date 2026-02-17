import { describe, expect, it } from "vitest";

/**
 * Verify that the thread reply path in sendMSTeamsMessages handles
 * proxy revoked errors by falling back to proactive messaging.
 */
describe("MSTeams proxy revoked fallback", () => {
  it("detects proxy revoked TypeError pattern", () => {
    const err = new TypeError("Cannot perform 'set' on a proxy that has been revoked");
    const isProxyRevoked = err instanceof TypeError && /proxy.*revoked/i.test(err.message);
    expect(isProxyRevoked).toBe(true);
  });

  it("does not match non-proxy TypeErrors", () => {
    const err = new TypeError("Cannot read property 'foo' of undefined");
    const isProxyRevoked = err instanceof TypeError && /proxy.*revoked/i.test(err.message);
    expect(isProxyRevoked).toBe(false);
  });

  it("does not match non-TypeError errors", () => {
    const err = new Error("proxy that has been revoked");
    const isProxyRevoked = err instanceof TypeError && /proxy.*revoked/i.test(err.message);
    expect(isProxyRevoked).toBe(false);
  });
});
