import type { ILoadOptionsFunctions, INodePropertyOptions } from "n8n-workflow";
import { NodeOperationError } from "n8n-workflow";

import { CATALOG_LOAD_ERROR, CATALOG_TIMEOUT_MS, CATALOG_VOICE_LOAD_ERROR, ENDPOINT_PATHS } from "../../shared/constants";
import {
  findCatalogModel,
  optionsForEndpoint,
  parseCatalogResponse,
  parseModelDetailResponse,
  parseSupportedVoices,
  toCatalogSelectOptions,
  type CatalogModel,
} from "./catalog";
import { buildRequestUrl, normalizeBaseUrl } from "./helpers";

function asNodeOptions(
  options: ReturnType<typeof toCatalogSelectOptions>,
): INodePropertyOptions[] {
  return options;
}

/**
 * Always hits GET /v1/models for the credential's base URL.
 * No package-level catalog snapshot is stored between calls.
 */
export async function fetchLiveCatalog(
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
        timeout: CATALOG_TIMEOUT_MS,
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

async function loadOptionsForEndpoint(
  context: ILoadOptionsFunctions,
  path: string,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchLiveCatalog(context);
  return asNodeOptions(optionsForEndpoint(catalog, path));
}

export async function getChatModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return loadOptionsForEndpoint(this, ENDPOINT_PATHS.chatCompletions);
}

export async function getEmbeddingModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return loadOptionsForEndpoint(this, ENDPOINT_PATHS.embeddings);
}

export async function getRerankModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return loadOptionsForEndpoint(this, ENDPOINT_PATHS.rerank);
}

export async function getImageModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return loadOptionsForEndpoint(this, ENDPOINT_PATHS.imageGenerations);
}

export async function getSpeechModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return loadOptionsForEndpoint(this, ENDPOINT_PATHS.audioSpeech);
}

/** @deprecated Use getSpeechModels. Kept so older node versions that referenced getAudioModels still resolve. */
export const getAudioModels = getSpeechModels;

export async function getTranscriptionModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return loadOptionsForEndpoint(this, ENDPOINT_PATHS.audioTranscriptions);
}

export async function getVideoModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  return loadOptionsForEndpoint(this, ENDPOINT_PATHS.videos);
}

export async function getCatalogModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchLiveCatalog(this);
  return asNodeOptions(toCatalogSelectOptions(catalog));
}

async function fetchLiveModel(
  context: ILoadOptionsFunctions,
  modelId: string,
): Promise<CatalogModel | null> {
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
        url: buildRequestUrl(baseUrl, `/v1/models/${encodeURIComponent(modelId)}`),
        json: true,
        ignoreHttpStatusErrors: true,
        timeout: CATALOG_TIMEOUT_MS,
      },
    );
    return parseModelDetailResponse(response, modelId);
  } catch {
    return null;
  }
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

  const catalog = await fetchLiveCatalog(this);
  const listed = findCatalogModel(catalog, modelId);
  let voices = parseSupportedVoices(listed?.supported_voices);

  if (voices.length === 0) {
    const detail = await fetchLiveModel(this, modelId);
    voices = parseSupportedVoices(detail?.supported_voices);
  }

  if (voices.length === 0) {
    throw new NodeOperationError(this.getNode(), CATALOG_VOICE_LOAD_ERROR);
  }

  return voices;
}
