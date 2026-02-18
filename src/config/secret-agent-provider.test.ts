/**
 * Tests for secret-agent provider.
 *
 * All tests mock child_process.execFile — no real secret-agent binary needed.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { clearSecretCache, type SecretProvider } from "./secret-resolution.js";

// ---------------------------------------------------------------------------
// Mock child_process.execFile
// ---------------------------------------------------------------------------

const mockExecFile = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: Error | null, stdout: string, stderr: string) => void;
    const bin = args[0] as string;
    const cliArgs = args[1] as string[];
    const result = mockExecFile(bin, cliArgs);

    if (result instanceof Error) {
      cb(result, "", result.message);
    } else {
      cb(null, result as string, "");
    }

    // Return a mock child with a writable stdin
    return {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
    };
  },
}));

// Import after mocks
import { SecretAgentProvider, clearSecretAgentCache } from "./secret-agent-provider.js";

beforeEach(() => {
  clearSecretCache();
  clearSecretAgentCache();
  mockExecFile.mockReset();
});

// ===========================================================================
// Construction
// ===========================================================================

describe("SecretAgentProvider — construction", () => {
  it("sets name to 'secret-agent'", () => {
    const provider = new SecretAgentProvider();
    expect(provider.name).toBe("secretagent");
  });

  it("accepts empty config", () => {
    const provider = new SecretAgentProvider({});
    expect(provider).toBeDefined();
  });

  it("accepts bucket and binaryPath config", () => {
    const provider = new SecretAgentProvider({
      bucket: "prod",
      binaryPath: "/usr/local/bin/secret-agent",
      cacheTtlSeconds: 600,
    });
    expect(provider).toBeDefined();
  });
});

// ===========================================================================
// getSecret
// ===========================================================================

describe("SecretAgentProvider — getSecret", () => {
  it("fetches a secret by name", async () => {
    mockExecFile.mockReturnValueOnce("my-secret-value\n");
    const provider = new SecretAgentProvider();
    const value = await provider.getSecret("API_KEY");
    expect(value).toBe("my-secret-value");
    expect(mockExecFile).toHaveBeenCalledWith("secret-agent", [
      "exec", "--env", "API_KEY", "--quiet", "printenv", "API_KEY",
    ]);
  });

  it("prepends bucket prefix when configured", async () => {
    mockExecFile.mockReturnValueOnce("prod-value\n");
    const provider = new SecretAgentProvider({ bucket: "prod" });
    const value = await provider.getSecret("API_KEY");
    expect(value).toBe("prod-value");
    expect(mockExecFile).toHaveBeenCalledWith("secret-agent", [
      "exec", "--env", "prod/API_KEY", "--quiet", "printenv", "API_KEY",
    ]);
  });

  it("does not double-prefix if name already has a bucket", async () => {
    mockExecFile.mockReturnValueOnce("value\n");
    const provider = new SecretAgentProvider({ bucket: "prod" });
    await provider.getSecret("staging/API_KEY");
    // secret-agent strips bucket prefix for env vars, so printenv gets just "API_KEY"
    expect(mockExecFile).toHaveBeenCalledWith("secret-agent", [
      "exec", "--env", "staging/API_KEY", "--quiet", "printenv", "API_KEY",
    ]);
  });

  it("uses custom binary path", async () => {
    mockExecFile.mockReturnValueOnce("val\n");
    const provider = new SecretAgentProvider({ binaryPath: "/opt/bin/sa" });
    await provider.getSecret("KEY");
    expect(mockExecFile.mock.calls[0][0]).toBe("/opt/bin/sa");
  });

  it("throws when secret is not found", async () => {
    mockExecFile.mockReturnValueOnce(new Error("secret not found"));
    const provider = new SecretAgentProvider();
    await expect(provider.getSecret("MISSING")).rejects.toThrow(/failed/i);
  });

  it("throws when secret value is empty", async () => {
    mockExecFile.mockReturnValueOnce("\n");
    const provider = new SecretAgentProvider();
    await expect(provider.getSecret("EMPTY")).rejects.toThrow(/not found or empty/i);
  });

  it("caches secret values", async () => {
    mockExecFile.mockReturnValueOnce("cached-val\n");
    const provider = new SecretAgentProvider({ cacheTtlSeconds: 300 });
    const v1 = await provider.getSecret("CACHED");
    const v2 = await provider.getSecret("CACHED");
    expect(v1).toBe("cached-val");
    expect(v2).toBe("cached-val");
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// setSecret
// ===========================================================================

describe("SecretAgentProvider — setSecret", () => {
  it("imports a secret value", async () => {
    mockExecFile.mockReturnValueOnce("");
    const provider = new SecretAgentProvider();
    await provider.setSecret("NEW_KEY", "new-value");
    expect(mockExecFile).toHaveBeenCalledWith("secret-agent", ["import", "NEW_KEY", "--replace"]);
  });

  it("falls back to import without --replace if first attempt fails", async () => {
    mockExecFile
      .mockReturnValueOnce(new Error("no such secret"))
      .mockReturnValueOnce("");
    const provider = new SecretAgentProvider();
    await provider.setSecret("BRAND_NEW", "value");
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockExecFile.mock.calls[1][1]).toEqual(["import", "BRAND_NEW"]);
  });

  it("prepends bucket prefix", async () => {
    mockExecFile.mockReturnValueOnce("");
    const provider = new SecretAgentProvider({ bucket: "prod" });
    await provider.setSecret("DB_PASS", "password");
    expect(mockExecFile).toHaveBeenCalledWith("secret-agent", ["import", "prod/DB_PASS", "--replace"]);
  });
});

// ===========================================================================
// listSecrets
// ===========================================================================

describe("SecretAgentProvider — listSecrets", () => {
  it("lists secrets", async () => {
    mockExecFile.mockReturnValueOnce("API_KEY\nDB_PASS\nSTRIPE_KEY\n");
    const provider = new SecretAgentProvider();
    const names = await provider.listSecrets();
    expect(names).toEqual(["API_KEY", "DB_PASS", "STRIPE_KEY"]);
  });

  it("passes bucket filter when configured", async () => {
    mockExecFile.mockReturnValueOnce("API_KEY\n");
    const provider = new SecretAgentProvider({ bucket: "prod" });
    await provider.listSecrets();
    expect(mockExecFile).toHaveBeenCalledWith("secret-agent", ["list", "--quiet", "--bucket", "prod"]);
  });

  it("returns empty array when no secrets", async () => {
    mockExecFile.mockReturnValueOnce("");
    const provider = new SecretAgentProvider();
    const names = await provider.listSecrets();
    expect(names).toEqual([]);
  });
});

// ===========================================================================
// testConnection
// ===========================================================================

describe("SecretAgentProvider — testConnection", () => {
  it("returns ok when binary is available", async () => {
    mockExecFile.mockReturnValueOnce("");
    const provider = new SecretAgentProvider();
    const result = await provider.testConnection();
    expect(result).toEqual({ ok: true });
  });

  it("returns error when binary is not found", async () => {
    mockExecFile.mockReturnValueOnce(new Error("command not found: secret-agent"));
    const provider = new SecretAgentProvider();
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("secret-agent");
  });
});

// ===========================================================================
// Integration with secret-resolution
// ===========================================================================

describe("SecretAgentProvider — integration with resolveConfigSecrets", () => {
  it("resolves ${secretagent:NAME} references", async () => {
    mockExecFile.mockReturnValue("resolved-value\n");
    const { resolveConfigSecrets } = await import("./secret-resolution.js");
    const provider = new SecretAgentProvider();
    const providers = new Map<string, SecretProvider>([["secretagent", provider]]);
    const config = { apiKey: "${secretagent:ANTHROPIC_KEY}" };
    const result = await resolveConfigSecrets(config, undefined, providers);
    expect(result).toEqual({ apiKey: "resolved-value" });
  });

  it("resolves multiple references in the same config", async () => {
    mockExecFile
      .mockReturnValueOnce("key-1\n")
      .mockReturnValueOnce("key-2\n");
    const { resolveConfigSecrets } = await import("./secret-resolution.js");
    const provider = new SecretAgentProvider();
    const providers = new Map<string, SecretProvider>([["secretagent", provider]]);
    const config = {
      openai: "${secretagent:OPENAI_KEY}",
      anthropic: "${secretagent:ANTHROPIC_KEY}",
    };
    const result = await resolveConfigSecrets(config, undefined, providers);
    expect(result).toEqual({ openai: "key-1", anthropic: "key-2" });
  });
});
