import { describe, expect, it, vi } from "vitest";
import { NodeOperationError } from "n8n-workflow";

import { Caedral } from "../nodes/Caedral/Caedral.node";
import { CaedralChatModel } from "../nodes/CaedralChatModel/CaedralChatModel.node";
import { CaedralEmbeddings } from "../nodes/CaedralEmbeddings/CaedralEmbeddings.node";
import { ENDPOINT_PATHS } from "../shared/constants";
import {
  getChatModels,
  getEmbeddingModels,
  getImageModels,
  getRerankModels,
  getSpeechModels,
  getSpeechVoices,
  getTranscriptionModels,
  getVideoModels,
} from "../nodes/Caedral/models";

const CATALOG = {
  object: "list",
  data: [
    {
      id: "openai/gpt-5-mini",
      name: "GPT-5 Mini",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.chatCompletions },
    },
    {
      id: "caedral-embed-e1-small-v1",
      name: "Caedral E1 Small",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.embeddings },
    },
    {
      id: "BAAI/bge-reranker-v2-m3",
      name: "BGE Reranker",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.rerank },
    },
    {
      id: "black-forest-labs/flux.2-flex",
      name: "FLUX.2 Flex",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.imageGenerations },
    },
    {
      id: "caedral-voice-1",
      name: "Caedral Voice V1",
      supported_voices: ["caedral-f1", "caedral-m1"],
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.audioSpeech },
    },
    {
      id: "deepgram/nova-3",
      name: "Nova-3",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.audioTranscriptions },
    },
    {
      id: "alibaba/wan-2.6",
      name: "Wan 2.6",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.videos },
    },
    {
      id: "future-lab/widget-1",
      name: "Widget",
      recommended_endpoint: { method: "POST", path: "/v1/widgets" },
    },
  ],
};

function loadContext(response: unknown = CATALOG, extras?: { fail?: boolean; modelId?: string }) {
  return {
    getCredentials: extras?.fail
      ? vi.fn().mockRejectedValue(new Error("missing credentials"))
      : vi.fn().mockResolvedValue({
          apiKey: "cd_live_test",
          baseUrl: "https://api.caedral.com",
        }),
    getNode: () => ({
      id: "test-node",
      name: "Caedral",
      type: "caedral",
      typeVersion: 2,
      position: [0, 0],
      parameters: {},
    }),
    getCurrentNodeParameter: vi.fn(() => extras?.modelId ?? "caedral-voice-1"),
    helpers: {
      httpRequestWithAuthentication: vi.fn(async () => response),
    },
  };
}

const LEGACY_IDS = [
  "caedral-base",
  "caedral-titan",
  "caedral-olympus",
  "caedral-primordial",
];

describe("dynamic model loading", () => {
  it("registers loadOptions methods on the main node, chat model, and embeddings", () => {
    const main = new Caedral();
    const chat = new CaedralChatModel();
    const embeddings = new CaedralEmbeddings();
    expect(main.methods.loadOptions.getChatModels).toBe(getChatModels);
    expect(chat.methods.loadOptions.getChatModels).toBe(getChatModels);
    expect(embeddings.methods.loadOptions.getEmbeddingModels).toBe(getEmbeddingModels);
    expect(main.methods.loadOptions.getTranscriptionModels).toBeDefined();
    expect(main.methods.loadOptions.getVideoModels).toBeDefined();
    expect(main.methods.loadOptions.getSpeechVoices).toBeDefined();
    expect(main.description.subtitle).toBe(
      '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    );
  });

  it("throws a safe error when the catalog request fails instead of returning obsolete IDs", async () => {
    const context = loadContext(undefined, { fail: true });
    await expect(getChatModels.call(context as never)).rejects.toBeInstanceOf(NodeOperationError);
    await expect(getChatModels.call(context as never)).rejects.toThrow(/GET \/v1\/models/);
  });

  it("throws when the catalog HTTP envelope is an error", async () => {
    const context = loadContext({
      statusCode: 502,
      body: { error: { message: "upstream" } },
    });
    await expect(getEmbeddingModels.call(context as never)).rejects.toBeInstanceOf(NodeOperationError);
  });

  it("filters each modality from recommended_endpoint.path", async () => {
    const context = loadContext();
    const chat = await getChatModels.call(context as never);
    const embeddings = await getEmbeddingModels.call(context as never);
    const rerank = await getRerankModels.call(context as never);
    const image = await getImageModels.call(context as never);
    const speech = await getSpeechModels.call(context as never);
    const transcription = await getTranscriptionModels.call(context as never);
    const video = await getVideoModels.call(context as never);

    expect(chat.map((option) => option.value)).toEqual(["openai/gpt-5-mini"]);
    expect(embeddings.map((option) => option.value)).toEqual(["caedral-embed-e1-small-v1"]);
    expect(rerank.map((option) => option.value)).toEqual(["BAAI/bge-reranker-v2-m3"]);
    expect(image.map((option) => option.value)).toEqual(["black-forest-labs/flux.2-flex"]);
    expect(speech.map((option) => option.value)).toEqual(["caedral-voice-1"]);
    expect(transcription.map((option) => option.value)).toEqual(["deepgram/nova-3"]);
    expect(video.map((option) => option.value)).toEqual(["alibaba/wan-2.6"]);

    for (const options of [chat, embeddings, rerank, image, speech, transcription, video]) {
      expect(options.every((option) => !LEGACY_IDS.includes(String(option.value)))).toBe(true);
      expect(options.every((option) => option.value !== "future-lab/widget-1")).toBe(true);
    }
  });

  it("loads voices from the selected speech model's supported_voices", async () => {
    const context = loadContext(CATALOG, { modelId: "caedral-voice-1" });
    const voices = await getSpeechVoices.call(context as never);
    expect(voices.map((option) => option.value).sort()).toEqual(["caedral-f1", "caedral-m1"]);
  });

  it("returns no voices when the selected model has none", async () => {
    const context = loadContext(CATALOG, { modelId: "openai/gpt-5-mini" });
    await expect(getSpeechVoices.call(context as never)).resolves.toEqual([]);
  });
});
