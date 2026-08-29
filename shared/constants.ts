export const DEFAULT_BASE_URL = "https://api.caedral.com";

/** Default HTTP timeout for Caedral API calls (matches official SDKs). */
export const DEFAULT_TIMEOUT_MS = 120_000;

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

export const CHAT_MODEL_IDS = [
  "caedral-base",
  "caedral-titan",
  "caedral-olympus",
  "caedral-primordial",
] as const;

export const EMBEDDING_MODEL_IDS = [
  "caedral-embed-e1-small-v1",
  "caedral-embed",
] as const;

export const RERANK_MODEL_ID = "caedral-rerank";
export const VISION_MODEL_ID = "caedral-vision";
export const VOICE_MODEL_ID = "caedral-voice";
export const EMBEDDING_DIMENSIONS = 384;
export const MAX_RERANK_DOCUMENTS = 100;

/**
 * Voices accepted by production POST /v1/audio/speech.
 * The gateway forwards `voice` to the audio model and defaults to alloy.
 * These are the current gpt-audio voice IDs, not the older TTS-1-only set.
 */
export const VOICE_OPTIONS = [
  { name: "Alloy", value: "alloy" },
  { name: "Ash", value: "ash" },
  { name: "Ballad", value: "ballad" },
  { name: "Coral", value: "coral" },
  { name: "Custom", value: "custom" },
  { name: "Echo", value: "echo" },
  { name: "Sage", value: "sage" },
  { name: "Shimmer", value: "shimmer" },
  { name: "Verse", value: "verse" },
] as const;

export const FALLBACK_CHAT_MODEL_OPTIONS = [
  {
    name: "Base (Free)",
    value: "caedral-base",
    description: CHAT_TIER_PRICING.base,
  },
  {
    name: "Olympus",
    value: "caedral-olympus",
    description: CHAT_TIER_PRICING.olympus,
  },
  {
    name: "Primordial",
    value: "caedral-primordial",
    description: CHAT_TIER_PRICING.primordial,
  },
  {
    name: "Titan",
    value: "caedral-titan",
    description: CHAT_TIER_PRICING.titan,
  },
] as const;

export const FALLBACK_EMBEDDING_MODEL_OPTIONS = [
  {
    name: "Caedral E1 Small",
    value: "caedral-embed-e1-small-v1",
    description: SPECIALIZED_PRICING.embed,
  },
  {
    name: "Caedral Embed (Legacy Alias)",
    value: "caedral-embed",
    description: `${SPECIALIZED_PRICING.embed}. Resolves to Caedral E1 Small`,
  },
] as const;

export const FALLBACK_RERANK_MODEL_OPTIONS = [
  {
    name: "Caedral Rerank",
    value: RERANK_MODEL_ID,
    description: SPECIALIZED_PRICING.rerank,
  },
] as const;

export const FALLBACK_IMAGE_MODEL_OPTIONS = [
  {
    name: "Caedral Vision",
    value: VISION_MODEL_ID,
    description: SPECIALIZED_PRICING.vision,
  },
] as const;

export const FALLBACK_AUDIO_MODEL_OPTIONS = [
  {
    name: "Caedral Voice",
    value: VOICE_MODEL_ID,
    description: SPECIALIZED_PRICING.voice,
  },
] as const;

/** v1 operation id → v2 resource (used when serialized workflows omit resource). */
export const RESOURCE_BY_OPERATION: Record<string, string> = {
  chatCompletion: "ai",
  createEmbedding: "ai",
  rerank: "ai",
  audioGeneration: "audio",
  imageGeneration: "image",
  listModels: "models",
  getModel: "models",
  getAccountInfo: "account",
  getUsage: "account",
};
