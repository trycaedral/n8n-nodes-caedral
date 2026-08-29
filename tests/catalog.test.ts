import { describe, expect, it } from "vitest";

import {
  catalogOptionLabel,
  distinctEndpointPaths,
  filterModelsByEndpoint,
  modelUsesEndpoint,
  parseCatalogResponse,
  toCatalogSelectOptions,
  type CatalogModel,
} from "../nodes/Caedral/catalog";
import { ENDPOINT_PATHS } from "../shared/constants";

const SAMPLE_CATALOG: CatalogModel[] = [
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.chatCompletions },
  },
  {
    id: "caedral-embed-e1-small-v1",
    name: "Caedral E1 Small",
    recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.embeddings },
    supported_parameters: ["dimensions", "encoding_format", "input_type"],
  },
  {
    id: "BAAI/bge-reranker-v2-m3",
    name: "Caedral Rerank",
    recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.rerank },
  },
  {
    id: "black-forest-labs/flux.2-flex",
    name: "FLUX.2 Flex",
    recommended_endpoint: {
      method: "POST",
      path: ENDPOINT_PATHS.imageGenerations,
      aliases: ["/v1/images"],
    },
  },
  {
    id: "caedral-voice-1",
    name: "Caedral Voice V1",
    recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.audioSpeech },
    supported_parameters: ["voice", "speed", "response_format"],
  },
  {
    id: "deepgram/nova-3",
    name: "Nova-3",
    recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.audioTranscriptions },
  },
  {
    id: "alibaba/wan-2.6",
    name: "Wan 2.6",
    recommended_endpoint: {
      method: "POST",
      path: ENDPOINT_PATHS.videos,
      async: true,
      status_path: "/v1/videos/{id}",
      content_path: "/v1/videos/{id}/content",
    },
  },
  {
    id: "future-lab/widget-1",
    name: "Widget 1",
    recommended_endpoint: { method: "POST", path: "/v1/widgets" },
  },
  {
    id: "caedral-base",
    name: "Obsolete branded ID without an endpoint",
  },
];

describe("parseCatalogResponse", () => {
  it("reads the public list envelope", () => {
    const parsed = parseCatalogResponse({ object: "list", data: SAMPLE_CATALOG });
    expect(parsed).toHaveLength(SAMPLE_CATALOG.length);
  });

  it("reads a returnFullResponse wrapper", () => {
    const parsed = parseCatalogResponse({
      statusCode: 200,
      body: { object: "list", data: SAMPLE_CATALOG },
    });
    expect(parsed?.map((model) => model.id)).toContain("openai/gpt-5-mini");
  });

  it("returns null for HTTP errors and missing data", () => {
    expect(parseCatalogResponse({ statusCode: 502, body: { error: { message: "down" } } })).toBeNull();
    expect(parseCatalogResponse({ object: "list" })).toBeNull();
    expect(parseCatalogResponse(null)).toBeNull();
  });

  it("does not assume a fixed catalog size", () => {
    const parsed = parseCatalogResponse({ data: SAMPLE_CATALOG.slice(0, 2) });
    expect(parsed).toHaveLength(2);
  });
});

describe("endpoint discovery and filtering", () => {
  it("lists distinct recommended_endpoint.path values", () => {
    expect(distinctEndpointPaths(SAMPLE_CATALOG)).toEqual([
      ENDPOINT_PATHS.audioSpeech,
      ENDPOINT_PATHS.audioTranscriptions,
      ENDPOINT_PATHS.chatCompletions,
      ENDPOINT_PATHS.embeddings,
      ENDPOINT_PATHS.imageGenerations,
      ENDPOINT_PATHS.rerank,
      ENDPOINT_PATHS.videos,
      "/v1/widgets",
    ]);
  });

  it("filters chat, embedding, rerank, image, speech, transcription, and video models", () => {
    expect(filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.chatCompletions).map((m) => m.id)).toEqual([
      "openai/gpt-5-mini",
    ]);
    expect(filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.embeddings).map((m) => m.id)).toEqual([
      "caedral-embed-e1-small-v1",
    ]);
    expect(filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.rerank).map((m) => m.id)).toEqual([
      "BAAI/bge-reranker-v2-m3",
    ]);
    expect(filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.imageGenerations).map((m) => m.id)).toEqual([
      "black-forest-labs/flux.2-flex",
    ]);
    expect(filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.audioSpeech).map((m) => m.id)).toEqual([
      "caedral-voice-1",
    ]);
    expect(filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.audioTranscriptions).map((m) => m.id)).toEqual([
      "deepgram/nova-3",
    ]);
    expect(filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.videos).map((m) => m.id)).toEqual([
      "alibaba/wan-2.6",
    ]);
  });

  it("keeps unknown endpoint models out of known modality filters", () => {
    const chat = filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.chatCompletions);
    expect(chat.every((model) => model.id !== "future-lab/widget-1")).toBe(true);
    expect(modelUsesEndpoint(SAMPLE_CATALOG[7]!, "/v1/widgets")).toBe(true);
  });

  it("does not treat obsolete branded IDs as chat models without matching metadata", () => {
    const chat = filterModelsByEndpoint(SAMPLE_CATALOG, ENDPOINT_PATHS.chatCompletions);
    expect(chat.every((model) => model.id !== "caedral-base")).toBe(true);
  });

  it("matches image aliases to /v1/images/generations", () => {
    const aliasOnly: CatalogModel = {
      id: "lab/image-alias",
      recommended_endpoint: { path: "/v1/images", aliases: [ENDPOINT_PATHS.imageGenerations] },
    };
    expect(modelUsesEndpoint(aliasOnly, ENDPOINT_PATHS.imageGenerations)).toBe(true);
  });
});

describe("catalog option labels", () => {
  it("uses display name and provider when present, and keeps the exact API id as the value", () => {
    const model: CatalogModel = {
      id: "minimax/minimax-m3:free",
      display_name: "MiniMax M3",
      provider: "MiniMax",
      recommended_endpoint: { path: ENDPOINT_PATHS.chatCompletions },
    };
    expect(catalogOptionLabel(model)).toBe("MiniMax M3 — MiniMax");
    expect(toCatalogSelectOptions([model])).toEqual([
      {
        name: "MiniMax M3 — MiniMax",
        value: "minimax/minimax-m3:free",
      },
    ]);
  });

  it("falls back to name and owned_by, then to the raw id", () => {
    expect(
      catalogOptionLabel({
        id: "minimax/minimax-m3:free",
        name: "MiniMax M3",
        owned_by: "minimax",
      }),
    ).toBe("MiniMax M3 — minimax");
    expect(catalogOptionLabel({ id: "future-provider/model-xyz-2030" })).toBe(
      "future-provider/model-xyz-2030",
    );
    expect(
      catalogOptionLabel({
        id: "minimax/minimax-m3:free",
        name: "MiniMax M3",
      }),
    ).toBe("MiniMax M3 — minimax");
  });

  it("never mutates the stored model id", () => {
    const id = "~anthropic/claude-fable-latest";
    const options = toCatalogSelectOptions([
      { id, name: "Claude Fable Latest", owned_by: "~anthropic" },
    ]);
    expect(options[0]?.value).toBe(id);
  });
});
