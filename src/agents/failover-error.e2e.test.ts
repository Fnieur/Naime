import { describe, expect, it } from "vitest";
import {
  coerceToFailoverError,
  describeFailoverError,
  isTimeoutError,
  resolveFailoverReasonFromError,
} from "./failover-error.js";

describe("failover-error", () => {
  it("infers failover reason from HTTP status", () => {
    expect(resolveFailoverReasonFromError({ status: 402 })).toBe("billing");
    expect(resolveFailoverReasonFromError({ statusCode: "429" })).toBe("rate_limit");
    expect(resolveFailoverReasonFromError({ status: 403 })).toBe("auth");
    expect(resolveFailoverReasonFromError({ status: 408 })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ status: 400 })).toBe("format");
  });

  it("infers format errors from error messages", () => {
    expect(
      resolveFailoverReasonFromError({
        message: "invalid request format: messages.1.content.1.tool_use.id",
      }),
    ).toBe("format");
  });

  it("infers timeout from common node error codes", () => {
    expect(resolveFailoverReasonFromError({ code: "ETIMEDOUT" })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ code: "ECONNRESET" })).toBe("timeout");
  });

  it("infers network errors from connectivity error codes", () => {
    expect(resolveFailoverReasonFromError({ code: "ENETUNREACH" })).toBe("network");
    expect(resolveFailoverReasonFromError({ code: "EHOSTUNREACH" })).toBe("network");
    expect(resolveFailoverReasonFromError({ code: "ENOTFOUND" })).toBe("network");
    expect(resolveFailoverReasonFromError({ code: "EAI_AGAIN" })).toBe("network");
    expect(resolveFailoverReasonFromError({ code: "ECONNREFUSED" })).toBe("network");
  });

  it("infers network errors from error messages", () => {
    expect(resolveFailoverReasonFromError({ message: "network unreachable" })).toBe("network");
    expect(resolveFailoverReasonFromError({ message: "connection refused" })).toBe("network");
    expect(
      resolveFailoverReasonFromError({ message: "getaddrinfo ENOTFOUND api.example.com" }),
    ).toBe("network");
    expect(resolveFailoverReasonFromError({ message: "fetch failed" })).toBe("network");
  });

  it("infers timeout from abort stop-reason messages", () => {
    expect(resolveFailoverReasonFromError({ message: "Unhandled stop reason: abort" })).toBe(
      "timeout",
    );
    expect(resolveFailoverReasonFromError({ message: "stop reason: abort" })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ message: "reason: abort" })).toBe("timeout");
  });

  it("treats AbortError reason=abort as timeout", () => {
    const err = Object.assign(new Error("aborted"), {
      name: "AbortError",
      reason: "reason: abort",
    });
    expect(isTimeoutError(err)).toBe(true);
  });

  it("coerces failover-worthy errors into FailoverError with metadata", () => {
    const err = coerceToFailoverError("credit balance too low", {
      provider: "anthropic",
      model: "claude-opus-4-5",
    });
    expect(err?.name).toBe("FailoverError");
    expect(err?.reason).toBe("billing");
    expect(err?.status).toBe(402);
    expect(err?.provider).toBe("anthropic");
    expect(err?.model).toBe("claude-opus-4-5");
  });

  it("coerces format errors with a 400 status", () => {
    const err = coerceToFailoverError("invalid request format", {
      provider: "google",
      model: "cloud-code-assist",
    });
    expect(err?.reason).toBe("format");
    expect(err?.status).toBe(400);
  });

  it("coerces network errors with a 503 status", () => {
    const err = coerceToFailoverError(
      { code: "ENETUNREACH", message: "network unreachable" },
      {
        provider: "anthropic",
        model: "claude-opus-4-5",
      },
    );
    expect(err?.reason).toBe("network");
    expect(err?.status).toBe(503);
    expect(err?.code).toBe("ENETUNREACH");
  });

  it("describes non-Error values consistently", () => {
    const described = describeFailoverError(123);
    expect(described.message).toBe("123");
    expect(described.reason).toBeUndefined();
  });
});
