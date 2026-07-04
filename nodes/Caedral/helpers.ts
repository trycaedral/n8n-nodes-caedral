import { DEFAULT_BASE_URL } from "../../shared/constants";

export { DEFAULT_BASE_URL };

export const MODEL_OPTIONS = [
  { name: "Base (Free)", value: "caedral-base" },
  { name: "Titan", value: "caedral-titan" },
  { name: "Olympus", value: "caedral-olympus" },
  { name: "Primordial", value: "caedral-primordial" },
] as const;

export type CaedralModelId = (typeof MODEL_OPTIONS)[number]["value"];

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
};

export type ChatCompletionRequestBody = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

export type ChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type UsageResponse = {
  accountStatus?: string;
  plan?: string;
  planStatus?: string;
  balanceCents?: number;
  weeklyPool?: {
    limit?: number;
    used?: number;
    remaining?: number;
  };
  overage?: {
    enabled?: boolean;
    limitCents?: number | null;
    usedCents?: number;
    remainingCents?: number | null;
  };
  balanceWeightedUnitsAffordable?: number;
};

export type CaedralApiErrorBody = {
  error?: {
    type?: string;
    message?: string;
    code?: number;
  };
};

/**
 * Normalize a user-supplied base URL for the Caedral API.
 *
 * Trims whitespace, falls back to {@link DEFAULT_BASE_URL} when
 * empty, and strips any trailing slash so that paths can be
 * appended safely.
 *
 * @param baseUrl - Raw base URL from the node credentials.
 * @returns The normalized base URL without a trailing slash.
 */
export function normalizeBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  return trimmed;
}

/**
 * Build the JSON body for a `POST /v1/chat/completions` request.
 *
 * Resolves the messages array from either the simple `message`
 * field or the raw `messagesJson`, and includes `temperature` and
 * `max_tokens` only when they are explicitly provided.
 *
 * @param params - Node parameters collected for the chat completion
 *   operation.
 * @returns A fully-formed request body ready to send to the API.
 * @throws {Error} If message resolution fails (missing text in
 *   Simple mode, or invalid JSON in JSON mode).
 */
export function buildChatCompletionBody(params: {
  model: string;
  messageMode: "simple" | "json";
  message?: string;
  messagesJson?: string | ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}): ChatCompletionRequestBody {
  const messages = resolveMessages(
    params.messageMode,
    params.message,
    params.messagesJson,
  );

  if (params.systemPrompt && params.messageMode === "simple") {
    messages.unshift({ role: "system", content: params.systemPrompt });
  }

  const body: ChatCompletionRequestBody = {
    model: params.model,
    messages,
  };

  if (params.temperature !== undefined && params.temperature !== null) {
    body.temperature = params.temperature;
  }

  if (params.maxTokens !== undefined && params.maxTokens !== null) {
    body.max_tokens = params.maxTokens;
  }

  return body;
}

/**
 * Resolve the effective chat messages array for a request.
 *
 * In `"simple"` mode a single user message is built from the
 * trimmed `message` string. In `"json"` mode the `messagesJson`
 * input is parsed and validated via {@link parseMessagesJson}.
 *
 * @param messageMode - Which input path to use.
 * @param message - Raw text for Simple mode.
 * @param messagesJson - Raw JSON (string or already-parsed array)
 *   for JSON mode.
 * @returns The validated list of chat messages.
 * @throws {Error} If required input is missing or invalid.
 */
export function resolveMessages(
  messageMode: "simple" | "json",
  message?: string,
  messagesJson?: string | ChatMessage[],
): ChatMessage[] {
  if (messageMode === "simple") {
    const text = message?.trim();
    if (!text) {
      throw new Error("Message is required in Simple mode.");
    }
    return [{ role: "user", content: text }];
  }

  const parsed = parseMessagesJson(messagesJson);
  if (parsed.length === 0) {
    throw new Error("Messages JSON must contain at least one message.");
  }
  return parsed;
}

/**
 * Parse and validate the raw `messagesJson` node input.
 *
 * Accepts either a JSON-encoded string or an already-decoded array.
 * Each entry must be an object with a supported `role`
 * (`"system" | "user" | "assistant" | "tool"`) and a string
 * `content`.
 *
 * @param raw - The raw input value provided by the user.
 * @returns The list of validated chat messages.
 * @throws {Error} If the value is missing, is not valid JSON, is
 *   not an array, or contains an invalid entry.
 */
