import { describe, expect, it } from "vitest";
import { isPrivateIp, SsrfError, validateUrl } from "./ssrf-guard.js";

describe("ssrf-guard", () => {
  describe("isPrivateIp", () => {
    it.each([
      ["10.0.0.1", true],
      ["10.255.255.255", true],
      ["172.16.0.1", true],
      ["172.31.255.255", true],
      ["172.15.0.1", false],
      ["172.32.0.1", false],
      ["192.168.0.1", true],
      ["192.168.255.255", true],
      ["127.0.0.1", true],
      ["127.0.0.2", true],
      ["169.254.0.1", true],
      ["169.254.169.254", true],
      ["0.0.0.0", true],
      ["8.8.8.8", false],
      ["1.1.1.1", false],
      ["93.184.216.34", false],
      ["::1", true],
      ["fc00::1", true],
      ["fd00::1", true],
      ["fe80::1", true],
      ["::", true],
      ["", true],
    ])("isPrivateIp(%s) = %s", (ip, expected) => {
      expect(isPrivateIp(ip)).toBe(expected);
    });
  });

  describe("validateUrl", () => {
    it("rejects non-HTTP protocols", async () => {
      await expect(validateUrl("file:///etc/passwd")).rejects.toThrow(SsrfError);
      await expect(validateUrl("ftp://example.com/file")).rejects.toThrow(SsrfError);
      await expect(validateUrl("gopher://example.com")).rejects.toThrow(SsrfError);
    });

    it("rejects invalid URLs", async () => {
      await expect(validateUrl("not-a-url")).rejects.toThrow(SsrfError);
      await expect(validateUrl("")).rejects.toThrow(SsrfError);
    });

    it("rejects private IP literals", async () => {
      await expect(validateUrl("http://10.0.0.1/admin")).rejects.toThrow(SsrfError);
      await expect(validateUrl("http://192.168.1.1/")).rejects.toThrow(SsrfError);
      await expect(validateUrl("http://127.0.0.1:8080/")).rejects.toThrow(SsrfError);
      await expect(validateUrl("http://[::1]/")).rejects.toThrow(SsrfError);
    });

    it("rejects cloud metadata endpoints", async () => {
      await expect(validateUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
        SsrfError,
      );
    });

    it("allows legitimate public URLs", async () => {
      // These may fail in CI without DNS, but the point is they don't throw SsrfError
      // for protocol/IP checks
      await expect(validateUrl("https://example.com")).resolves.toBeUndefined();
    });
  });
});
