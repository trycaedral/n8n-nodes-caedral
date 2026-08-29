export const DEFAULT_BASE_URL = "https://api.caedral.com";

/** Default HTTP timeout for Caedral API calls (matches official SDKs). */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Credential test and catalog loaders should fail fast instead of spinning forever. */
export const CREDENTIAL_TEST_TIMEOUT_MS = 15_000;
export const CATALOG_TIMEOUT_MS = 20_000;

export const MAX_RERANK_DOCUMENTS = 100;

/** Canonical inference paths from production GET /v1/models `recommended_endpoint.path`. */
export const ENDPOINT_PATHS = {
  chatCompletions: "/v1/chat/completions",
  embeddings: "/v1/embeddings",
  rerank: "/v1/rerank",
  imageGenerations: "/v1/images/generations",
  audioSpeech: "/v1/audio/speech",
  audioTranscriptions: "/v1/audio/transcriptions",
  videos: "/v1/videos",
} as const;

export const CATALOG_LOAD_ERROR =
  "Could not load models from GET /v1/models. Check the Caedral API credential, or enter a model ID using an expression";

export const CATALOG_VOICE_LOAD_ERROR =
  "This speech model did not publish voices on GET /v1/models. Enter a voice ID using an expression, or choose a model that lists supported_voices";

/** v1 operation id → v2 resource (used when serialized workflows omit resource). */
export const RESOURCE_BY_OPERATION: Record<string, string> = {
  chatCompletion: "ai",
  createEmbedding: "ai",
  rerank: "ai",
  audioGeneration: "audio",
  audioTranscription: "audio",
  imageGeneration: "image",
  videoGeneration: "video",
  getVideoStatus: "video",
  getVideoContent: "video",
  listModels: "models",
  getModel: "models",
  getAccountInfo: "account",
  getUsage: "account",
};
