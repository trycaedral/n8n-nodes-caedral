import type { INode } from "n8n-workflow";
import { NodeOperationError } from "n8n-workflow";

import { DEFAULT_BASE_URL, MAX_RERANK_DOCUMENTS, RESOURCE_BY_OPERATION } from "../../shared/constants";

export { DEFAULT_BASE_URL };
export type { CatalogModel } from "./catalog";

const VALIDATION_NODE: INode = {
  id: "caedral",
  name: "Caedral",
  type: "n8n-nodes-caedral.caedral",
  typeVersion: 2,
  position: [0, 0],
  parameters: {},
};

function validationFail(message: string, itemIndex?: number): never {
  throw new NodeOperationError(VALIDATION_NODE, message, { itemIndex });
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

export type ChatCompletionRequestBody = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop?: string | string[];
  user?: string;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: { type: string };
  notre?: { mode?: "off" | "auto"; telemetry?: boolean };
};

export type ChatCompletionResponse = {
  id?: string;
  model?: string;
  provider?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/** Included quota pool on GET /v1/usage. Milli-cents: $1 = 100_000. */
export type UsagePool = {
  usedMilli?: number;
  limitMilli?: number;
  usedFormatted?: string;
  limitFormatted?: string;
  percentUsed?: number;
  available?: boolean;
};

/** Shape of GET /v1/usage from the current Caedral API (plans, pools, on-demand). */
export type UsageResponse = {
  accountStatus?: string;
  plan?: {
    id?: string;
    name?: string;
    interval?: string;
    status?: string;
  };
  billingPeriod?: {
    start?: string | null;
    end?: string | null;
  };
  pools?: {
    caedral?: UsagePool;
    external?: UsagePool;
  };
  onDemand?: {
    mode?: string;
    allowed?: boolean;
    blocked?: boolean;
    accruedMilli?: number;
    spentMilli?: number;
    accruedFormatted?: string;
    spentFormatted?: string;
  };
};

export type CaedralApiErrorBody = {
  error?: {
    type?: string;
    message?: string;
    code?: number;
  };
};

export function normalizeBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return assertAllowedCaedralBaseUrl(trimmed);
}

const ALLOWED_BASE_HOSTS = new Set([
  "api.caedral.com",
  "localhost",
  "127.0.0.1",
  "::1",
  // Local n8n profile in platform/docker-compose.override.yml
  "api-gateway",
  // Host-run gateway from an n8n container (pasta / Docker Desktop)
  "host.docker.internal",
]);

/**
 * Restrict credential base URLs so a compromised workflow cannot exfiltrate the
 * API key to arbitrary hosts (SSRF / credential theft).
 */
export function assertAllowedCaedralBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    validationFail("Base URL must be a valid http or https URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    validationFail("Base URL must use http or https");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "api.caedral.com" && parsed.protocol !== "https:") {
    validationFail("Production API base URL must use https");
  }

  if (hostname.endsWith(".caedral.com")) {
    if (parsed.protocol !== "https:") {
      validationFail("*.caedral.com base URLs must use https");
    }
    return baseUrl;
  }

  if (ALLOWED_BASE_HOSTS.has(hostname)) {
    return baseUrl;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && hostname !== "127.0.0.1") {
    validationFail("Base URL must not target private or internal IP addresses");
  }

  validationFail(
    `Base URL host "${hostname}" is not allowed. Use https://api.caedral.com or a local development URL.`,
  );
}

export function buildRequestUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isValidChatMessageContent(content: unknown): boolean {
  if (content === null || content === undefined) return false;
  if (typeof content === "string") return true;
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((part) => {
    if (typeof part === "string") return true;
    if (!part || typeof part !== "object") return false;
    const block = part as { type?: unknown };
    return typeof block.type === "string" && block.type.trim().length > 0;
  });
}

