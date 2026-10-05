import { describe, expect, it, vi } from "vitest";
import { NodeApiError, NodeOperationError } from "n8n-workflow";
import type { IExecuteFunctions } from "n8n-workflow";

import { Caedral } from "../nodes/Caedral/Caedral.node";
import { FAKE_CREDENTIAL_KEY } from "./fake-credentials";

const CHAT_RESPONSE = {
  id: "chatcmpl-test",
  model: "openai/gpt-5-mini",
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
  httpImpl?: () => Promise<{ statusCode: number; body: unknown; headers?: Record<string, string> }>,
  extras?: { continueOnFail?: boolean; binary?: Record<string, { data: string; mimeType: string; fileName: string }> },
) {
  const httpRequestWithAuthentication = vi.fn(
    async () =>
      httpImpl
        ? await httpImpl()
        : { statusCode: 200, body: CHAT_RESPONSE },
  );

  const context = {
    getInputData: () => [{ json: {}, binary: extras?.binary }],
    getCredentials: async () => ({
      apiKey: FAKE_CREDENTIAL_KEY,
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
    helpers: {
      httpRequestWithAuthentication,
      prepareBinaryData: async (buffer: Buffer, fileName?: string, mimeType?: string) => ({
        data: Buffer.from(buffer).toString("base64"),
        fileName,
        mimeType,
      }),
      assertBinaryData: (_itemIndex: number, propertyName: string) => {
        const binary = extras?.binary?.[propertyName];
        if (!binary) throw new Error(`Missing binary property ${propertyName}`);
        return binary;
      },
      getBinaryDataBuffer: async () => Buffer.from("fake-audio"),
    },
  } as unknown as IExecuteFunctions;

  return { context, httpRequestWithAuthentication };
}

describe("Caedral node — chatCompletion parameter retrieval", () => {
  it("Simple mode works without messagesJson stored (hidden by displayOptions)", async () => {
    const { context, httpRequestWithAuthentication } = createContext({
      operation: "chatCompletion",
      model: "openai/gpt-5-mini",
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
    expect(request.body).not.toHaveProperty("max_tokens");
    expect(request.body).not.toHaveProperty("max_completion_tokens");
    expect(result[0]?.[0]?.json.content).toBe("Hi there!");
  });

  it("JSON mode works without message/systemPrompt stored (hidden by displayOptions)", async () => {
    const { context, httpRequestWithAuthentication } = createContext({
      operation: "chatCompletion",
      model: "openai/gpt-5-mini",
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
      model: "openai/gpt-5-mini",
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

  it("accepts a manually supplied model ID", async () => {
    const { context, httpRequestWithAuthentication } = createContext({
      operation: "chatCompletion",
      model: "my-org/custom-chat",
      messageMode: "simple",
      message: "Hello!",
      temperature: 1,
      maxTokens: 0,
      systemPrompt: "",
    });

    const node = new Caedral();
    await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      body: { model: "my-org/custom-chat" },
    });
  });

  it("sends a saved workflow model ID as-is without consulting the catalog", async () => {
    const savedId = "future-provider/model-xyz-2030";
    const { context, httpRequestWithAuthentication } = createContext({
      operation: "chatCompletion",
      model: savedId,
      messageMode: "simple",
      message: "Hello!",
      temperature: 1,
      maxTokens: 0,
      systemPrompt: "",
    });

    const node = new Caedral();
    await node.execute.call(context);
    const request = httpRequestWithAuthentication.mock.calls[0]?.[1] as {
      url: string;
      body: { model: string };
    };
    expect(request.url).toBe("http://localhost:5001/v1/chat/completions");
    expect(request.body.model).toBe(savedId);
    expect(httpRequestWithAuthentication.mock.calls.every((call) => {
      const options = call[1] as { url?: string };
      return !String(options.url ?? "").endsWith("/v1/models");
    })).toBe(true);
  });
});

describe("Caedral node — resource operations", () => {
  it("lists models", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      { resource: "models", operation: "listModels" },
      async () => ({
        statusCode: 200,
        body: { object: "list", data: [{ id: "openai/gpt-5-mini" }] },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/models",
      method: "GET",
    });
    expect(result[0]?.[0]?.json.models).toEqual([{ id: "openai/gpt-5-mini" }]);
  });

  it("gets usage without resource (legacy)", async () => {
    const usage = {
      accountStatus: "active",
      plan: { id: "pro", name: "Pro", interval: "monthly", status: "active" },
      billingPeriod: { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" },
      pools: {
        caedral: {
          usedMilli: 25_000,
          limitMilli: 100_000,
          usedFormatted: "$0.25",
          limitFormatted: "$1.00",
          percentUsed: 25,
        },
        external: {
          usedMilli: 0,
          limitMilli: 500_000,
          usedFormatted: "$0.00",
          limitFormatted: "$5.00",
          percentUsed: 0,
          available: true,
        },
      },
      onDemand: {
        mode: "disabled",
        allowed: true,
        blocked: false,
        accruedMilli: 0,
        spentMilli: 0,
        accruedFormatted: "$0.00",
        spentFormatted: "$0.00",
      },
    };
    const { context } = createContext(
      { operation: "getUsage" },
      async () => ({
        statusCode: 200,
        body: usage,
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(result[0]?.[0]?.json).toEqual(usage);
    expect(result[0]?.[0]?.json).not.toHaveProperty("balanceCents");
    expect(result[0]?.[0]?.json).not.toHaveProperty("balanceMilliCents");
    expect(result[0]?.[0]?.json).not.toHaveProperty("balanceWeightedUnitsAffordable");
  });

  it("creates embeddings without a hardcoded dimension", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "ai",
        operation: "createEmbedding",
        embeddingModel: "caedral-embed-e1-small-v1",
        embeddingInput: "hello",
      },
      async () => ({
        statusCode: 200,
        body: { model: "caedral-embed-e1-small-v1", data: [{ embedding: [0.1], index: 0 }] },
      }),
    );

    const node = new Caedral();
    await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/embeddings",
      body: {
        model: "caedral-embed-e1-small-v1",
        input: "hello",
        input_type: "document",
        encoding_format: "float",
      },
    });
    expect(
      (httpRequestWithAuthentication.mock.calls[0]?.[1] as { body: Record<string, unknown> }).body
        .dimensions,
    ).toBeUndefined();
  });

  it("sends embedding dimensions only when the user sets them", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "ai",
        operation: "createEmbedding",
        embeddingModel: "caedral-embed-e1-small-v1",
        embeddingInput: "hello",
        embeddingDimensions: 384,
      },
      async () => ({
        statusCode: 200,
        body: { model: "caedral-embed-e1-small-v1", data: [{ embedding: [0.1], index: 0 }] },
      }),
    );

    const node = new Caedral();
    await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      body: { dimensions: 384 },
    });
  });

  it("reranks documents", async () => {
    const { context } = createContext(
      {
        resource: "ai",
        operation: "rerank",
        rerankModel: "BAAI/bge-reranker-v2-m3",
        rerankQuery: "capital",
        rerankDocuments: '["Paris is the capital of France.","Berlin is in Germany."]',
        rerankTopN: 2,
        rerankMinScore: 0,
      },
      async () => ({
        statusCode: 200,
        body: {
          model: "BAAI/bge-reranker-v2-m3",
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
      rerankModel: "BAAI/bge-reranker-v2-m3",
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
        model: "openai/gpt-5-mini",
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
          error: { type: "insufficient_balance", message: "Included quota exhausted", code: 402 },
        },
      }),
      { continueOnFail: true },
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(result[0]?.[0]?.json.error).toContain("insufficient_balance");
    expect(result[0]?.[0]?.json.httpCode).toBe("402");
  });

  it("generates speech as binary audio", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "audio",
        operation: "audioGeneration",
        audioModel: "caedral-voice-1",
        audioInput: "Hello from Caedral",
        audioVoice: "caedral-f1",
      },
      async () => ({
        statusCode: 200,
        body: Buffer.from("RIFF"),
        headers: { "content-type": "audio/wav" },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/audio/speech",
      encoding: "arraybuffer",
      body: { model: "caedral-voice-1", input: "Hello from Caedral", voice: "caedral-f1" },
    });
    expect(result[0]?.[0]?.binary?.data.mimeType).toBe("audio/wav");
  });

  it("sends a manually supplied future voice ID unchanged", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "audio",
        operation: "audioGeneration",
        audioModel: "future-tts/provider-model",
        audioInput: "Hello from the future",
        audioVoice: "nova-2030",
      },
      async () => ({
        statusCode: 200,
        body: Buffer.from("RIFF"),
        headers: { "content-type": "audio/wav" },
      }),
    );

    const node = new Caedral();
    await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      body: {
        model: "future-tts/provider-model",
        input: "Hello from the future",
        voice: "nova-2030",
      },
    });
  });

  it("surfaces invalid speech voice errors from the API", async () => {
    const { context } = createContext(
      {
        resource: "audio",
        operation: "audioGeneration",
        audioModel: "caedral-voice-1",
        audioInput: "Hello",
        audioVoice: "not-a-voice",
      },
      async () => ({
        statusCode: 400,
        body: {
          error: {
            type: "invalid_request",
            message: 'Unknown voice "not-a-voice". Valid voices: caedral-f1, caedral-f2, caedral-m1, caedral-m2.',
            code: 400,
          },
        },
      }),
    );

    const node = new Caedral();
    await expect(node.execute.call(context)).rejects.toBeInstanceOf(NodeApiError);
  });

  it("generates an image with a live catalog model ID", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "image",
        operation: "imageGeneration",
        imageModel: "black-forest-labs/flux.2-flex",
        imagePrompt: "A red circle",
        imageOptions: { size: "1024x1024" },
      },
      async () => ({
        statusCode: 200,
        body: { data: [{ url: "https://example.com/x.png" }] },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/images/generations",
      body: { model: "black-forest-labs/flux.2-flex", prompt: "A red circle", size: "1024x1024" },
    });
    expect(result[0]?.[0]?.json.data).toHaveLength(1);
  });

  it("keeps v1 imageSize on generate image", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        operation: "imageGeneration",
        imageModel: "black-forest-labs/flux.2-flex",
        imagePrompt: "A red circle",
        imageSize: "1024x1024",
        imageN: 1,
      },
      async () => ({
        statusCode: 200,
        body: { data: [{ url: "https://example.com/x.png" }] },
      }),
    );

    const node = new Caedral();
    await node.execute.call(context);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      body: { prompt: "A red circle", size: "1024x1024" },
    });
  });

  it("transcribes binary audio via multipart", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "audio",
        operation: "audioTranscription",
        transcriptionModel: "deepgram/nova-3",
        transcriptionSource: "binary",
        transcriptionBinaryProperty: "data",
      },
      async () => ({
        statusCode: 200,
        body: { text: "hello world" },
      }),
      {
        binary: {
          data: { data: Buffer.from("fake-audio").toString("base64"), mimeType: "audio/wav", fileName: "clip.wav" },
        },
      },
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    const request = httpRequestWithAuthentication.mock.calls[0]?.[1] as { body: FormData; url: string };
    expect(request.url).toBe("http://localhost:5001/v1/audio/transcriptions");
    expect(request.body).toBeInstanceOf(FormData);
    expect(result[0]?.[0]?.json.text).toBe("hello world");
  });

  it("starts an async video job and does not pretend it is synchronous", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "video",
        operation: "videoGeneration",
        videoModel: "alibaba/wan-2.6",
        videoPrompt: "A paper boat in the rain",
        videoWaitForCompletion: false,
      },
      async () => ({
        statusCode: 200,
        body: { id: "job-abc", status: "pending" },
      }),
    );

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      url: "http://localhost:5001/v1/videos",
      body: { model: "alibaba/wan-2.6", prompt: "A paper boat in the rain" },
    });
    expect(result[0]?.[0]?.json).toMatchObject({ id: "job-abc", status: "pending" });
  });

  it("polls video status until completion when asked", async () => {
    const { context, httpRequestWithAuthentication } = createContext(
      {
        resource: "video",
        operation: "videoGeneration",
        videoModel: "alibaba/wan-2.6",
        videoPrompt: "A paper boat in the rain",
        videoWaitForCompletion: true,
        videoOptions: { pollIntervalMs: 1, pollTimeoutMs: 5000 },
      },
    );
    httpRequestWithAuthentication
      .mockResolvedValueOnce({ statusCode: 200, body: { id: "job-abc", status: "pending" } })
      .mockResolvedValueOnce({ statusCode: 200, body: { id: "job-abc", status: "completed" } });

    const node = new Caedral();
    const result = await node.execute.call(context);
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
    expect(httpRequestWithAuthentication.mock.calls[1]?.[1]).toMatchObject({
      method: "GET",
      url: "http://localhost:5001/v1/videos/job-abc",
    });
    expect(result[0]?.[0]?.json.status).toBe("completed");
  });

  it("requires a model ID instead of substituting an obsolete branded fallback", async () => {
    const { context } = createContext({
      resource: "ai",
      operation: "chatCompletion",
      model: "",
      messageMode: "simple",
      message: "Hello",
      temperature: 1,
      maxTokens: 0,
      systemPrompt: "",
    });

    const node = new Caedral();
    await expect(node.execute.call(context)).rejects.toBeInstanceOf(NodeOperationError);
    await expect(node.execute.call(context)).rejects.toThrow(/Model is required/);
  });
});
