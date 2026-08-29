import { describe, expect, it, vi } from "vitest";
import { NodeApiError, NodeOperationError } from "n8n-workflow";
import type { IExecuteFunctions } from "n8n-workflow";

import { Caedral } from "../nodes/Caedral/Caedral.node";

const CHAT_RESPONSE = {
  id: "chatcmpl-test",
  model: "caedral-base",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hi there!" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
};

function createContext(
  visibleParams: Record<string, unknown>,
  httpImpl?: () => Promise<{ statusCode: number; body: unknown }>,
  extras?: { continueOnFail?: boolean },
) {
  const httpRequestWithAuthentication = vi.fn(
    async () =>
      httpImpl
        ? await httpImpl()
        : { statusCode: 200, body: CHAT_RESPONSE },
  );

  const context = {
    getInputData: () => [{ json: {} }],
    getCredentials: async () => ({
      apiKey: "cd_live_test",
      baseUrl: "http://localhost:5001",
    }),
    getNodeParameter(name: string, _itemIndex: number, ...fallback: unknown[]) {
      if (name in visibleParams) return visibleParams[name];
      if (fallback.length > 0) return fallback[0];
      throw new Error(`Could not get parameter "${name}"`);
    },
    getNode: () => ({
      id: "test-node",
      name: "Caedral",
      type: "caedral",
      typeVersion: 2,
      position: [0, 0],
      parameters: visibleParams,
    }),
    continueOnFail: () => extras?.continueOnFail ?? false,
    helpers: { httpRequestWithAuthentication },
  } as unknown as IExecuteFunctions;

  return { context, httpRequestWithAuthentication };
}

describe("Caedral node — chatCompletion parameter retrieval", () => {
  it("Simple mode works without messagesJson stored (hidden by displayOptions)", async () => {
    const { context, httpRequestWithAuthentication } = createContext({
      operation: "chatCompletion",
      model: "caedral-base",
      messageMode: "simple",
      message: "Hello!",
      temperature: 1,
      maxTokens: 0,
      systemPrompt: "Be brief.",
    });

    const node = new Caedral();
    const result = await node.execute.call(context);

    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
    const request = httpRequestWithAuthentication.mock.calls[0]?.[1] as unknown as {
      url: string;
      body: { messages: Array<{ role: string; content: string }> };
    };
    expect(request.url).toBe("http://localhost:5001/v1/chat/completions");
    expect(request.body.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hello!" },
    ]);
    expect(result[0]?.[0]?.json.content).toBe("Hi there!");
  });

  it("JSON mode works without message/systemPrompt stored (hidden by displayOptions)", async () => {
    const { context, httpRequestWithAuthentication } = createContext({
      operation: "chatCompletion",
      model: "caedral-base",
      messageMode: "json",
      messagesJson: '[{"role":"user","content":"From JSON"}]',
      temperature: 1,
      maxTokens: 0,
    });

    const node = new Caedral();
    const result = await node.execute.call(context);

    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
    const request = httpRequestWithAuthentication.mock.calls[0]?.[1] as unknown as {
      body: { messages: Array<{ role: string; content: string }> };
    };
    expect(request.body.messages).toEqual([{ role: "user", content: "From JSON" }]);
    expect(result[0]?.[0]?.json.content).toBe("Hi there!");
  });

  it("runs a v1 workflow that omits resource", async () => {
    const { context } = createContext({
      operation: "chatCompletion",
      model: "caedral-base",
      messageMode: "simple",
      message: "Hello!",
      temperature: 1,
      maxTokens: 0,
      systemPrompt: "",
    });

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(result[0]?.[0]?.json.content).toBe("Hi there!");
  });
});