export function parseMessagesJson(
  raw: string | ChatMessage[] | undefined,
  itemIndex?: number,
): ChatMessage[] {
  if (raw === undefined || raw === null || raw === "") {
    validationFail(
      "Messages JSON is required in JSON mode",
      itemIndex,
    );
  }

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      validationFail(
        "Messages JSON must be valid JSON",
        itemIndex,
      );
    }
  }

  if (!Array.isArray(value)) {
    validationFail(
      "Messages JSON must be an array of message objects",
      itemIndex,
    );
  }

  const messages: ChatMessage[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null) {
      validationFail(
        `Message at index ${index} must be an object`,
        itemIndex,
      );
    }

    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    const name = (item as { name?: unknown }).name;
    const toolCallId = (item as { tool_call_id?: unknown }).tool_call_id;
    const toolCalls = (item as { tool_calls?: unknown }).tool_calls;

    if (typeof role !== "string" || !role.trim()) {
      validationFail(
        `Message at index ${index} requires a role`,
        itemIndex,
      );
    }

    if (!["system", "user", "assistant", "tool"].includes(role)) {
      validationFail(
        `Message at index ${index} has invalid role "${role}"`,
        itemIndex,
      );
    }

    const hasToolCalls =
      role === "assistant" && Array.isArray(toolCalls) && toolCalls.length > 0;

    if (role === "tool") {
      if (typeof content !== "string" || typeof toolCallId !== "string") {
        validationFail(
          `Message at index ${index} requires string content and tool_call_id`,
          itemIndex,
        );
      }
    } else if (!hasToolCalls && !isValidChatMessageContent(content)) {
      validationFail(
        `Message at index ${index} requires string or multimodal array content`,
        itemIndex,
      );
    }

    const message: ChatMessage = {
      role: role as ChatMessage["role"],
      content: (content as ChatMessage["content"]) ?? null,
    };
    if (typeof name === "string" && name.trim()) message.name = name;
    if (typeof toolCallId === "string") message.tool_call_id = toolCallId;
    if (hasToolCalls) message.tool_calls = toolCalls as unknown[];
    messages.push(message);
  }

  return messages;
}

export function resolveMessages(
  messageMode: "simple" | "json",
  message?: string,
  messagesJson?: string | ChatMessage[],
  itemIndex?: number,
): ChatMessage[] {
  if (messageMode === "simple") {
    const text = message?.trim();
    if (!text) {
      validationFail(
        "Message is required in Simple mode",
        itemIndex,
      );
    }
    return [{ role: "user", content: text }];
  }

  const parsed = parseMessagesJson(messagesJson, itemIndex);
  if (parsed.length === 0) {
    validationFail(
      "Messages JSON must contain at least one message",
      itemIndex,
    );
  }
  return parsed;
}

export function parseJsonArrayParameter(
  raw: unknown,
  options: { fieldName: string; itemIndex?: number; expectStrings?: boolean },
): unknown[] {
  const { fieldName, itemIndex, expectStrings } = options;
  let value: unknown = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      validationFail(
        `${fieldName} must be valid JSON`,
        itemIndex,
      );
    }
  }

  if (!Array.isArray(value)) {
    validationFail(
      `${fieldName} must be a valid JSON array`,
      itemIndex,
    );
  }

  if (expectStrings && !value.every((entry) => typeof entry === "string")) {
    validationFail(
      `${fieldName} must be a valid JSON array of strings`,
      itemIndex,
    );
  }

  return value;
}

export function parseDocumentsJson(
  raw: unknown,
  itemIndex?: number,
): string[] {
  const documents = parseJsonArrayParameter(raw, {
    fieldName: "Documents",
    itemIndex,
    expectStrings: true,
  }) as string[];

  if (documents.length === 0) {
    validationFail("At least one document is required", itemIndex);
  }

  if (documents.length > MAX_RERANK_DOCUMENTS) {
    validationFail(
      `Documents exceeds the maximum of ${MAX_RERANK_DOCUMENTS} (got ${documents.length})`,
      itemIndex,
    );
  }

  return documents;
}

