import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import {
  buildChatCompletionBody,
  buildRequestUrl,
  formatApiErrorMessage,
  formatUsageForOutput,
  MODEL_OPTIONS,
  normalizeBaseUrl,
  parseChatCompletionResponse,
  type CaedralApiErrorBody,
  type ChatCompletionResponse,
  type ChatMessage,
  type UsageResponse,
} from "./helpers";

type CaedralCredentials = {
  apiKey: string;
  baseUrl?: string;
};

export class Caedral implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Caedral",
    name: "caedral",
    icon: {
      light: "file:../../icons/caedral.svg",
      dark: "file:../../icons/caedral.dark.svg",
    },
    group: ["transform"],
    version: 2,
    subtitle: '={{$parameter["operation"]}}',
    description:
      "Call Caedral AI models — chat, images, embeddings, audio, rerank, and account management",
    defaults: {
      name: "Caedral",
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    usableAsTool: true,
    credentials: [
      {
        name: "caedralApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Chat Completion",
            value: "chatCompletion",
            description: "Send a chat completion request to a Caedral model",
            action: "Send a chat completion",
          },
          {
            name: "Generate Image",
            value: "imageGeneration",
            description: "Generate an image from a text prompt",
            action: "Generate an image",
          },
          {
            name: "Create Embedding",
            value: "createEmbedding",
            description: "Create vector embeddings for text",
            action: "Create an embedding",
          },
          {
            name: "Generate Audio",
            value: "audioGeneration",
            description: "Generate speech audio from text",
            action: "Generate audio",
          },
          {
            name: "Rerank",
            value: "rerank",
            description: "Rerank documents by relevance to a query",
            action: "Rerank documents",
          },
          {
            name: "List Models",
            value: "listModels",
            description: "List all available Caedral models",
            action: "List models",
          },
          {
            name: "Get Usage",
            value: "getUsage",
            description: "Get current pool, balance, and overage status",
            action: "Get usage",
          },
          {
            name: "Get Account Info",
            value: "getAccountInfo",
            description: "Get account status, plan, and balance details",
            action: "Get account info",
          },
        ],
        default: "chatCompletion",
      },

      // --- Chat Completion params ---
      {
        displayName: "Model",
        name: "model",
        type: "options",
        displayOptions: { show: { operation: ["chatCompletion"] } },
        options: [...MODEL_OPTIONS],
        default: "caedral-base",
        description: "The Caedral model tier to use",
      },
      {
        displayName: "Message Input Mode",
        name: "messageMode",
        type: "options",
        displayOptions: { show: { operation: ["chatCompletion"] } },
        options: [
          { name: "Simple", value: "simple", description: "Single user message text" },
          { name: "JSON", value: "json", description: "Full messages array as JSON" },
        ],
        default: "simple",
      },
      {
        displayName: "Message",
        name: "message",
        type: "string",
        typeOptions: { rows: 4 },
        displayOptions: { show: { operation: ["chatCompletion"], messageMode: ["simple"] } },
        default: "",
        placeholder: "Explain quantum computing in one sentence.",
        description: "The user message sent to the model",
      },
      {
        displayName: "Messages JSON",
        name: "messagesJson",
        type: "json",
        displayOptions: { show: { operation: ["chatCompletion"], messageMode: ["json"] } },
        default: '[{"role":"user","content":"Hello!"}]',
        description:
          'Array of message objects, e.g. [{"role":"user","content":"Hello"}]',
      },
      {
        displayName: "Temperature",
        name: "temperature",
        type: "number",
        typeOptions: { minValue: 0, maxValue: 2, numberStepSize: 0.1 },
        displayOptions: { show: { operation: ["chatCompletion"] } },
        default: 1,
        description: "Sampling temperature (0–2). Leave default to omit from request.",
      },
      {
        displayName: "Max Tokens",
        name: "maxTokens",
        type: "number",
        typeOptions: { minValue: 1 },
        displayOptions: { show: { operation: ["chatCompletion"] } },
        default: 0,
        description: "Maximum tokens to generate. Set to 0 to omit from request.",
      },
      {
        displayName: "System Prompt",
        name: "systemPrompt",
        type: "string",
        typeOptions: { rows: 3 },
        displayOptions: { show: { operation: ["chatCompletion"], messageMode: ["simple"] } },
        default: "",
        description: "Optional system message prepended before the user message",
      },

      // --- Image Generation params ---
      {
        displayName: "Prompt",
        name: "imagePrompt",
        type: "string",
        typeOptions: { rows: 4 },
        displayOptions: { show: { operation: ["imageGeneration"] } },
        default: "",
        required: true,
        placeholder: "A futuristic city skyline at sunset, digital art",
        description: "Text description of the image to generate",
      },
      {
        displayName: "Size",
        name: "imageSize",
        type: "options",
        displayOptions: { show: { operation: ["imageGeneration"] } },
        options: [
          { name: "1024x1024", value: "1024x1024" },
          { name: "1792x1024", value: "1792x1024" },
          { name: "1024x1792", value: "1024x1792" },
        ],
        default: "1024x1024",
        description: "Dimensions of the generated image",
      },
      {
        displayName: "Number of Images",
        name: "imageN",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 4 },
        displayOptions: { show: { operation: ["imageGeneration"] } },
        default: 1,
        description: "Number of images to generate (1–4)",
      },

      // --- Embedding params ---
      {
        displayName: "Input",
        name: "embeddingInput",
        type: "string",
        typeOptions: { rows: 4 },
        displayOptions: { show: { operation: ["createEmbedding"] } },
        default: "",
        required: true,
        placeholder: "The quick brown fox jumps over the lazy dog.",
        description:
          "Text to embed. For multiple texts, provide a JSON array of strings.",
      },

      // --- Audio params ---
      {
        displayName: "Input Text",
        name: "audioInput",
        type: "string",
        typeOptions: { rows: 4 },
        displayOptions: { show: { operation: ["audioGeneration"] } },
        default: "",
        required: true,
        placeholder: "Welcome to Caedral, the unified AI platform.",
        description: "Text to convert to speech",
      },
      {
        displayName: "Voice",
        name: "audioVoice",
        type: "options",
        displayOptions: { show: { operation: ["audioGeneration"] } },
        options: [
          { name: "Alloy", value: "alloy" },
          { name: "Echo", value: "echo" },
          { name: "Fable", value: "fable" },
          { name: "Onyx", value: "onyx" },
          { name: "Nova", value: "nova" },
          { name: "Shimmer", value: "shimmer" },
        ],
        default: "alloy",
        description: "Voice style for speech generation",
      },

      // --- Rerank params ---
      {
        displayName: "Query",
        name: "rerankQuery",
        type: "string",
        typeOptions: { rows: 2 },
        displayOptions: { show: { operation: ["rerank"] } },
        default: "",
        required: true,
        placeholder: "What is the capital of France?",
        description: "The search query to rank documents against",
      },
      {
        displayName: "Documents",
        name: "rerankDocuments",
        type: "json",
        displayOptions: { show: { operation: ["rerank"] } },
        default: '["Paris is the capital of France.", "Berlin is in Germany."]',
        required: true,
        description: "JSON array of document strings to rerank",
      },
      {
        displayName: "Top N",
        name: "rerankTopN",
        type: "number",
        typeOptions: { minValue: 1 },
        displayOptions: { show: { operation: ["rerank"] } },
        default: 0,
        description: "Number of top results to return. 0 = return all.",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = (await this.getCredentials("caedralApi")) as CaedralCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const apiKey = credentials.apiKey;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const operation = this.getNodeParameter("operation", itemIndex) as string;

        if (operation === "listModels") {
          const response = await caedralRequest<{ object: string; data: IDataObject[] }>(
            this, baseUrl, apiKey, "GET", "/v1/models",
          );
          returnData.push({
            json: { models: response.data } as IDataObject,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "getUsage" || operation === "getAccountInfo") {
          const usage = await caedralRequest<UsageResponse>(
            this, baseUrl, apiKey, "GET", "/v1/usage",
          );
          returnData.push({
            json: formatUsageForOutput(usage) as IDataObject,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "chatCompletion") {
          const model = this.getNodeParameter("model", itemIndex) as string;
          const messageMode = this.getNodeParameter("messageMode", itemIndex) as "simple" | "json";
          const message = this.getNodeParameter("message", itemIndex) as string;
          const messagesJson = this.getNodeParameter("messagesJson", itemIndex);
          const temperature = this.getNodeParameter("temperature", itemIndex) as number;
          const maxTokens = this.getNodeParameter("maxTokens", itemIndex) as number;
          const systemPrompt = this.getNodeParameter("systemPrompt", itemIndex, "") as string;

          const body = buildChatCompletionBody({
            model,
            messageMode,
            message,
            messagesJson: messagesJson as string | ChatMessage[],
            temperature: temperature === 1 ? undefined : temperature,
            maxTokens: maxTokens > 0 ? maxTokens : undefined,
            systemPrompt: systemPrompt?.trim() || undefined,
          });

          const response = await caedralRequest<ChatCompletionResponse>(
            this, baseUrl, apiKey, "POST", "/v1/chat/completions", body,
          );

          const parsed = parseChatCompletionResponse(response);
          returnData.push({
            json: {
              content: parsed.content,
              model: parsed.model,
              finishReason: parsed.finishReason,
              usage: parsed.usage,
              raw: parsed.raw,
            } as IDataObject,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "imageGeneration") {
          const prompt = this.getNodeParameter("imagePrompt", itemIndex) as string;
          const size = this.getNodeParameter("imageSize", itemIndex) as string;
          const n = this.getNodeParameter("imageN", itemIndex) as number;

          if (!prompt.trim()) {
            throw new NodeOperationError(this.getNode(), "Prompt is required.", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model: "caedral-vision",
            prompt: prompt.trim(),
            size,
          };
          if (n > 1) body.n = n;

          const response = await caedralRequest<IDataObject>(
            this, baseUrl, apiKey, "POST", "/v1/images/generations", body,
          );

          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "createEmbedding") {
          const inputRaw = this.getNodeParameter("embeddingInput", itemIndex) as string;
          if (!inputRaw.trim()) {
            throw new NodeOperationError(this.getNode(), "Input is required.", { itemIndex });
          }

          let input: string | string[];
          try {
            const parsed = JSON.parse(inputRaw);
            if (Array.isArray(parsed) && parsed.every((i: unknown) => typeof i === "string")) {
              input = parsed as string[];
            } else {
              input = inputRaw;
            }
          } catch {
            input = inputRaw;
          }

          const body: Record<string, unknown> = {
            model: "caedral-embed",
            input,
          };

          const response = await caedralRequest<IDataObject>(
            this, baseUrl, apiKey, "POST", "/v1/embeddings", body,
          );

          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "audioGeneration") {
          const inputText = this.getNodeParameter("audioInput", itemIndex) as string;
          const voice = this.getNodeParameter("audioVoice", itemIndex) as string;

          if (!inputText.trim()) {
            throw new NodeOperationError(this.getNode(), "Input text is required.", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model: "caedral-voice",
            input: inputText.trim(),
            voice,
          };

          const response = await caedralRequest<IDataObject>(
            this, baseUrl, apiKey, "POST", "/v1/audio/speech", body,
          );

          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "rerank") {
          const query = this.getNodeParameter("rerankQuery", itemIndex) as string;
          const docsRaw = this.getNodeParameter("rerankDocuments", itemIndex) as string;
          const topN = this.getNodeParameter("rerankTopN", itemIndex) as number;

          if (!query.trim()) {
            throw new NodeOperationError(this.getNode(), "Query is required.", { itemIndex });
          }

          let documents: string[];
          try {
            const parsed = typeof docsRaw === "string" ? JSON.parse(docsRaw) : docsRaw;
            if (!Array.isArray(parsed)) throw new Error("not array");
            documents = parsed as string[];
          } catch {
            throw new NodeOperationError(
              this.getNode(),
              "Documents must be a valid JSON array of strings.",
              { itemIndex },
            );
          }

          if (documents.length === 0) {
            throw new NodeOperationError(this.getNode(), "At least one document is required.", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model: "caedral-rerank",
            query: query.trim(),
            documents,
          };
          if (topN > 0) body.top_n = topN;

          const response = await caedralRequest<IDataObject>(
            this, baseUrl, apiKey, "POST", "/v1/rerank", body,
          );

          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
          itemIndex,
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: error instanceof Error ? error.message : String(error) },
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (error instanceof NodeApiError || error instanceof NodeOperationError) {
          throw error;
        }

        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
      }
    }

    return [returnData];
  }
}

async function caedralRequest<T>(
  context: IExecuteFunctions,
  baseUrl: string,
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = buildRequestUrl(baseUrl, path);

  try {
    const requestOptions: {
      method: "GET" | "POST";
      url: string;
      headers: Record<string, string>;
      body?: Record<string, unknown>;
      json: boolean;
      returnFullResponse: boolean;
      ignoreHttpStatusErrors: boolean;
    } = {
      method,
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      json: true,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
    };

    if (body !== undefined) {
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.body = body;
    }

    const response = await context.helpers.httpRequest(requestOptions);
    const statusCode = response.statusCode as number;
    const responseBody = response.body as T | CaedralApiErrorBody;

    if (statusCode >= 400) {
      throw new NodeApiError(context.getNode(), {
        message: formatApiErrorMessage(statusCode, responseBody as CaedralApiErrorBody),
        description: JSON.stringify(responseBody, null, 2),
        httpCode: String(statusCode),
      });
    }

    return responseBody as T;
  } catch (error) {
    if (error instanceof NodeApiError) throw error;
    throw new NodeApiError(context.getNode(), {
      message: error instanceof Error ? error.message : "Unexpected error calling Caedral API",
    });
  }
}
