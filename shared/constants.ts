export const DEFAULT_BASE_URL = "https://api.caedral.com";

/** Chat tier pricing — see caedral.com/pricing (prepaid balance only). */
export const CHAT_TIER_PRICING = {
  base: "Free ($0.01 min balance, not charged)",
  titan: "$2 in / $0.20 cached / $6 out per 1M tokens",
  olympus: "$5 in / $0.50 cached / $15 out per 1M tokens",
  primordial: "$10 in / $1 cached / $30 out per 1M tokens",
} as const;

/** Specialized product pricing — see caedral.com/models */
export const SPECIALIZED_PRICING = {
  vision: "$5 / 1M tokens",
  embed: "Free until 28 Sep 2026 (130 RPM, $0.01 gate) · then $0.001 / 1M tokens",
  voice: "$15 / 1M tokens",
  rerank: "Free until 28 Sep 2026 (130 RPM, $0.01 gate) · then $0.0005 per search",
} as const;
