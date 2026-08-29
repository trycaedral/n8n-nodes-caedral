import { describe, expect, it, vi } from "vitest";

import { Caedral } from "../nodes/Caedral/Caedral.node";
import { CaedralChatModel } from "../nodes/CaedralChatModel/CaedralChatModel.node";
import { FALLBACK_CHAT_MODEL_OPTIONS } from "../shared/constants";
import { getChatModels, getEmbeddingModels } from "../nodes/Caedral/models";

describe("dynamic model loading", () => {
  it("registers loadOptions methods on the main node and chat model", () => {
    const main = new Caedral();
    const chat = new CaedralChatModel();
    expect(main.methods.loadOptions.getChatModels).toBe(getChatModels);
    expect(chat.methods.loadOptions.getChatModels).toBe(getChatModels);
    expect(main.methods.loadOptions.getEmbeddingModels).toBeDefined();
    expect(main.description.subtitle).toBe(
      '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    );
    expect(chat.description.subtitle).toBe('={{$parameter["model"]}}');
  });

  it("falls back to static chat models when the catalog request fails", async () => {
    const context = {
      getCredentials: vi.fn().mockRejectedValue(new Error("missing credentials")),
      helpers: { httpRequestWithAuthentication: vi.fn() },
    };
    const options = await getChatModels.call(context as never);
    expect(options.map((o) => o.value)).toEqual(
      FALLBACK_CHAT_MODEL_OPTIONS.map((o) => o.value),
    );
  });

  it("maps catalog chat models from GET /v1/models", async () => {
    const context = {
      getCredentials: vi.fn().mockResolvedValue({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      helpers: {
        httpRequestWithAuthentication: vi.fn(async () => ({
          object: "list",
          data: [
            {
              id: "caedral-titan",
              name: "Caedral Titan",
              description: "Production",
              pricing_tier: "paid",
            },
            {
              id: "caedral-embed",
              name: "Caedral E1 Small",
              pricing_tier: "specialized",
            },
          ],
        })),
      },
    };

    const options = await getChatModels.call(context as never);
    expect(options.some((o) => o.value === "caedral-titan")).toBe(true);
    expect(options.some((o) => o.value === "caedral-base")).toBe(true);
    expect(options.every((o) => o.value !== "caedral-embed")).toBe(true);
  });

  it("filters the live catalog by recommended_endpoint.path", async () => {
    const context = {
      getCredentials: vi.fn().mockResolvedValue({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      helpers: {
        httpRequestWithAuthentication: vi.fn(async () => ({
          object: "list",
          data: [
            {
              id: "openai/gpt-5-mini",
              name: "GPT-5 Mini",
              recommended_endpoint: { method: "POST", path: "/v1/chat/completions" },
            },
            {
              id: "caedral-embed-e1-small-v1",
              name: "Caedral E1 Small",
              recommended_endpoint: { method: "POST", path: "/v1/embeddings" },
            },
            {
              id: "BAAI/bge-reranker-v2-m3",
              name: "BGE Reranker",
              recommended_endpoint: { method: "POST", path: "/v1/rerank" },
            },
          ],
        })),
      },
    };

    const chat = await getChatModels.call(context as never);
    expect(chat.some((o) => o.value === "openai/gpt-5-mini")).toBe(true);
    expect(chat.every((o) => o.value !== "caedral-embed-e1-small-v1")).toBe(true);
    expect(chat.some((o) => o.value === "caedral-base")).toBe(true);

    const embeddings = await getEmbeddingModels.call(context as never);
    expect(embeddings.some((o) => o.value === "caedral-embed-e1-small-v1")).toBe(true);
    expect(embeddings.every((o) => o.value !== "openai/gpt-5-mini")).toBe(true);
  });
});
