import fs from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROL_UI_BOOTSTRAP_CONFIG_PATH } from "./control-ui-contract.js";
import { handleControlUiHttpRequest } from "./control-ui.js";
import { makeMockHttpResponse } from "./test-http-response.js";

describe("handleControlUiHttpRequest", () => {
  async function withControlUiRoot<T>(params: {
    indexHtml?: string;
    fn: (tmp: string) => Promise<T>;
  }) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ui-"));
    try {
      await fs.writeFile(path.join(tmp, "index.html"), params.indexHtml ?? "<html></html>\n");
      return await params.fn(tmp);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  function parseBootstrapPayload(end: ReturnType<typeof makeMockHttpResponse>["end"]) {
    return JSON.parse(String(end.mock.calls[0]?.[0] ?? "")) as {
      basePath: string;
      assistantName: string;
      assistantAvatar: string;
      assistantAgentId: string;
    };
  }

  it("sets security headers for Control UI responses", async () => {
    await withControlUiRoot({
      fn: async (tmp) => {
        const { res, setHeader } = makeMockHttpResponse();
        const handled = handleControlUiHttpRequest(
          { url: "/", method: "GET" } as IncomingMessage,
          res,
          {
            root: { kind: "resolved", path: tmp },
          },
        );
        expect(handled).toBe(true);
        expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
        const csp = setHeader.mock.calls.find((call) => call[0] === "Content-Security-Policy")?.[1];
        expect(typeof csp).toBe("string");
        expect(String(csp)).toContain("frame-ancestors 'none'");
        expect(String(csp)).toContain("script-src 'self'");
        expect(String(csp)).not.toContain("script-src 'self' 'unsafe-inline'");
      },
    });
  });

  it("does not inject inline scripts into index.html", async () => {
    const html = "<html><head></head><body>Hello</body></html>\n";
    await withControlUiRoot({
      indexHtml: html,
      fn: async (tmp) => {
        const { res, end } = makeMockHttpResponse();
        const handled = handleControlUiHttpRequest(
          { url: "/", method: "GET" } as IncomingMessage,
          res,
          {
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              ui: { assistant: { name: "</script><script>alert(1)//", avatar: "evil.png" } },
            },
          },
        );
        expect(handled).toBe(true);
        expect(end).toHaveBeenCalledWith(html);
      },
    });
  });

  it("serves bootstrap config JSON", async () => {
    await withControlUiRoot({
      fn: async (tmp) => {
        const { res, end } = makeMockHttpResponse();
        const handled = handleControlUiHttpRequest(
          { url: CONTROL_UI_BOOTSTRAP_CONFIG_PATH, method: "GET" } as IncomingMessage,
          res,
          {
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              ui: { assistant: { name: "</script><script>alert(1)//", avatar: "</script>.png" } },
            },
          },
        );
        expect(handled).toBe(true);
        const parsed = parseBootstrapPayload(end);
        expect(parsed.basePath).toBe("");
        expect(parsed.assistantName).toBe("</script><script>alert(1)//");
        expect(parsed.assistantAvatar).toBe("/avatar/main");
        expect(parsed.assistantAgentId).toBe("main");
      },
    });
  });

  it("serves bootstrap config JSON under basePath", async () => {
    await withControlUiRoot({
      fn: async (tmp) => {
        const { res, end } = makeMockHttpResponse();
        const handled = handleControlUiHttpRequest(
          { url: `/openclaw${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`, method: "GET" } as IncomingMessage,
          res,
          {
            basePath: "/openclaw",
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              ui: { assistant: { name: "Ops", avatar: "ops.png" } },
            },
          },
        );
        expect(handled).toBe(true);
        const parsed = parseBootstrapPayload(end);
        expect(parsed.basePath).toBe("/openclaw");
        expect(parsed.assistantName).toBe("Ops");
        expect(parsed.assistantAvatar).toBe("/openclaw/avatar/main");
        expect(parsed.assistantAgentId).toBe("main");
      },
    });
  });

  describe("strictLoopback enforcement", () => {
    it("allows loopback requests when strictLoopback is enabled", async () => {
      await withControlUiRoot({
        fn: async (tmp) => {
          const { res, end } = makeMockHttpResponse();
          const mockReq = {
            url: "/",
            method: "GET",
            socket: { remoteAddress: "127.0.0.1" },
            headers: {},
          } as unknown as IncomingMessage;

          const handled = handleControlUiHttpRequest(mockReq, res, {
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              gateway: { controlUi: { strictLoopback: true } },
            },
          });
          expect(handled).toBe(true);
          // Should serve index.html, not reject with Forbidden
          const firstCallArg = end.mock.calls[0]?.[0];
          expect(firstCallArg).not.toContain("Forbidden");
        },
      });
    });

    it("blocks non-loopback requests when strictLoopback is enabled", async () => {
      await withControlUiRoot({
        fn: async (tmp) => {
          const { res, end } = makeMockHttpResponse();
          const mockReq = {
            url: "/",
            method: "GET",
            socket: { remoteAddress: "192.168.1.100" },
            headers: {},
          } as unknown as IncomingMessage;

          const handled = handleControlUiHttpRequest(mockReq, res, {
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              gateway: { controlUi: { strictLoopback: true } },
            },
            trustedProxies: [],
          });
          expect(handled).toBe(true);
          expect(res.statusCode).toBe(403);
          expect(end).toHaveBeenCalledWith("Forbidden: Access restricted to loopback addresses only");
        },
      });
    });

    it("allows non-loopback requests when strictLoopback is disabled", async () => {
      await withControlUiRoot({
        fn: async (tmp) => {
          const { res } = makeMockHttpResponse();
          const mockReq = {
            url: "/",
            method: "GET",
            socket: { remoteAddress: "192.168.1.100" },
            headers: {},
          } as unknown as IncomingMessage;

          const handled = handleControlUiHttpRequest(mockReq, res, {
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              gateway: { controlUi: { strictLoopback: false } },
            },
            trustedProxies: [],
          });
          expect(handled).toBe(true);
          // Should not be rejected - status should not be 403
          expect(res.statusCode).not.toBe(403);
        },
      });
    });

    it("allows IPv6 loopback (::1) when strictLoopback is enabled", async () => {
      await withControlUiRoot({
        fn: async (tmp) => {
          const { res } = makeMockHttpResponse();
          const mockReq = {
            url: "/",
            method: "GET",
            socket: { remoteAddress: "::1" },
            headers: {},
          } as unknown as IncomingMessage;

          const handled = handleControlUiHttpRequest(mockReq, res, {
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              gateway: { controlUi: { strictLoopback: true } },
            },
            trustedProxies: [],
          });
          expect(handled).toBe(true);
          expect(res.statusCode).not.toBe(403);
        },
      });
    });

    it("respects x-forwarded-for header with trusted proxies", async () => {
      await withControlUiRoot({
        fn: async (tmp) => {
          const { res, end } = makeMockHttpResponse();
          const mockReq = {
            url: "/",
            method: "GET",
            socket: { remoteAddress: "10.0.0.1" }, // trusted proxy IP
            headers: { "x-forwarded-for": "8.8.8.8" }, // non-loopback client
          } as unknown as IncomingMessage;

          const handled = handleControlUiHttpRequest(mockReq, res, {
            root: { kind: "resolved", path: tmp },
            config: {
              agents: { defaults: { workspace: tmp } },
              gateway: { controlUi: { strictLoopback: true } },
            },
            trustedProxies: ["10.0.0.1"],
          });
          expect(handled).toBe(true);
          expect(res.statusCode).toBe(403); // Blocked because forwarded client is not loopback
          expect(end).toHaveBeenCalledWith("Forbidden: Access restricted to loopback addresses only");
        },
      });
    });
  });
});
