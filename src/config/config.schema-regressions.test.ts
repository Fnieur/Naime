import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

describe("config schema regressions", () => {
  it("accepts nested telegram groupPolicy overrides", () => {
    const res = validateConfigObject({
      channels: {
        telegram: {
          groups: {
            "-1001234567890": {
              groupPolicy: "open",
              topics: {
                "42": {
                  groupPolicy: "disabled",
                },
              },
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts signal groups with requireMention override (#18635)", () => {
    const res = validateConfigObject({
      channels: {
        signal: {
          groups: {
            "*": {
              requireMention: false,
            },
          },
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("accepts signal groups with per-group tools and skills", () => {
    const res = validateConfigObject({
      channels: {
        signal: {
          groupPolicy: "open",
          groups: {
            "group-abc-123": {
              requireMention: true,
              tools: { allow: ["exec"] },
              skills: ["weather"],
            },
            "*": {
              requireMention: false,
            },
          },
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects signal groups with unknown keys", () => {
    const res = validateConfigObject({
      channels: {
        signal: {
          groups: {
            "*": {
              requireMention: false,
              unknownField: true,
            },
          },
        },
      },
    });
    expect(res.ok).toBe(false);
  });

  it('accepts memorySearch fallback "voyage"', () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          memorySearch: {
            fallback: "voyage",
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });
});
