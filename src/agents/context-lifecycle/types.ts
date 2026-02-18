export type ContextLifecycleRule =
  // Context decay rules (from our extension)
  | "decay:strip_thinking"
  | "decay:summarize_tool_result"
  | "decay:summarize_group"
  | "decay:strip_tool_result"
  | "decay:file_swap"
  | "decay:max_messages"
  | "decay:pass"
  // Session pruning rules (existing core)
  | "prune:soft_trim"
  | "prune:hard_clear"
  | "prune:pass"
  // Compaction
  | "compact:memory_flush"
  | "compact:compaction";

export interface ContextLifecycleEvent {
  timestamp: string;
  sessionKey: string;
  sessionId: string;
  turn: number;
  rule: ContextLifecycleRule;
  beforeTokens: number;
  beforePct: number;
  freedTokens: number;
  afterTokens: number;
  afterPct: number;
  contextWindow: number;
  details?: Record<string, unknown>;
}
