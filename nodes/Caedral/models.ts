import type { ILoadOptionsFunctions, INodePropertyOptions } from "n8n-workflow";
import { NodeOperationError } from "n8n-workflow";

import { CATALOG_LOAD_ERROR, ENDPOINT_PATHS } from "../../shared/constants";
import {
  filterModelsByEndpoint,
  findCatalogModel,
  parseCatalogResponse,
  type CatalogModel,
} from "./catalog";
import { buildRequestUrl, normalizeBaseUrl } from "./helpers";

function optionName(model: CatalogModel, fallback: string): string {
  const label = model.name?.trim() || fallback;
  return model.id && model.id !== label ? `${label} (${model.id})` : label;
}

export function toModelOptions(
  models: CatalogModel[],
  fallbackName: string,
): INodePropertyOptions[] {
  const options = models.map((model) => ({
    name: optionName(model, fallbackName),
    value: model.id,
    description: model.description,
  }));
  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

async function fetchCatalogOrThrow(
  context: ILoadOptionsFunctions,
): Promise<CatalogModel[]> {
  try {
    const credentials = await context.getCredentials("caedralApi");
    const baseUrl = normalizeBaseUrl(
      typeof credentials.baseUrl === "string" ? credentials.baseUrl : undefined,
    );
    const response = await context.helpers.httpRequestWithAuthentication.call(
      context,
      "caedralApi",
      {
        method: "GET",
        url: buildRequestUrl(baseUrl, "/v1/models"),
        json: true,
        ignoreHttpStatusErrors: true,
      },
    );

    const models = parseCatalogResponse(response);
    if (!models) {
      throw new NodeOperationError(context.getNode(), CATALOG_LOAD_ERROR);
    }
    return models;
  } catch {
    throw new NodeOperationError(context.getNode(), CATALOG_LOAD_ERROR);
  }
}

async function optionsForEndpoint(
  context: ILoadOptionsFunctions,
  path: string,
  fallbackName: string,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalogOrThrow(context);
  return toModelOptions(filterModelsByEndpoint(catalog, path), fallbackName);
}

export async function getChatModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return optionsForEndpoint(this, ENDPOINT_PATHS.chatCompletions, "Chat model");
}

export async function getEmbeddingModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return optionsForEndpoint(this, ENDPOINT_PATHS.embeddings, "Embedding model");
}

export async function getRerankModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return optionsForEndpoint(this, ENDPOINT_PATHS.rerank, "Rerank model");
}

export async function getImageModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return optionsForEndpoint(this, ENDPOINT_PATHS.imageGenerations, "Image model");
}

export async function getSpeechModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return optionsForEndpoint(this, ENDPOINT_PATHS.audioSpeech, "Speech model");
}

/** @deprecated Use getSpeechModels. Kept so older node versions that referenced getAudioModels still resolve. */
export const getAudioModels = getSpeechModels;

export async function getTranscriptionModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return optionsForEndpoint(this, ENDPOINT_PATHS.audioTranscriptions, "Transcription model");
}

export async function getVideoModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return optionsForEndpoint(this, ENDPOINT_PATHS.videos, "Video model");
}

export async function getCatalogModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalogOrThrow(this);
  return toModelOptions(catalog, "Model");
}

export async function getSpeechVoices(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  let modelId = "";
  try {
    modelId = String(this.getCurrentNodeParameter("audioModel") ?? "").trim();
  } catch {
    return [];
  }
  if (!modelId) return [];

  const catalog = await fetchCatalogOrThrow(this);
  const model = findCatalogModel(catalog, modelId);
  const voices = model?.supported_voices;
  if (!Array.isArray(voices) || voices.length === 0) return [];

  return voices
    .filter((voice): voice is string => typeof voice === "string" && voice.trim().length > 0)
    .map((voice) => ({ name: voice, value: voice }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
