import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listMatrixDirectoryGroupsLive, listMatrixDirectoryPeersLive } from "./directory-live.js";
import { resolveMatrixAuth } from "./matrix/client.js";

vi.mock("./matrix/client.js", () => ({
  resolveMatrixAuth: vi.fn(),
}));

describe("matrix directory live", () => {
  const cfg = { channels: { matrix: {} } };

  beforeEach(() => {
    vi.mocked(resolveMatrixAuth).mockReset();
    vi.mocked(resolveMatrixAuth).mockResolvedValue({
      homeserver: "https://matrix.example.org",
      userId: "@bot:example.org",
      accessToken: "test-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes accountId to peer directory auth resolution", async () => {
    await listMatrixDirectoryPeersLive({
      cfg,
      accountId: "assistant",
      query: "alice",
      limit: 10,
    });

    expect(resolveMatrixAuth).toHaveBeenCalledWith({ cfg, accountId: "assistant" });
  });

  it("passes accountId to group directory auth resolution", async () => {
    await listMatrixDirectoryGroupsLive({
      cfg,
      accountId: "assistant",
      query: "!room:example.org",
      limit: 10,
    });

    expect(resolveMatrixAuth).toHaveBeenCalledWith({ cfg, accountId: "assistant" });
  });

  it("preserves original casing for explicit !-prefixed room ID (#19278)", async () => {
    const mixedCaseRoomId = "!ArAQdbw5b42R5uBHuWz84xs6GI:matrix.org";
    const result = await listMatrixDirectoryGroupsLive({
      cfg,
      query: mixedCaseRoomId,
      limit: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(mixedCaseRoomId);
    expect(result[0].name).toBe(mixedCaseRoomId);
  });

  it("preserves original casing for #-prefixed alias query (#19278)", async () => {
    const alias = "#MyRoom:Example.org";
    const serverRoomId = "!ServerRoomId123:example.org";
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ room_id: serverRoomId }),
      text: async () => "",
    } as Response);

    const result = await listMatrixDirectoryGroupsLive({
      cfg,
      query: alias,
      limit: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(serverRoomId);
    expect(result[0].name).toBe(alias);
    expect(result[0].handle).toBe(alias);
  });

  it("lowercases query for fuzzy room name search", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joined_rooms: ["!room1:example.org"] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "Dev Chat" }),
      } as Response);

    const result = await listMatrixDirectoryGroupsLive({
      cfg,
      query: "Dev",
      limit: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("!room1:example.org");
    expect(result[0].name).toBe("Dev Chat");
  });
});
