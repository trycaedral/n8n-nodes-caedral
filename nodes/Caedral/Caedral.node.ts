import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from "n8n-workflow";

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
  getCatalogModels,
  getChatModels,
  getEmbeddingModels,
  getImageModels,
  getRerankModels,
  getSpeechModels,
  getSpeechVoices,
  getTranscriptionModels,
  getVideoModels,
} from "./models";
import { caedralProperties } from "./properties";
import { caedralRequest, caedralRequestBinary } from "./transport";

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

type ImageOptions = {
  n?: number;
  seed?: number;
  size?: string;
};

type SpeechOptions = {
  responseFormat?: string;
  speed?: number;
};

type VideoOptions = {
  aspectRatio?: string;
  duration?: number;
  generateAudio?: boolean;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  resolution?: string;
  seed?: number;
  size?: string;
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

function requireModelId(
  context: IExecuteFunctions,
  value: unknown,
  itemIndex: number,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new NodeOperationError(
      context.getNode(),
      "Model is required. Choose a catalog model or set a model ID with an expression.",
      { itemIndex },
    );
  }
  return value.trim();
}

function videoJobId(payload: IDataObject): string | undefined {
  const id = payload.id ?? payload.generation_id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function videoStatus(payload: IDataObject): string {
  return typeof payload.status === "string" ? payload.status.toLowerCase() : "";
}

function isVideoTerminalSuccess(status: string): boolean {
  return status === "completed" || status === "succeeded";
}

function isVideoTerminalFailure(status: string): boolean {
  return status === "failed" || status === "cancelled" || status === "canceled" || status === "expired" || status === "error";
}

export class Caedral implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Caedral",
    name: "caedral",
    icon: {
      light: "file:caedral.svg",
      dark: "file:caedral.dark.svg",
    },
    group: ["transform"],
    version: 2,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description:
      "Call Caedral AI — chat, embeddings, rerank, image, speech, transcription, video, models, and prepaid account APIs. API usage bills from prepaid balance",
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
      getSpeechModels,
      getAudioModels: getSpeechModels,
      getTranscriptionModels,
      getVideoModels,
      getCatalogModels,
      getSpeechVoices,
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
          const modelId = requireModelId(this, this.getNodeParameter("modelId", itemIndex), itemIndex);
          const response = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "GET",
            path: `/v1/models/${encodeURIComponent(modelId)}`,
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
          const model = requireModelId(this, this.getNodeParameter("model", itemIndex), itemIndex);
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
          const model = requireModelId(
            this,
            this.getNodeParameter("imageModel", itemIndex, ""),
            itemIndex,
          );
          const imageOptions = this.getNodeParameter("imageOptions", itemIndex, {}) as ImageOptions;
          const legacySize = this.getNodeParameter("imageSize", itemIndex, "") as string;
          const legacyN = this.getNodeParameter("imageN", itemIndex, 0) as number;

          if (!prompt.trim()) {
            throw new NodeOperationError(this.getNode(), "Prompt is required", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model,
            prompt: prompt.trim(),
          };
          const size = imageOptions.size?.trim() || (typeof legacySize === "string" ? legacySize.trim() : "");
          if (size) body.size = size;
          const n = typeof imageOptions.n === "number" ? imageOptions.n : legacyN;
          if (typeof n === "number" && n > 1) body.n = n;
          if (typeof imageOptions.seed === "number" && imageOptions.seed !== 0) {
            body.seed = imageOptions.seed;
          }

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
          const model = requireModelId(
            this,
            this.getNodeParameter("embeddingModel", itemIndex, ""),
            itemIndex,
          );
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
          const dimensions = this.getNodeParameter("embeddingDimensions", itemIndex, 0) as number;
          const input = parseEmbeddingInput(inputRaw, itemIndex);

          const body: Record<string, unknown> = {
            model,
            input,
            input_type: inputType,
            encoding_format: encodingFormat,
          };
          if (typeof dimensions === "number" && dimensions > 0) {
            body.dimensions = dimensions;
          }

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
          const model = requireModelId(
            this,
            this.getNodeParameter("audioModel", itemIndex, ""),
            itemIndex,
          );
          const voiceChoice = (this.getNodeParameter("audioVoice", itemIndex, "") as string).trim();
          const customVoice = (this.getNodeParameter("audioVoiceCustom", itemIndex, "") as string).trim();
          const voice = voiceChoice === "custom" ? customVoice : voiceChoice;
          const speechOptions = this.getNodeParameter("speechOptions", itemIndex, {}) as SpeechOptions;

          if (!inputText.trim()) {
            throw new NodeOperationError(this.getNode(), "Input text is required", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model,
            input: inputText.trim(),
          };
          if (voice) body.voice = voice;
          if (speechOptions.responseFormat?.trim()) {
            body.response_format = speechOptions.responseFormat.trim();
          }
          if (typeof speechOptions.speed === "number" && speechOptions.speed !== 1) {
            body.speed = speechOptions.speed;
          }

          const audio = await caedralRequestBinary(this, {
            baseUrl,
            method: "POST",
            path: "/v1/audio/speech",
            body,
            itemIndex,
            fallbackMimeType: "audio/wav",
            fallbackFileName: "speech.wav",
          });

          const binary = await this.helpers.prepareBinaryData(
            audio.buffer,
            audio.fileName,
            audio.mimeType,
          );
          returnData.push({
            json: { model, voice: voice || null, mimeType: audio.mimeType } as IDataObject,
            binary: { data: binary },
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "audioTranscription") {
          const model = requireModelId(
            this,
            this.getNodeParameter("transcriptionModel", itemIndex, ""),
            itemIndex,
          );
          const source = this.getNodeParameter(
            "transcriptionSource",
            itemIndex,
            "binary",
          ) as "binary" | "url";

          if (source === "url") {
            const fileUrl = (this.getNodeParameter("transcriptionUrl", itemIndex, "") as string).trim();
            if (!fileUrl) {
              throw new NodeOperationError(this.getNode(), "Audio URL is required", { itemIndex });
            }
            const response = await caedralRequest<IDataObject>(this, {
              baseUrl,
              method: "POST",
              path: "/v1/audio/transcriptions",
              body: { model, file: fileUrl },
              itemIndex,
            });
            returnData.push({
              json: response,
              pairedItem: { item: itemIndex },
            });
            continue;
          }

          const binaryPropertyName = this.getNodeParameter(
            "transcriptionBinaryProperty",
            itemIndex,
            "data",
          ) as string;
          const binaryMeta = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
          const fileBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
          const form = new FormData();
          form.append("model", model);
          form.append(
            "file",
            new Blob([fileBuffer], {
              type: binaryMeta.mimeType || "application/octet-stream",
            }),
            binaryMeta.fileName || "audio",
          );

          const response = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "POST",
            path: "/v1/audio/transcriptions",
            body: form,
            itemIndex,
          });
          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "rerank") {
          const model = requireModelId(
            this,
            this.getNodeParameter("rerankModel", itemIndex, ""),
            itemIndex,
          );
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

        if (operation === "videoGeneration") {
          const model = requireModelId(
            this,
            this.getNodeParameter("videoModel", itemIndex, ""),
            itemIndex,
          );
          const prompt = this.getNodeParameter("videoPrompt", itemIndex) as string;
          const waitForCompletion = this.getNodeParameter(
            "videoWaitForCompletion",
            itemIndex,
            false,
          ) as boolean;
          const videoOptions = this.getNodeParameter("videoOptions", itemIndex, {}) as VideoOptions;

          if (!prompt.trim()) {
            throw new NodeOperationError(this.getNode(), "Prompt is required", { itemIndex });
          }

          const body: Record<string, unknown> = {
            model,
            prompt: prompt.trim(),
          };
          if (videoOptions.aspectRatio?.trim()) body.aspect_ratio = videoOptions.aspectRatio.trim();
          if (typeof videoOptions.duration === "number" && videoOptions.duration > 0) {
            body.duration = videoOptions.duration;
          }
          if (typeof videoOptions.generateAudio === "boolean") {
            body.generate_audio = videoOptions.generateAudio;
          }
          if (videoOptions.resolution?.trim()) body.resolution = videoOptions.resolution.trim();
          if (typeof videoOptions.seed === "number" && videoOptions.seed !== 0) {
            body.seed = videoOptions.seed;
          }
          if (videoOptions.size?.trim()) body.size = videoOptions.size.trim();

          let job = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "POST",
            path: "/v1/videos",
            body,
            itemIndex,
          });

          if (waitForCompletion) {
            const id = videoJobId(job);
            if (!id) {
              throw new NodeOperationError(
                this.getNode(),
                "Video job did not return an id to poll",
                { itemIndex },
              );
            }
            const interval = videoOptions.pollIntervalMs && videoOptions.pollIntervalMs > 0
              ? videoOptions.pollIntervalMs
              : 2000;
            const timeout = videoOptions.pollTimeoutMs && videoOptions.pollTimeoutMs > 0
              ? videoOptions.pollTimeoutMs
              : 300000;
            const deadline = Date.now() + timeout;

            while (!isVideoTerminalSuccess(videoStatus(job))) {
              if (isVideoTerminalFailure(videoStatus(job))) {
                throw new NodeOperationError(
                  this.getNode(),
                  `Video job ${id} ended with status ${videoStatus(job) || "unknown"}`,
                  { itemIndex },
                );
              }
              if (Date.now() >= deadline) {
                throw new NodeOperationError(
                  this.getNode(),
                  `Timed out waiting for video job ${id}`,
                  { itemIndex },
                );
              }
              await sleep(interval);
              job = await caedralRequest<IDataObject>(this, {
                baseUrl,
                method: "GET",
                path: `/v1/videos/${encodeURIComponent(id)}`,
                itemIndex,
              });
            }
          }

          returnData.push({
            json: job,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "getVideoStatus") {
          const id = (this.getNodeParameter("videoId", itemIndex) as string).trim();
          if (!id) {
            throw new NodeOperationError(this.getNode(), "Video ID is required", { itemIndex });
          }
          const response = await caedralRequest<IDataObject>(this, {
            baseUrl,
            method: "GET",
            path: `/v1/videos/${encodeURIComponent(id)}`,
            itemIndex,
          });
          returnData.push({
            json: response,
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (operation === "getVideoContent") {
          const id = (this.getNodeParameter("videoId", itemIndex) as string).trim();
          if (!id) {
            throw new NodeOperationError(this.getNode(), "Video ID is required", { itemIndex });
          }
          const video = await caedralRequestBinary(this, {
            baseUrl,
            method: "GET",
            path: `/v1/videos/${encodeURIComponent(id)}/content`,
            itemIndex,
            fallbackMimeType: "video/mp4",
            fallbackFileName: `${id}.mp4`,
          });
          const binary = await this.helpers.prepareBinaryData(
            video.buffer,
            video.fileName,
            video.mimeType,
          );
          returnData.push({
            json: { id, mimeType: video.mimeType } as IDataObject,
            binary: { data: binary },
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
