import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { splitArgsPreservingQuotes } from "./arg-split.js";
import { buildSystemdUnit, parseSystemdExecStart } from "./systemd-unit.js";
import {
  isSystemdUserServiceAvailable,
  parseSystemdShow,
  resolveSystemdUserUnitPath,
} from "./systemd.js";

describe("systemd availability", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("returns true when systemctl --user succeeds", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, "", "");
    });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(true);
  });

  it("returns false when systemd user bus is unavailable", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const err = new Error("Failed to connect to bus") as Error & {
        stderr?: string;
        code?: number;
      };
      err.stderr = "Failed to connect to bus";
      err.code = 1;
      cb(err, "", "");
    });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(false);
  });
});

describe("systemd runtime parsing", () => {
  it("parses active state details", () => {
    const output = [
      "ActiveState=inactive",
      "SubState=dead",
      "MainPID=0",
      "ExecMainStatus=2",
      "ExecMainCode=exited",
    ].join("\n");
    expect(parseSystemdShow(output)).toEqual({
      activeState: "inactive",
      subState: "dead",
      execMainStatus: 2,
      execMainCode: "exited",
    });
  });
});

describe("resolveSystemdUserUnitPath", () => {
  it("uses default service name when OPENCLAW_PROFILE is unset", () => {
    const env = { HOME: "/home/test" };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/openclaw-gateway.service",
    );
  });

  it("uses profile-specific service name when OPENCLAW_PROFILE is set to a custom value", () => {
    const env = { HOME: "/home/test", OPENCLAW_PROFILE: "jbphoenix" };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/openclaw-gateway-jbphoenix.service",
    );
  });

  it("prefers OPENCLAW_SYSTEMD_UNIT over OPENCLAW_PROFILE", () => {
    const env = {
      HOME: "/home/test",
      OPENCLAW_PROFILE: "jbphoenix",
      OPENCLAW_SYSTEMD_UNIT: "custom-unit",
    };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/custom-unit.service",
    );
  });

  it("handles OPENCLAW_SYSTEMD_UNIT with .service suffix", () => {
    const env = {
      HOME: "/home/test",
      OPENCLAW_SYSTEMD_UNIT: "custom-unit.service",
    };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/custom-unit.service",
    );
  });

  it("trims whitespace from OPENCLAW_SYSTEMD_UNIT", () => {
    const env = {
      HOME: "/home/test",
      OPENCLAW_SYSTEMD_UNIT: "  custom-unit  ",
    };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/custom-unit.service",
    );
  });
});

describe("splitArgsPreservingQuotes", () => {
  it("splits on whitespace outside quotes", () => {
    expect(splitArgsPreservingQuotes('/usr/bin/openclaw gateway start --name "My Bot"')).toEqual([
      "/usr/bin/openclaw",
      "gateway",
      "start",
      "--name",
      "My Bot",
    ]);
  });

  it("supports systemd-style backslash escaping", () => {
    expect(
      splitArgsPreservingQuotes('openclaw --name "My \\"Bot\\"" --foo bar', {
        escapeMode: "backslash",
      }),
    ).toEqual(["openclaw", "--name", 'My "Bot"', "--foo", "bar"]);
  });

  it("supports schtasks-style escaped quotes while preserving other backslashes", () => {
    expect(
      splitArgsPreservingQuotes('openclaw --path "C:\\\\Program Files\\\\OpenClaw"', {
        escapeMode: "backslash-quote-only",
      }),
    ).toEqual(["openclaw", "--path", "C:\\\\Program Files\\\\OpenClaw"]);

    expect(
      splitArgsPreservingQuotes('openclaw --label "My \\"Quoted\\" Name"', {
        escapeMode: "backslash-quote-only",
      }),
    ).toEqual(["openclaw", "--label", 'My "Quoted" Name']);
  });
});

describe("parseSystemdExecStart", () => {
  it("preserves quoted arguments", () => {
    const execStart = '/usr/bin/openclaw gateway start --name "My Bot"';
    expect(parseSystemdExecStart(execStart)).toEqual([
      "/usr/bin/openclaw",
      "gateway",
      "start",
      "--name",
      "My Bot",
    ]);
  });
});

describe("buildSystemdUnit", () => {
  it("omits notify/watchdog directives by default", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
    });
    expect(unit).not.toContain("Type=notify");
    expect(unit).not.toContain("NotifyAccess=all");
    expect(unit).not.toContain("WatchdogSec=90");
  });

  it("includes Type=notify when watchdog is enabled", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    expect(unit).toContain("Type=notify");
  });

  it("includes NotifyAccess=all when watchdog is enabled", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    expect(unit).toContain("NotifyAccess=all");
  });

  it("includes WatchdogSec=90 when watchdog is enabled", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    expect(unit).toContain("WatchdogSec=90");
  });

  it("places watchdog directives in [Service] section", () => {
    const unit = buildSystemdUnit({
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      watchdog: true,
    });
    const serviceStart = unit.indexOf("[Service]");
    const installStart = unit.indexOf("[Install]");
    const typePos = unit.indexOf("Type=notify");
    const notifyAccessPos = unit.indexOf("NotifyAccess=all");
    const watchdogPos = unit.indexOf("WatchdogSec=90");
    expect(typePos).toBeGreaterThan(serviceStart);
    expect(typePos).toBeLessThan(installStart);
    expect(notifyAccessPos).toBeGreaterThan(serviceStart);
    expect(notifyAccessPos).toBeLessThan(installStart);
    expect(watchdogPos).toBeGreaterThan(serviceStart);
    expect(watchdogPos).toBeLessThan(installStart);
  });
});
