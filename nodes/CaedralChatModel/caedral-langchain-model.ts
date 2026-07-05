import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BaseChatModelParams,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
} from "@langchain/core/messages";
import type { ChatGeneration, ChatResult } from "@langchain/core/outputs";
import { type Runnable, RunnableBinding } from "@langchain/core/runnables";
import type { IHttpRequestMethods } from "n8n-workflow";

import {
  buildRequestUrl,
  type ChatCompletionResponse,
} from "../Caedral/helpers";

type HttpRequestFn = (options: {
  method: IHttpRequestMethods;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  json?: boolean;
}) => Promise<unknown>;

export type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

type LangChainToolCall = {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  type?: string;
};

type LangChainMessage = {
  role?: string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LangChainToolCall[];
  additional_kwargs?: {
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  _getType?: () => string;
};

export type CaedralChatModelFields = BaseChatModelParams & {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  httpRequest: HttpRequestFn;
};

function normalizeToolArguments(args: unknown): string {
  if (typeof args === "string" && args.trim()) return args;
  if (typeof args === "object" && args !== null) return JSON.stringify(args);
  return "{}";
}

function zodFieldToJsonSchema(field: unknown): Record<string, unknown> {
  const def = (field as { _def?: { typeName?: string; description?: string } })
    ._def;
  if (!def?.typeName) return { type: "string" };

  const schema: Record<string, unknown> = {};
  if (def.description) schema.description = def.description;

  switch (def.typeName) {
    case "ZodString":
      schema.type = "string";
      break;
    case "ZodNumber":
      schema.type = "number";
      break;
    case "ZodBoolean":
      schema.type = "boolean";
      break;
    case "ZodArray":
      schema.type = "array";
      schema.items = zodFieldToJsonSchema(
        (def as { type?: unknown }).type,
      );
      break;
    case "ZodOptional":
    case "ZodNullable":
      return zodFieldToJsonSchema((def as { innerType?: unknown }).innerType);
    case "ZodEnum":
      schema.type = "string";
      schema.enum = (def as { values?: unknown[] }).values;
      break;
    default:
      schema.type = "string";
  }

  return schema;
}

function zodObjectToJsonSchema(schema: unknown): Record<string, unknown> {
  const def = (schema as { _def?: { typeName?: string; shape?: () => Record<string, unknown> } })
    ._def;
  if (def?.typeName !== "ZodObject" || typeof def.shape !== "function") {
    return { type: "object", properties: {} };
  }

  const shape = def.shape();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    properties[key] = zodFieldToJsonSchema(field);
    const fieldDef = (field as { _def?: { typeName?: string } })._def;
    if (
      fieldDef?.typeName !== "ZodOptional" &&
      fieldDef?.typeName !== "ZodNullable"
    ) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export function langChainToolToOpenAI(tool: unknown): OpenAIToolDefinition {
  const record = tool as Record<string, unknown>;

  if (
    record.type === "function" &&
    typeof record.function === "object" &&
    record.function !== null
  ) {
    const fn = record.function as {
      name?: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
    return {
      type: "function",
      function: {
        name: String(fn.name ?? ""),
        description: String(fn.description ?? ""),
        parameters: fn.parameters ?? { type: "object", properties: {} },
      },
    };
  }

  const kwargs = (record.lc_kwargs ?? {}) as Record<string, unknown>;
  const name = String(record.name ?? kwargs.name ?? "");
  const description = String(record.description ?? kwargs.description ?? "");

  const schema = record.schema ?? kwargs.schema;
  let parameters: Record<string, unknown> = { type: "object", properties: {} };

  if (schema && typeof schema === "object") {
    if ("type" in schema && "properties" in schema) {
      parameters = schema as Record<string, unknown>;
    } else {
      parameters = zodObjectToJsonSchema(schema);
    }
  }

  return {
    type: "function",
    function: { name, description, parameters },
  };
}

function extractTextContent(content: unknown): string | null {
  if (content == null) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null) {
          const block = part as { type?: string; text?: string };
          if (block.type === "text" && typeof block.text === "string") {
            return block.text;
          }
        }
        return "";
      })
      .filter(Boolean);
    return textParts.length > 0 ? textParts.join("\n") : null;
  }
  return String(content);
}

function extractToolCalls(message: LangChainMessage): LangChainToolCall[] {
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    return message.tool_calls;
  }

  const rawCalls = message.additional_kwargs?.tool_calls;
  if (!Array.isArray(rawCalls)) return [];

  return rawCalls
    .map((call) => {
      const fn = call.function;
      if (!fn?.name) return null;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(normalizeToolArguments(fn.arguments));
      } catch {
        args = {};
      }
      return {
        id: call.id ?? `call_${crypto.randomUUID()}`,
        name: fn.name,
        args,
        type: call.type ?? "tool_call",
      } as LangChainToolCall;
    })
    .filter((call): call is LangChainToolCall => call !== null);
}

