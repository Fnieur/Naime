/**
 * secret-agent provider for OpenClaw.
 *
 * Shells out to the `secret-agent` CLI to resolve secrets.
 * Secrets never enter the Node.js process memory beyond the moment
 * they are returned to the caller — the vault handles encryption at rest
 * and the CLI handles decryption.
 *
 * Install: `cargo install secret-agent` or download from
 * https://github.com/paperMoose/secret-agent
 */

import { execFile } from "node:child_process";
import { type SecretProvider } from "./secret-resolution.js";

export interface SecretAgentProviderConfig {
  /** Optional bucket prefix for organizing secrets (e.g. "prod", "dev"). */
  bucket?: string;
  /** Path to the secret-agent binary. Defaults to "secret-agent" (resolved via $PATH). */
  binaryPath?: string;
  /** Cache TTL in seconds. Defaults to 300 (5 minutes). */
  cacheTtlSeconds?: number;
}

type CacheEntry = { value: string; expiresAt: number };
const localCache = new Map<string, CacheEntry>();

/** Clear the provider-level cache (for testing). */
export function clearSecretAgentCache(): void {
  localCache.clear();
}

/**
 * Run a secret-agent CLI command and return stdout.
 * Rejects if the process exits non-zero.
 */
function run(
  bin: string,
  args: string[],
  stdin?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.trim() || err.message;
        reject(new Error(`secret-agent ${args[0]} failed: ${msg}`));
        return;
      }
      resolve(stdout);
    });
    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

export class SecretAgentProvider implements SecretProvider {
  // Provider name must be lowercase alpha only to match SECRET_REF_PATTERN ([a-z]+)
  public readonly name = "secretagent";
  private readonly bucket?: string;
  private readonly bin: string;
  private readonly cacheTtlMs: number;

  constructor(config: SecretAgentProviderConfig = {}) {
    this.bucket = config.bucket;
    this.bin = config.binaryPath ?? "secret-agent";
    this.cacheTtlMs = (config.cacheTtlSeconds ?? 300) * 1000;
  }

  /** Build the full secret name with optional bucket prefix. */
  private fullName(name: string): string {
    if (this.bucket && !name.includes("/")) {
      return `${this.bucket}/${name}`;
    }
    return name;
  }

  /** Extract the env var name (strip bucket prefix if present). */
  private envVarName(name: string): string {
    const slash = name.lastIndexOf("/");
    return slash >= 0 ? name.slice(slash + 1) : name;
  }

  async getSecret(name: string, _version?: string): Promise<string> {
    const fullName = this.fullName(name);
    const envVar = this.envVarName(fullName);
    const cacheKey = `secretagent:${fullName}`;
    const cached = localCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Use exec + printenv to get the secret value without --unsafe-display.
    // This keeps the value out of CLI argument lists visible in `ps`.
    // secret-agent strips the bucket prefix for env vars, so we use envVar for printenv.
    const value = (await run(this.bin, ["exec", "--env", fullName, "--quiet", "printenv", envVar])).trimEnd();

    if (!value) {
      throw new Error(`Secret '${fullName}' not found or empty`);
    }

    localCache.set(cacheKey, { value, expiresAt: Date.now() + this.cacheTtlMs });
    return value;
  }

  async setSecret(name: string, value: string): Promise<void> {
    const fullName = this.fullName(name);
    try {
      await run(this.bin, ["import", fullName, "--replace"], value);
    } catch {
      // Secret may not exist yet — try without --replace
      await run(this.bin, ["import", fullName], value);
    }
  }

  async listSecrets(): Promise<string[]> {
    const args = ["list", "--quiet"];
    if (this.bucket) {
      args.push("--bucket", this.bucket);
    }
    const output = await run(this.bin, args);
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await run(this.bin, ["list", "--quiet"]);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