describe("Caedral node — resource operations", () => {
  it("lists models", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      { resource: "models", operation: "listModels" },
      async () => ({
        statusCode: 200,
        body: { object: "list", data: [{ id: "caedral-base" }] },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/models",
      method: "GET",
    });
    expect(result[0]?.[0]?.json.models).toEqual([{ id: "caedral-base" }]);
  });

  it("gets usage without resource (legacy)", async () => {
    const { context } = createContext(
      { operation: "getUsage" },
      async () => ({
        statusCode: 200,
        body: {
          accountStatus: "active",
          balanceCents: 42,
          balanceMilliCents: 42000,
          balanceWeightedUnitsAffordable: 10,
        },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(result[0]?.[0]?.json).toMatchObject({
      accountStatus: "active",
      balanceCents: 42,
      balanceMilliCents: 42000,
    });
  });

  it("creates embeddings", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "ai",
        operation: "createEmbedding",
        embeddingInput: "hello",
      },
      async () => ({
        statusCode: 200,
        body: { model: "caedral-embed", data: [{ embedding: [0.1], index: 0 }] },
      }),
    );

    const node = new Caedral();
    await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/embeddings",
      body: {
        model: "caedral-embed-e1-small-v1",
        dimensions: 384,
        input: "hello",
        input_type: "document",
        encoding_format: "float",
      },
    });
  });

  it("reranks documents", async () => {
    const { context } = createContext(
      {
        resource: "ai",
        operation: "rerank",
        rerankQuery: "capital",
        rerankDocuments: '["Paris is the capital of France.","Berlin is in Germany."]',
        rerankTopN: 2,
        rerankMinScore: 0,
      },
      async () => ({
        statusCode: 200,
        body: {
          model: "caedral-rerank",
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.1 },
          ],
        },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(result[0]?.[0]?.json.results).toHaveLength(2);
    expect((result[0]?.[0]?.json.documents as Array<{ document: string }>)[0]?.document).toContain(
      "Paris",
    );
  });

  it("rejects invalid rerank documents JSON with NodeOperationError", async () => {
    const { context } = createContext({
      resource: "ai",
      operation: "rerank",
      rerankQuery: "capital",
      rerankDocuments: "{not-json}",
      rerankTopN: 2,
      rerankMinScore: 0,
    });

    const node = new Caedral();
    await expect(node.execute.call(context)).rejects.toBeInstanceOf(NodeOperationError);
    await expect(node.execute.call(context)).rejects.toThrow("valid JSON");
  });

  it("wraps HTTP 4xx as NodeApiError", async () => {
    const { context } = createContext(
      { operation: "getUsage" },
      async () => ({
        statusCode: 401,
        body: {
          error: { type: "invalid_api_key", message: "Invalid or revoked API key.", code: 401 },
        },
      }),
    );

    const node = new Caedral();
    try {
      await node.execute.call(context);
      throw new NodeOperationError(
        { id: "x", name: "x", type: "x", typeVersion: 1, position: [0, 0], parameters: {} },
        "expected failure",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(NodeApiError);
      expect((error as NodeApiError).message).toContain("invalid_api_key");
      expect((error as NodeApiError).httpCode).toBe("401");
    }
  });

  it("wraps HTTP 5xx as NodeApiError", async () => {
    const { context } = createContext(
      {
        operation: "chatCompletion",
        model: "caedral-base",
        messageMode: "simple",
        message: "Hello",
        temperature: 1,
        maxTokens: 0,
        systemPrompt: "",
      },
      async () => ({
        statusCode: 502,
        body: {
          error: {
            type: "upstream_error",
            message: "The model service is temporarily unavailable. Please try again.",
            code: 502,
          },
        },
      }),
    );

    const node = new Caedral();
    await expect(node.execute.call(context)).rejects.toBeInstanceOf(NodeApiError);
  });

  it("supports continueOnFail for API errors", async () => {
    const { context } = createContext(
      { operation: "getUsage" },
      async () => ({
        statusCode: 402,
        body: {
          error: { type: "insufficient_balance", message: "Top up", code: 402 },
        },
      }),
      { continueOnFail: true },
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(result[0]?.[0]?.json.error).toContain("insufficient_balance");
    expect(result[0]?.[0]?.json.httpCode).toBe("402");
  });

  it("generates audio with the selected voice", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "audio",
        operation: "audioGeneration",
        audioInput: "Hello from Caedral",
        audioVoice: "coral",
      },
      async () => ({ statusCode: 200, body: { model: "caedral-voice", choices: [] } }),
    );

    const node = new Caedral();
    await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/audio/speech",
      body: { model: "caedral-voice", input: "Hello from Caedral", voice: "coral" },
    });
  });

  it("generates an image", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "image",
        operation: "imageGeneration",
        imagePrompt: "A red circle",
        imageSize: "1024x1024",
        imageN: 1,
      },
      async () => ({
        statusCode: 200,
        body: { model: "caedral-vision", data: [{ url: "https://example.com/x.png" }] },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/images/generations",
      body: { model: "caedral-vision", prompt: "A red circle", size: "1024x1024" },
    });
    expect(result[0]?.[0]?.json.data).toHaveLength(1);
  });
});
