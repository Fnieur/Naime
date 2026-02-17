import type { ChannelGroupContext, GroupToolPolicyConfig } from "openclaw/plugin-sdk";
import { normalizeAccountId } from "openclaw/plugin-sdk";
import type { CoreConfig, MatrixConfig } from "./types.js";
import { mergeAccountConfig, resolveAccountConfig } from "./matrix/accounts.js";
import { resolveMatrixRoomConfig } from "./matrix/monitor/rooms.js";

function stripLeadingPrefixCaseInsensitive(value: string, prefix: string): string {
  return value.toLowerCase().startsWith(prefix.toLowerCase())
    ? value.slice(prefix.length).trim()
    : value;
}

/** Resolve merged config for a specific account (used for per-account groups config). */
function resolveMatrixAccountConfigForGroup(
  cfg: CoreConfig,
  accountId?: string | null,
): MatrixConfig {
  const normalized = normalizeAccountId(accountId);
  const matrixBase = cfg.channels?.matrix ?? {};
  const accountConfig = resolveAccountConfig(cfg, normalized);
  return accountConfig ? mergeAccountConfig(matrixBase, accountConfig) : matrixBase;
}

function resolveMatrixRoomConfigForGroup(params: ChannelGroupContext) {
  const rawGroupId = params.groupId?.trim() ?? "";
  let roomId = rawGroupId;
  roomId = stripLeadingPrefixCaseInsensitive(roomId, "matrix:");
  roomId = stripLeadingPrefixCaseInsensitive(roomId, "channel:");
  roomId = stripLeadingPrefixCaseInsensitive(roomId, "room:");

  const groupChannel = params.groupChannel?.trim() ?? "";
  const aliases = groupChannel ? [groupChannel] : [];
  const cfg = params.cfg as CoreConfig;
  const matrixConfig = resolveMatrixAccountConfigForGroup(cfg, params.accountId);
  return resolveMatrixRoomConfig({
    rooms: matrixConfig.groups ?? matrixConfig.rooms,
    roomId,
    aliases,
    name: groupChannel || undefined,
  }).config;
}

export function resolveMatrixGroupRequireMention(params: ChannelGroupContext): boolean {
  const resolved = resolveMatrixRoomConfigForGroup(params);
  if (resolved) {
    if (resolved.autoReply === true) {
      return false;
    }
    if (resolved.autoReply === false) {
      return true;
    }
    if (typeof resolved.requireMention === "boolean") {
      return resolved.requireMention;
    }
  }
  return true;
}

export function resolveMatrixGroupToolPolicy(
  params: ChannelGroupContext,
): GroupToolPolicyConfig | undefined {
  const resolved = resolveMatrixRoomConfigForGroup(params);
  return resolved?.tools;
}
