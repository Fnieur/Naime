/**
 * Detect MoE (Mixture-of-Experts) active params from model name patterns like "A22B".
 * Returns the active param count in billions, or null if not a MoE model.
 */
export function inferMoEActiveParamB(text: string): number | null {
  const raw = text.toLowerCase();
  const match = raw.match(/(?:^|[^a-z0-9])a(\d+(?:\.\d+)?)b(?:[^a-z0-9]|$)/);
  if (!match?.[1]) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function inferParamBFromIdOrName(text: string): number | null {
  const raw = text.toLowerCase();
  const matches = raw.matchAll(/(?:^|[^a-z0-9])[a-z]?(\d+(?:\.\d+)?)b(?:[^a-z0-9]|$)/g);
  let best: number | null = null;
  for (const match of matches) {
    const numRaw = match[1];
    if (!numRaw) {
      continue;
    }
    const value = Number(numRaw);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    if (best === null || value > best) {
      best = value;
    }
  }
  return best;
}