export function langChainMessageToOpenAI(message: LangChainMessage): OpenAIChatMessage[] {
  let role = message.role ?? "user";

  if (typeof message._getType === "function") {
    const type = message._getType();
    if (type === "system" || type === "SystemMessage") role = "system";
    else if (type === "ai" || type === "AIMessage") role = "assistant";
    else if (type === "human" || type === "HumanMessage") role = "user";
    else if (type === "tool" || type === "ToolMessage") role = "tool";
  }

  if (role === "tool") {
    return [
      {
        role: "tool",
        content: extractTextContent(message.content) ?? "",
        tool_call_id: message.tool_call_id ?? "",
        ...(message.name ? { name: message.name } : {}),
      },
    ];
  }

  const toolCalls = extractToolCalls(message);
  if (role === "assistant" && toolCalls.length > 0) {
    return [
      {
        role: "assistant",
        content: extractTextContent(message.content),
        tool_calls: toolCalls.map((call) => ({
          id: call.id ?? `call_${crypto.randomUUID()}`,
          type: "function" as const,
          function: {
            name: call.name,
            arguments: normalizeToolArguments(call.args),
          },
        })),
      },
    ];
  }

  return [
    {
      role: role as OpenAIChatMessage["role"],
      content: extractTextContent(message.content) ?? "",
      ...(message.name ? { name: message.name } : {}),
    },
  ];
}

function parseResponseToolCalls(
  toolCalls: NonNullable<
    NonNullable<ChatCompletionResponse["choices"]>[number]["message"]
  >["tool_calls"],
): LangChainToolCall[] {
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls
    .map((call) => {
      const fn = call.function;
      if (!fn?.name) return null;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(normalizeToolArguments(fn.arguments));
      } catch {
        args = {};
      }
      return {
        id: call.id ?? `call_${crypto.randomUUID()}`,
        name: fn.name,
        args,
        type: "tool_call",
      } as LangChainToolCall;
    })
    .filter((call): call is LangChainToolCall => call !== null);
}

function createAIMessage(content: string | null, toolCalls: LangChainToolCall[]): AIMessage {
  return new AIMessage({
    content: content ?? "",
    tool_calls:
      toolCalls.length > 0
        ? toolCalls.map((call) => ({
            id: call.id ?? `call_${crypto.randomUUID()}`,
            name: call.name,
            args: call.args,
            type: "tool_call",
          }))
        : [],
  });
}

function extractToolsFromOptions(options: BaseChatModelCallOptions): unknown[] {
  const tools = (options as { tools?: unknown }).tools;
  return Array.isArray(tools) ? tools : [];
}

export class CaedralLangChainChatModel extends BaseChatModel {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly httpRequest: HttpRequestFn;

  constructor(fields: CaedralChatModelFields) {
    super(fields);
    this.baseUrl = fields.baseUrl;
    this.apiKey = fields.apiKey;
    this.modelName = fields.model;
    this.temperature = fields.temperature;
    this.maxTokens = fields.maxTokens;
    this.httpRequest = fields.httpRequest;
  }

  _llmType(): string {
    return "caedral";
  }

  get callKeys(): string[] {
    return [...super.callKeys, "tools", "tool_choice"];
  }

  bindTools(
    tools: BindToolsInput[],
    kwargs?: Partial<BaseChatModelCallOptions>,
  ): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return new RunnableBinding<
      BaseLanguageModelInput,
      AIMessageChunk,
      BaseChatModelCallOptions
    >({
      bound: this,
      kwargs: { tools, tool_choice: "auto", ...kwargs } as Partial<BaseChatModelCallOptions>,
      config: {},
    });
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const formatted = messages.flatMap((message) =>
      langChainMessageToOpenAI(message as LangChainMessage),
    );

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: formatted,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    const boundTools = extractToolsFromOptions(options);
    if (boundTools.length > 0) {
      body.tools = boundTools.map(langChainToolToOpenAI);
      body.tool_choice = options.tool_choice ?? "auto";
    }

    const url = buildRequestUrl(this.baseUrl, "/v1/chat/completions");
    const response = (await this.httpRequest({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      json: true,
    })) as ChatCompletionResponse;

    const choice = response.choices?.[0];
    const message = choice?.message;
    const content = message?.content ?? null;
    const toolCalls = parseResponseToolCalls(message?.tool_calls);
    const aiMessage = createAIMessage(content, toolCalls);
    const usage = response.usage;
    const finishReason = choice?.finish_reason ?? "stop";

    const generation: ChatGeneration = {
      text: content ?? "",
      message: aiMessage,
      generationInfo: {
        finishReason,
      },
    };

    return {
      generations: [generation],
      llmOutput: {
        tokenUsage: {
          completionTokens: usage?.completion_tokens ?? 0,
          promptTokens: usage?.prompt_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0,
        },
      },
    };
  }
}
