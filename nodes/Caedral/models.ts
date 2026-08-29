import type {
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from "n8n-workflow";

import {
  CHAT_MODEL_IDS,
  EMBEDDING_MODEL_IDS,
  FALLBACK_AUDIO_MODEL_OPTIONS,
  FALLBACK_CHAT_MODEL_OPTIONS,
  FALLBACK_EMBEDDING_MODEL_OPTIONS,
  FALLBACK_IMAGE_MODEL_OPTIONS,
  FALLBACK_RERANK_MODEL_OPTIONS,
  RERANK_MODEL_ID,
  VISION_MODEL_ID,
  VOICE_MODEL_ID,
} from "../../shared/constants";
import { buildRequestUrl, normalizeBaseUrl, type CatalogModel } from "./helpers";

function optionName(model: CatalogModel, fallback: string): string {
  const label = model.name?.trim() || fallback;
  return model.id && model.id !== label ? `${label} (${model.id})` : label;
}

function toOptions(models: CatalogModel[], fallbackName: string): INodePropertyOptions[] {
  const options = models.map((model) => ({
    name: optionName(model, fallbackName),
    value: model.id,
    description: model.description,
  }));
  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

function mergeUnique(
  preferred: INodePropertyOptions[],
  extra: INodePropertyOptions[],
): INodePropertyOptions[] {
  const seen = new Set(preferred.map((option) => option.value));
  const merged = [...preferred];
  for (const option of extra) {
    if (!seen.has(option.value)) {
      merged.push(option);
      seen.add(option.value);
    }
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));
  return merged;
}

async function fetchCatalog(context: ILoadOptionsFunctions): Promise<CatalogModel[] | null> {
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

    const body = (response as { data?: CatalogModel[]; body?: { data?: CatalogModel[] } });
    const data = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.body?.data)
        ? body.body.data
        : null;

    if (!data) return null;
    return data.filter((model) => typeof model?.id === "string" && model.id.trim());
  } catch {
    return null;
  }
}

const CHAT_ID_SET = new Set<string>(CHAT_MODEL_IDS);

function endpointPath(model: CatalogModel): string | undefined {
  const path = model.recommended_endpoint?.path;
  return typeof path === "string" && path.trim() ? path : undefined;
}

function isChatModel(model: CatalogModel): boolean {
  const path = endpointPath(model);
  if (path) return path.includes("/chat/completions");
  if (CHAT_ID_SET.has(model.id)) return true;
  if (model.pricing_tier === "specialized") return false;
  return model.pricing_tier === "free" || model.pricing_tier === "paid";
}

function isEmbeddingModel(model: CatalogModel): boolean {
  const path = endpointPath(model);
  if (path) return path.includes("/embeddings");
  return (
    EMBEDDING_MODEL_IDS.includes(model.id as (typeof EMBEDDING_MODEL_IDS)[number]) ||
    model.id.includes("embed")
  );
}

function isRerankModel(model: CatalogModel): boolean {
  const path = endpointPath(model);
  if (path) return path.includes("/rerank");
  return model.id === RERANK_MODEL_ID || model.id.includes("rerank");
}

function isImageModel(model: CatalogModel): boolean {
  const path = endpointPath(model);
  if (path) return path.includes("/images/generations");
  return model.id === VISION_MODEL_ID || model.id.includes("vision");
}

function isAudioModel(model: CatalogModel): boolean {
  const path = endpointPath(model);
  if (path) return path.includes("/audio/speech");
  return model.id === VOICE_MODEL_ID || model.id.includes("voice");
}

export async function getChatModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalog(this);
  if (!catalog) return [...FALLBACK_CHAT_MODEL_OPTIONS];
  const fromApi = toOptions(catalog.filter(isChatModel), "Chat model");
  return mergeUnique(fromApi, [...FALLBACK_CHAT_MODEL_OPTIONS]);
}

export async function getEmbeddingModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalog(this);
  if (!catalog) return [...FALLBACK_EMBEDDING_MODEL_OPTIONS];
  const fromApi = toOptions(catalog.filter(isEmbeddingModel), "Embedding model");
  return mergeUnique(fromApi, [...FALLBACK_EMBEDDING_MODEL_OPTIONS]);
}

export async function getRerankModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalog(this);
  if (!catalog) return [...FALLBACK_RERANK_MODEL_OPTIONS];
  const fromApi = toOptions(catalog.filter(isRerankModel), "Rerank model");
  return mergeUnique(fromApi, [...FALLBACK_RERANK_MODEL_OPTIONS]);
}

export async function getImageModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalog(this);
  if (!catalog) return [...FALLBACK_IMAGE_MODEL_OPTIONS];
  const fromApi = toOptions(catalog.filter(isImageModel), "Image model");
  return mergeUnique(fromApi, [...FALLBACK_IMAGE_MODEL_OPTIONS]);
}

export async function getAudioModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalog(this);
  if (!catalog) return [...FALLBACK_AUDIO_MODEL_OPTIONS];
  const fromApi = toOptions(catalog.filter(isAudioModel), "Audio model");
  return mergeUnique(fromApi, [...FALLBACK_AUDIO_MODEL_OPTIONS]);
}

export async function getCatalogModels(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const catalog = await fetchCatalog(this);
  if (!catalog) {
    return mergeUnique(
      [...FALLBACK_CHAT_MODEL_OPTIONS],
      [
        ...FALLBACK_EMBEDDING_MODEL_OPTIONS,
        ...FALLBACK_RERANK_MODEL_OPTIONS,
        ...FALLBACK_IMAGE_MODEL_OPTIONS,
        ...FALLBACK_AUDIO_MODEL_OPTIONS,
      ],
    );
  }
  return toOptions(catalog, "Model");
}
