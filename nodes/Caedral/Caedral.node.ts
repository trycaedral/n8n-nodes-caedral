import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import {
  EMBEDDING_DIMENSIONS,
  VISION_MODEL_ID,
  VOICE_MODEL_ID,
} from "../../shared/constants";
import {
  buildChatCompletionBody,
  formatUsageForOutput,
  inferResourceFromOperation,
  normalizeBaseUrl,
  parseChatCompletionResponse,
  parseDocumentsJson,
  parseEmbeddingInput,
  type ChatCompletionResponse,
  type ChatMessage,
  type UsageResponse,
} from "./helpers";
import {
  getAudioModels,
  getCatalogModels,
  getChatModels,
  getEmbeddingModels,
  getImageModels,
  getRerankModels,
} from "./models";
import { caedralProperties } from "./properties";
import { caedralRequest } from "./transport";

type CaedralCredentials = {
  baseUrl?: string;
};

type ChatOptions = {
  frequencyPenalty?: number;
  presencePenalty?: number;
  responseFormat?: string;
  stop?: string;
  toolChoice?: string;
  toolsJson?: string | unknown[];
  topP?: number;
  user?: string;
};

function toExecutionError(
  context: IExecuteFunctions,
  error: unknown,
  itemIndex: number,
): NodeApiError | NodeOperationError {
  if (error instanceof NodeApiError) {
    const payload: { message: string; httpCode?: string; description?: string } = {
      message: error.message,
    };
    if (error.httpCode) payload.httpCode = error.httpCode;
    if (error.description) payload.description = error.description;
    return new NodeApiError(context.getNode(), payload, {
      message: error.message,
      httpCode: error.httpCode ?? undefined,
      description: error.description ?? undefined,
      itemIndex,
    });
  }

  if (error instanceof NodeOperationError) {
    return new NodeOperationError(context.getNode(), error.message, { itemIndex });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new NodeOperationError(context.getNode(), message, { itemIndex });
}

function errorOutputJson(error: unknown): IDataObject {
  const payload: IDataObject = {
    error: error instanceof Error ? error.message : String(error),
  };
  if (error instanceof NodeApiError && error.httpCode) {
    payload.httpCode = error.httpCode;
  }
  return payload;
}

function parseStopSequences(raw?: string): string | string[] | undefined {
  if (!raw?.trim()) return undefined;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : parts;
}

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
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description:
      "Call Caedral AI — chat (Base/Titan/Olympus/Primordial), vision, embed, voice, rerank, and account APIs. API usage bills from prepaid balance",
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
    properties: caedralProperties,
  };

  methods = {
    loadOptions: {
      getChatModels,
      getEmbeddingModels,
      getRerankModels,
      getImageModels,
      getAudioModels,
      getCatalogModels,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = (await this.getCredentials("caedralApi")) as CaedralCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const operation = this.getNodeParameter("operation", itemIndex) as string;
        const resourceParam = this.getNodeParameter("resource", itemIndex, "") as string;
        const resource = resourceParam || inferResourceFromOperation(operation);

        if (operation === "listModels" || (resource === "models" && operation === "listModels")) {
          const response = await caedralRequest<{ object?: string; data: IDataObject[] }>(
            this,
            { baseUrl, method: "GET", path: "/v1/models", itemIndex },
          );
          returnData.push({
            json: {
              object: response.object ?? "list",
              data: response.data,
              models: response.data,
            } as IDataObject,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "getModel") {
          const modelId = this.getNodeParameter("modelId", itemIndex) as string;
          if (!modelId?.trim()) {
            throw new NodeOperationError(this.getNode(), "Model ID is required", { itemIndex });
          }
          const response = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "GET",
            path: `/v1/models/${encodeURIComponent(modelId.trim())}`,
            itemIndex,
          });
          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "getUsage" || operation === "getAccountInfo") {
          const usage = await caedralRequest<UsageResponse>(this, {
            baseUrl,
            method: "GET",
            path: "/v1/usage",
            itemIndex,
          });
          returnData.push({
            json: formatUsageForOutput(usage) as IDataObject,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "chatCompletion") {
          const model = this.getNodeParameter("model", itemIndex) as string;
          const messageMode = this.getNodeParameter("messageMode", itemIndex, "simple") as
            | "simple"
            | "json";
          const message =
            messageMode === "simple"
              ? (this.getNodeParameter("message", itemIndex, "") as string)
              : "";
          const messagesJson =
            messageMode === "json"
              ? this.getNodeParameter("messagesJson", itemIndex, "[]")
              : undefined;
          const temperature = this.getNodeParameter("temperature", itemIndex, 1) as number;
          const maxTokens = this.getNodeParameter("maxTokens", itemIndex, 0) as number;
          const systemPrompt =
            messageMode === "simple"
              ? (this.getNodeParameter("systemPrompt", itemIndex, "") as string)
              : "";
          const chatOptions = this.getNodeParameter("chatOptions", itemIndex, {}) as ChatOptions;

          const body = buildChatCompletionBody({
            model,
            messageMode,
            message,
            messagesJson: messagesJson as string | ChatMessage[] | undefined,
            temperature: temperature === 1 ? undefined : temperature,
            maxTokens: maxTokens > 0 ? maxTokens : undefined,
            systemPrompt: systemPrompt?.trim() || undefined,
            topP: chatOptions.topP && chatOptions.topP > 0 ? chatOptions.topP : undefined,
            presencePenalty:
              chatOptions.presencePenalty && chatOptions.presencePenalty !== 0
                ? chatOptions.presencePenalty
                : undefined,
            frequencyPenalty:
              chatOptions.frequencyPenalty && chatOptions.frequencyPenalty !== 0
                ? chatOptions.frequencyPenalty
                : undefined,
            stop: parseStopSequences(chatOptions.stop),
            user: chatOptions.user,
            toolsJson: chatOptions.toolsJson,
            toolChoice: chatOptions.toolChoice,
            responseFormat: chatOptions.responseFormat,
            itemIndex,
          });

          const response = await caedralRequest<ChatCompletionResponse>(this, {
            baseUrl,
            method: "POST",
            path: "/v1/chat/completions",
            body: body as unknown as Record<string, unknown>,
            itemIndex,
          });

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
          const size = this.getNodeParameter("imageSize", itemIndex, "1024x1024") as string;
          const n = this.getNodeParameter("imageN", itemIndex, 1) as number;
          const model = this.getNodeParameter("imageModel", itemIndex, VISION_MODEL_ID) as string;

          if (!prompt.trim()) {
            throw new NodeOperationError(this.getNode(), "Prompt is required", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model: model || VISION_MODEL_ID,
            prompt: prompt.trim(),
            size,
          };
          if (n > 1) body.n = n;

          const response = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "POST",
            path: "/v1/images/generations",
            body,
            itemIndex,
          });

          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "createEmbedding") {
          const inputRaw = this.getNodeParameter("embeddingInput", itemIndex) as string;
          const model = this.getNodeParameter(
            "embeddingModel",
            itemIndex,
            "caedral-embed-e1-small-v1",
          ) as string;
          const inputType = this.getNodeParameter(
            "embeddingInputType",
            itemIndex,
            "document",
          ) as string;
          const encodingFormat = this.getNodeParameter(
            "embeddingEncodingFormat",
            itemIndex,
            "float",
          ) as string;
          const input = parseEmbeddingInput(inputRaw, itemIndex);

          const body: Record<string, unknown> = {
            model,
            dimensions: EMBEDDING_DIMENSIONS,
            input,
            input_type: inputType,
            encoding_format: encodingFormat,
          };

          const response = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "POST",
            path: "/v1/embeddings",
            body,
            itemIndex,
          });

          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "audioGeneration") {
          const inputText = this.getNodeParameter("audioInput", itemIndex) as string;
          const voiceChoice = this.getNodeParameter("audioVoice", itemIndex, "alloy") as string;
          const customVoice = this.getNodeParameter("audioVoiceCustom", itemIndex, "") as string;
          const model = this.getNodeParameter("audioModel", itemIndex, VOICE_MODEL_ID) as string;
          const voice =
            voiceChoice === "custom" ? customVoice.trim() || "alloy" : voiceChoice;

          if (!inputText.trim()) {
            throw new NodeOperationError(this.getNode(), "Input text is required", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model: model || VOICE_MODEL_ID,
            input: inputText.trim(),
            voice,
          };

          const response = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "POST",
            path: "/v1/audio/speech",
            body,
            itemIndex,
          });

          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "rerank") {
          const model = this.getNodeParameter("rerankModel", itemIndex, "caedral-rerank") as string;
          const query = this.getNodeParameter("rerankQuery", itemIndex) as string;
          const docsRaw = this.getNodeParameter("rerankDocuments", itemIndex);
          const topN = this.getNodeParameter("rerankTopN", itemIndex, 5) as number;
          const minScore = this.getNodeParameter("rerankMinScore", itemIndex, 0) as number;

          if (!query.trim()) {
            throw new NodeOperationError(this.getNode(), "Query is required", { itemIndex });
          }

          const documents = parseDocumentsJson(docsRaw, itemIndex);

          const body: Record<string, unknown> = {
            model,
            query: query.trim(),
            documents,
            top_n: Math.min(topN, documents.length),
          };

          const response = await caedralRequest<{
            model: string;
            results: Array<{ index: number; relevance_score: number }>;
          }>(this, {
            baseUrl,
            method: "POST",
            path: "/v1/rerank",
            body,
            itemIndex,
          });

          const results = (response.results ?? [])
            .filter((result) => result.relevance_score >= minScore)
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, topN);

          returnData.push({
            json: {
              model: response.model,
              results,
              documents: results.map((result) => ({
                index: result.index,
                document: documents[result.index],
                relevance_score: result.relevance_score,
              })),
            } as IDataObject,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
          itemIndex,
        });
      } catch (error) {
        const wrapped = toExecutionError(this, error, itemIndex);
        if (this.continueOnFail()) {
          returnData.push({
            json: errorOutputJson(wrapped),
            pairedItem: { item: itemIndex },
          });
          continue;
        }
        throw toExecutionError(this, error, itemIndex);
      }
    }

    return [returnData];
  }
}