export function parseMessagesJson(
  raw: string | ChatMessage[] | undefined,
): ChatMessage[] {
  if (raw === undefined || raw === null || raw === "") {
    throw new Error("Messages JSON is required in JSON mode.");
  }

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Messages JSON must be valid JSON.");
    }
  }

  if (!Array.isArray(value)) {
    throw new Error("Messages JSON must be an array of message objects.");
  }

  const messages: ChatMessage[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Message at index ${index} must be an object.`);
    }

    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;

    if (typeof role !== "string" || !role.trim()) {
      throw new Error(`Message at index ${index} requires a role.`);
    }

    if (typeof content !== "string") {
      throw new Error(`Message at index ${index} requires string content.`);
    }

    if (!["system", "user", "assistant", "tool"].includes(role)) {
      throw new Error(
        `Message at index ${index} has invalid role "${role}".`,
      );
    }

    messages.push({ role: role as ChatMessage["role"], content });
  }

  return messages;
}

/**
 * Flatten a raw chat completion response into the shape emitted by
 * the node.
 *
 * Extracts the first choice's content, the model id, the finish
 * reason, and token usage, while also preserving the full `raw`
 * payload for downstream nodes that need it.
 *
 * @param response - Raw API response body.
 * @returns A flattened, node-friendly representation.
 */
export function parseChatCompletionResponse(
  response: ChatCompletionResponse,
): {
  content: string;
  model: string;
  finishReason: string | null;
  usage: ChatCompletionResponse["usage"] | null;
  raw: ChatCompletionResponse;
} {
  const choice = response.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    model: response.model ?? "",
    finishReason: choice?.finish_reason ?? null,
    usage: response.usage ?? null,
    raw: response,
  };
}

/**
 * Normalize a `GET /v1/usage` response for node output.
 *
 * Fills in defaults for any missing fields so downstream nodes can
 * rely on a stable shape (numeric zeros instead of `undefined`,
 * `"unknown"` for missing status strings, etc.).
 *
 * @param usage - Raw usage response from the API.
 * @returns A fully-populated usage object with default values.
 */
export function formatUsageForOutput(usage: UsageResponse) {
  return {
    accountStatus: usage.accountStatus ?? "unknown",
    plan: usage.plan ?? "free",
    planStatus: usage.planStatus ?? "unknown",
    balanceCents: usage.balanceCents ?? 0,
    weeklyPool: {
      limit: usage.weeklyPool?.limit ?? 0,
      used: usage.weeklyPool?.used ?? 0,
      remaining: usage.weeklyPool?.remaining ?? 0,
    },
    overage: {
      enabled: usage.overage?.enabled ?? false,
      limitCents: usage.overage?.limitCents ?? null,
      usedCents: usage.overage?.usedCents ?? 0,
      remainingCents: usage.overage?.remainingCents ?? null,
    },
    balanceWeightedUnitsAffordable:
      usage.balanceWeightedUnitsAffordable ?? 0,
  };
}

/**
 * Format a human-readable error message from a Caedral API failure.
 *
 * If the body follows the Caedral error envelope
 * (`{ error: { type, message, code } }`), the `type` is prefixed
 * in brackets before the message. Otherwise a generic message
 * including the HTTP status is returned.
 *
 * @param statusCode - HTTP status code of the failing response.
 * @param body - Parsed error body, or the raw text when parsing
 *   failed.
 * @returns A human-readable error message suitable for surfacing
 *   in n8n.
 */
export function formatApiErrorMessage(
  statusCode: number,
  body: CaedralApiErrorBody | string,
): string {
  if (typeof body === "string") {
    return `Caedral API error (${statusCode}): ${body}`;
  }

  const err = body.error;
  if (err?.message) {
    const type = err.type ? `[${err.type}] ` : "";
    return `${type}${err.message}`;
  }

  return `Caedral API error (${statusCode})`;
}

/**
 * Compose a full API URL from a base URL and endpoint path.
 *
 * The base URL is passed through {@link normalizeBaseUrl} and the
 * path is prefixed with `/` if it does not already start with one,
 * guaranteeing exactly one slash between the two.
 *
 * @param baseUrl - Base URL for the Caedral API.
 * @param path - Endpoint path (with or without a leading slash).
 * @returns The composed absolute URL.
 */
export function buildRequestUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}
