import { describe, expect, it, vi } from "vitest";
import { NodeOperationError } from "n8n-workflow";

import { Caedral } from "../nodes/Caedral/Caedral.node";
import { CaedralChatModel } from "../nodes/CaedralChatModel/CaedralChatModel.node";
import { CaedralEmbeddings } from "../nodes/CaedralEmbeddings/CaedralEmbeddings.node";
import { ENDPOINT_PATHS } from "../shared/constants";
import {
  fetchLiveCatalog,
  getCatalogModels,
  getChatModels,
  getEmbeddingModels,
  getImageModels,
  getRerankModels,
  getSpeechModels,
  getSpeechVoices,
  getTranscriptionModels,
  getVideoModels,
} from "../nodes/Caedral/models";
import { FAKE_CREDENTIAL_KEY } from "./fake-credentials";

const FUTURE_CHAT_ID = "future-provider/model-xyz-2030";

const CATALOG = {
  object: "list",
  data: [
    {
      id: "openai/gpt-5-mini",
      name: "GPT-5 Mini",
      owned_by: "openai",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.chatCompletions },
    },
    {
      id: FUTURE_CHAT_ID,
      name: "Model XYZ 2030",
      owned_by: "future-provider",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.chatCompletions },
    },
    {
      id: "caedral-embed-e1-small-v1",
      name: "Caedral E1 Small",
      owned_by: "caedral",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.embeddings },
    },
    {
      id: "future-provider/embed-xyz-2030",
      name: "Embed XYZ 2030",
      owned_by: "future-provider",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.embeddings },
    },
    {
      id: "BAAI/bge-reranker-v2-m3",
      name: "BGE Reranker",
      owned_by: "caedral",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.rerank },
    },
    {
      id: "black-forest-labs/flux.2-flex",
      name: "FLUX.2 Flex",
      owned_by: "black-forest-labs",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.imageGenerations },
    },
    {
      id: "caedral-voice-1",
      name: "Caedral Voice V1",
      owned_by: "caedral",
      supported_voices: ["caedral-f1", "caedral-m1"],
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.audioSpeech },
    },
    {
      id: "future-tts/provider-model",
      name: "Provider TTS 2030",
      owned_by: "future-tts",
      supported_voices: ["nova-2030", "orion-2030"],
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.audioSpeech },
    },
    {
      id: "deepgram/nova-3",
      name: "Nova-3",
      owned_by: "deepgram",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.audioTranscriptions },
    },
    {
      id: "alibaba/wan-2.6",
      name: "Wan 2.6",
      owned_by: "alibaba",
      recommended_endpoint: { method: "POST", path: ENDPOINT_PATHS.videos },
    },
    {
      id: "future-lab/widget-1",
      name: "Widget",
      owned_by: "future-lab",
      recommended_endpoint: { method: "POST", path: "/v1/widgets" },
    },
  ],
};