export function buildChatCompletionBody(params: {
  model: string;
  messageMode: "simple" | "json";
  message?: string;
  messagesJson?: string | ChatMessage[];
  temperature?: number;
  systemPrompt?: string;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stop?: string | string[];
  user?: string;
  toolsJson?: string | unknown[];
  toolChoice?: string;
  responseFormat?: string;
  notreMode?: "off" | "auto";
  notreTelemetry?: boolean;
  itemIndex?: number;
}): ChatCompletionRequestBody {
  const messages = resolveMessages(
    params.messageMode,
    params.message,
    params.messagesJson,
    params.itemIndex,
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
  if (params.topP !== undefined && params.topP !== null) {
    body.top_p = params.topP;
  }
  if (params.presencePenalty !== undefined && params.presencePenalty !== null) {
    body.presence_penalty = params.presencePenalty;
  }
  if (params.frequencyPenalty !== undefined && params.frequencyPenalty !== null) {
    body.frequency_penalty = params.frequencyPenalty;
  }
  if (params.stop !== undefined && params.stop !== null && params.stop !== "") {
    body.stop = params.stop;
  }
  if (params.user?.trim()) {
    body.user = params.user.trim();
  }
  if (params.responseFormat && params.responseFormat !== "text") {
    body.response_format = { type: params.responseFormat };
  }
  if (params.toolsJson !== undefined && params.toolsJson !== null && params.toolsJson !== "") {
    const tools = parseJsonArrayParameter(params.toolsJson, {
      fieldName: "Tools",
      itemIndex: params.itemIndex,
    });
    body.tools = tools;
    if (params.toolChoice) body.tool_choice = params.toolChoice;
  }

  if (params.notreMode === "auto" || params.notreTelemetry) {
    body.notre = {
      ...(params.notreMode ? { mode: params.notreMode } : {}),
      ...(params.notreTelemetry ? { telemetry: true } : {}),
    };
  }

  return body;
}

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

export function includedPoolPercentUsed(
  usage: UsageResponse,
  pool: "caedral" | "external",
): number | null {
  const entry = usage.pools?.[pool];
  if (!entry || typeof entry.percentUsed !== "number" || Number.isNaN(entry.percentUsed)) {
    return null;
  }
  if (pool === "external" && entry.available === false) {
    return null;
  }
  return entry.percentUsed;
}

export function formatApiErrorMessage(
  statusCode: number,
  body: CaedralApiErrorBody | string,
): string {
  if (typeof body === "string") {
    return `Caedral API error (${statusCode}): ${body}`.slice(0, 500);
  }

  const err = body.error;
  if (err?.message) {
    const type = err.type ? `[${err.type}] ` : "";
    return `${type}${err.message}`;
  }

  return `Caedral API error (${statusCode})`;
}

export function safeErrorDescription(body: unknown): string {
  if (body === undefined || body === null) return "";
  try {
    if (typeof body === "string") return body.slice(0, 2000);
    const record = body as Record<string, unknown>;
    const payload =
      record.error && typeof record.error === "object"
        ? { error: record.error }
        : { error: record };
    return JSON.stringify(payload, null, 2).slice(0, 2000);
  } catch {
    return "";
  }
}

export function parseEmbeddingInput(
  inputRaw: string,
  itemIndex?: number,
): string | string[] {
  if (!inputRaw.trim()) {
    validationFail("Input is required", itemIndex);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(inputRaw);
  } catch {
    return inputRaw;
  }

  if (Array.isArray(parsed) && parsed.every((entry: unknown) => typeof entry === "string")) {
    if (parsed.length === 0) {
      validationFail(
        "Input array must contain at least one string",
        itemIndex,
      );
    }
    return parsed as string[];
  }

  return inputRaw;
}

export function inferResourceFromOperation(operation: string): string {
  return RESOURCE_BY_OPERATION[operation] ?? "ai";
}
