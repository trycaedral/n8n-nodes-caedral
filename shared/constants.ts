export const DEFAULT_BASE_URL = "https://api.caedral.com";

/** Chat tier pricing — source: site/src/content/site.ts tokenRates */
export const CHAT_TIER_PRICING = {
  base: "Free (200K/wk fair use)",
  titan: "$1 in / $5 out per 1M tokens",
  olympus: "$2 in / $10 out per 1M tokens",
  primordial: "$5 in / $25 out per 1M tokens",
} as const;

/** Upstream OpenRouter models — source: api-gateway/src/config/models.ts */
export const CHAT_UPSTREAM_MODELS = {
  "caedral-base": "deepseek/deepseek-v4-flash",
  "caedral-titan": "anthropic/claude-haiku-4.5",
  "caedral-olympus": "anthropic/claude-sonnet-5",
  "caedral-primordial": "anthropic/claude-opus-4.8",
} as const;

/** Specialized product pricing — source: api-gateway/src/config/specialized-products.ts */
export const SPECIALIZED_PRICING = {
  vision: "$3.33 / 1M tokens (google/gemini-3.1-flash-image)",
  embed: "$0.028 / 1M tokens (openai/text-embedding-3-small)",
  voice: "$11.38 / 1M tokens (openai/gpt-audio)",
  rerank: "$0.001 per search (nvidia/llama-nemotron-rerank-vl-1b-v2:free)",
} as const;