function loadContext(
  response: unknown = CATALOG,
  extras?: {
    fail?: boolean;
    modelId?: string;
    baseUrl?: string;
    byUrl?: (url: string) => unknown;
  },
) {
  const httpRequestWithAuthentication = extras?.fail
    ? vi.fn()
    : vi.fn(async (_credentialName: string, request: { url: string }) => {
        if (extras?.byUrl) return extras.byUrl(request.url);
        return response;
      });
  return {
    getCredentials: extras?.fail
      ? vi.fn().mockRejectedValue(new Error("missing credentials"))
      : vi.fn().mockResolvedValue({
          apiKey: FAKE_CREDENTIAL_KEY,
          baseUrl: extras?.baseUrl ?? "https://api.caedral.com",
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
      httpRequestWithAuthentication,
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
  it("registers the shared loaders on the main node, chat model, and embeddings", () => {
    const main = new Caedral();
    const chat = new CaedralChatModel();
    const embeddings = new CaedralEmbeddings();
    expect(main.methods.loadOptions.getChatModels).toBe(getChatModels);
    expect(chat.methods.loadOptions.getChatModels).toBe(getChatModels);
    expect(embeddings.methods.loadOptions.getEmbeddingModels).toBe(getEmbeddingModels);
    expect(main.methods.loadOptions.getTranscriptionModels).toBe(getTranscriptionModels);
    expect(main.methods.loadOptions.getVideoModels).toBe(getVideoModels);
  });

  it("fetches GET /v1/models from the credential base URL", async () => {
    const context = loadContext();
    await getChatModels.call(context as never);
    expect(context.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
      "caedralApi",
      expect.objectContaining({
        method: "GET",
        url: "https://api.caedral.com/v1/models",
        timeout: 20_000,
      }),
    );
  });

  it("queries the configured base URL instead of assuming production", async () => {
    const context = loadContext(CATALOG, { baseUrl: "http://localhost:5001/" });
    await fetchLiveCatalog(context as never);
    expect(context.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
      "caedralApi",
      expect.objectContaining({
        url: "http://localhost:5001/v1/models",
      }),
    );
  });

  it("takes option values from the live API ids without rewriting them", async () => {
    const context = loadContext();
    const chat = await getChatModels.call(context as never);
    const future = chat.find((option) => option.value === FUTURE_CHAT_ID);
    expect(future?.value).toBe(FUTURE_CHAT_ID);
    expect(chat.find((option) => option.value === "openai/gpt-5-mini")?.name).toBe(
      "GPT-5 Mini — openai",
    );
  });

  it("includes unknown future chat ids returned by the catalog with no code change", async () => {
    const context = loadContext();
    const chat = await getChatModels.call(context as never);
    expect(chat.some((option) => option.value === FUTURE_CHAT_ID)).toBe(true);
    expect(chat.find((option) => option.value === FUTURE_CHAT_ID)?.name).toBe(
      "Model XYZ 2030 — future-provider",
    );
  });

  it("does not include a model after the live catalog omits it", async () => {
    const removed = {
      object: "list",
      data: CATALOG.data.filter((model) => model.id !== "openai/gpt-5-mini"),
    };
    const context = loadContext(removed);
    const chat = await getChatModels.call(context as never);
    expect(chat.every((option) => option.value !== "openai/gpt-5-mini")).toBe(true);
    expect(chat.some((option) => option.value === FUTURE_CHAT_ID)).toBe(true);
  });

  it("refetches the catalog on every loadOptions call instead of caching a snapshot", async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({
        object: "list",
        data: [
          {
            id: "first/pass",
            name: "First",
            recommended_endpoint: { path: ENDPOINT_PATHS.chatCompletions },
          },
        ],
      })
      .mockResolvedValueOnce({
        object: "list",
        data: [
          {
            id: FUTURE_CHAT_ID,
            name: "Second",
            recommended_endpoint: { path: ENDPOINT_PATHS.chatCompletions },
          },
        ],
      });
    const context = {
      getCredentials: vi.fn().mockResolvedValue({
        apiKey: FAKE_CREDENTIAL_KEY,
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
      helpers: { httpRequestWithAuthentication },
    };

    const first = await getChatModels.call(context as never);
    const second = await getChatModels.call(context as never);
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
    expect(first.map((option) => option.value)).toEqual(["first/pass"]);
    expect(second.map((option) => option.value)).toEqual([FUTURE_CHAT_ID]);
  });

  it("throws a safe error when the catalog request fails instead of returning obsolete IDs", async () => {
    const context = loadContext(undefined, { fail: true });
    await expect(getChatModels.call(context as never)).rejects.toBeInstanceOf(NodeOperationError);
    await expect(getChatModels.call(context as never)).rejects.toThrow(/GET \/v1\/models/);
    try {
      await getChatModels.call(context as never);
      throw new Error("expected catalog load to fail");
    } catch (error) {
      expect(String(error)).not.toContain("cd_live_test");
    }
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
    const all = await getCatalogModels.call(context as never);

    expect(chat.map((option) => option.value).sort()).toEqual(
      ["openai/gpt-5-mini", FUTURE_CHAT_ID].sort(),
    );
    expect(embeddings.map((option) => option.value).sort()).toEqual(
      ["caedral-embed-e1-small-v1", "future-provider/embed-xyz-2030"].sort(),
    );
    expect(rerank.map((option) => option.value)).toEqual(["BAAI/bge-reranker-v2-m3"]);
    expect(image.map((option) => option.value)).toEqual(["black-forest-labs/flux.2-flex"]);
    expect(speech.map((option) => option.value)).toEqual([
      "caedral-voice-1",
      "future-tts/provider-model",
    ]);
    expect(transcription.map((option) => option.value)).toEqual(["deepgram/nova-3"]);
    expect(video.map((option) => option.value)).toEqual(["alibaba/wan-2.6"]);
    expect(all.some((option) => option.value === "future-lab/widget-1")).toBe(true);

    for (const options of [chat, embeddings, rerank, image, speech, transcription, video]) {
      expect(options.every((option) => !LEGACY_IDS.includes(String(option.value)))).toBe(true);
      expect(options.every((option) => option.value !== "future-lab/widget-1")).toBe(true);
    }
  });

  it("does not inject legacy branded chat ids when they are absent from the catalog", async () => {
    const context = loadContext();
    const chat = await getChatModels.call(context as never);
    const all = await getCatalogModels.call(context as never);
    for (const id of LEGACY_IDS) {
      expect(chat.every((option) => option.value !== id)).toBe(true);
      expect(all.every((option) => option.value !== id)).toBe(true);
    }
  });

  it("loads voices from the selected speech model's supported_voices", async () => {
    const context = loadContext(CATALOG, { modelId: "caedral-voice-1" });
    const voices = await getSpeechVoices.call(context as never);
    expect(voices.map((option) => option.value).sort()).toEqual(["caedral-f1", "caedral-m1"]);
    expect(context.helpers.httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
  });

  it("loads a different voice list for a different speech model", async () => {
    const context = loadContext(CATALOG, { modelId: "future-tts/provider-model" });
    const voices = await getSpeechVoices.call(context as never);
    expect(voices.map((option) => option.value).sort()).toEqual(["nova-2030", "orion-2030"]);
    expect(voices.every((option) => !["caedral-f1", "caedral-m1"].includes(String(option.value)))).toBe(
      true,
    );
  });

  it("does not inject a universal static voice list", async () => {
    const context = loadContext(CATALOG, { modelId: "future-tts/provider-model" });
    const voices = await getSpeechVoices.call(context as never);
    const ids = voices.map((option) => option.value);
    for (const stale of ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]) {
      expect(ids).not.toContain(stale);
    }
  });

  it("loads voices from GET /v1/models/:id when the list omits supported_voices", async () => {
    const listWithoutVoices = {
      object: "list",
      data: CATALOG.data.map((model) =>
        model.id === "future-tts/provider-model"
          ? { ...model, supported_voices: undefined }
          : model,
      ),
    };
    const context = loadContext(listWithoutVoices, {
      modelId: "future-tts/provider-model",
      byUrl: (url) => {
        if (url.endsWith("/v1/models")) return listWithoutVoices;
        expect(url).toContain("/v1/models/future-tts%2Fprovider-model");
        return {
          id: "future-tts/provider-model",
          supported_voices: [
            { id: "nova-2030", name: "Nova 2030" },
            { id: "orion-2030", name: "Orion 2030" },
          ],
        };
      },
    });
    const voices = await getSpeechVoices.call(context as never);
    expect(voices).toEqual([
      { name: "Nova 2030", value: "nova-2030" },
      { name: "Orion 2030", value: "orion-2030" },
    ]);
  });

  it("throws when the selected model publishes no voices", async () => {
    const context = loadContext(CATALOG, { modelId: "openai/gpt-5-mini" });
    await expect(getSpeechVoices.call(context as never)).rejects.toBeInstanceOf(NodeOperationError);
    await expect(getSpeechVoices.call(context as never)).rejects.toThrow(/supported_voices/);
  });

  it("returns no voices until a speech model is selected", async () => {
    const context = loadContext(CATALOG, { modelId: "" });
    await expect(getSpeechVoices.call(context as never)).resolves.toEqual([]);
  });
});
