export const DEFAULT_BASE_URL = "https://api.caedral.com";

/** Chat tier pricing — source: site/src/content/site.ts tokenRates */
export const CHAT_TIER_PRICING = {
  base: "Free (200K/wk fair use)",
  titan: "$1 in / $5 out per 1M tokens",
  olympus: "$2 in / $10 out per 1M tokens",
  primordial: "$5 in / $25 out per 1M tokens",
} as const;

/** Specialized product pricing — source: api-gateway/src/config/specialized-products.ts */
export const SPECIALIZED_PRICING = {
  vision: "$3.33 / 1M tokens",
  embed: "$0.028 / 1M tokens",
  voice: "$11.38 / 1M tokens",
  rerank: "$0.001 per search",
} as const;
