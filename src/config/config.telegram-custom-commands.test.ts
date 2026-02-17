import { describe, expect, it } from "vitest";
import { OpenClawSchema } from "./zod-schema.js";

describe("telegram custom commands schema", () => {
  it("normalizes custom commands", () => {
    const res = OpenClawSchema.safeParse({
      channels: {
        telegram: {
          customCommands: [{ command: "/Backup", description: "  Git backup  " }],
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      return;
    }

    expect(res.data.channels?.telegram?.customCommands).toEqual([
      { command: "backup", description: "Git backup" },
    ]);
  });

  it("normalizes hyphenated command names", () => {
    const res = OpenClawSchema.safeParse({
      channels: {
        telegram: {
          customCommands: [{ command: "my-command", description: "Hyphenated" }],
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      return;
    }

    expect(res.data.channels?.telegram?.customCommands).toEqual([
      { command: "my_command", description: "Hyphenated" },
    ]);
  });

  it("rejects custom commands with invalid names", () => {
    const res = OpenClawSchema.safeParse({
      channels: {
        telegram: {
          customCommands: [{ command: "bad name!", description: "Override status" }],
        },
      },
    });

    expect(res.success).toBe(false);
    if (res.success) {
      return;
    }

    expect(
      res.error.issues.some(
        (issue) =>
          issue.path.join(".") === "channels.telegram.customCommands.0.command" &&
          issue.message.includes("invalid"),
      ),
    ).toBe(true);
  });
});
