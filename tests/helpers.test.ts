import { describe, expect, it } from "vitest";

import {
  buildChatCompletionBody,
  buildRequestUrl,
  formatApiErrorMessage,
  formatUsageForOutput,
  inferResourceFromOperation,
  isValidChatMessageContent,
  normalizeBaseUrl,
  parseChatCompletionResponse,
  parseDocumentsJson,
  parseEmbeddingInput,
  parseMessagesJson,
  resolveMessages,
} from "../nodes/Caedral/helpers";
import { NodeOperationError } from "n8n-workflow";

describe("normalizeBaseUrl", () => {
  it("defaults to production API URL", () => {
    expect(normalizeBaseUrl()).toBe("https://api.caedral.com");
  });

  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("http://localhost:5001/")).toBe(
      "http://localhost:5001",
    );
  });
});

describe("buildRequestUrl", () => {
  it("joins base URL and path", () => {
    expect(buildRequestUrl("http://localhost:5001", "/v1/usage")).toBe(
      "http://localhost:5001/v1/usage",
    );
  });
});

describe("inferResourceFromOperation", () => {
  it("maps v1 operations to v2 resources", () => {
    expect(inferResourceFromOperation("chatCompletion")).toBe("ai");
    expect(inferResourceFromOperation("createEmbedding")).toBe("ai");
    expect(inferResourceFromOperation("rerank")).toBe("ai");
    expect(inferResourceFromOperation("audioGeneration")).toBe("audio");
    expect(inferResourceFromOperation("imageGeneration")).toBe("image");
    expect(inferResourceFromOperation("listModels")).toBe("models");
    expect(inferResourceFromOperation("getUsage")).toBe("account");
    expect(inferResourceFromOperation("getAccountInfo")).toBe("account");
  });
});

describe("resolveMessages", () => {
  it("builds a single user message in simple mode", () => {
    expect(resolveMessages("simple", "Hello Caedral")).toEqual([
      { role: "user", content: "Hello Caedral" },
    ]);
  });

  it("throws when simple message is empty", () => {
    expect(() => resolveMessages("simple", "   ")).toThrow(NodeOperationError);
    expect(() => resolveMessages("simple", "   ")).toThrow("Message is required");
  });

  it("parses JSON message arrays", () => {
    const messages = resolveMessages("json", undefined, [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
  });
});

describe("parseMessagesJson", () => {
  it("parses JSON strings", () => {
    const messages = parseMessagesJson('[{"role":"user","content":"Test"}]');
    expect(messages).toEqual([{ role: "user", content: "Test" }]);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseMessagesJson("{not json}")).toThrow(NodeOperationError);
    expect(() => parseMessagesJson("{not json}")).toThrow("valid JSON");
  });

  it("rejects invalid roles", () => {
    expect(() =>
      parseMessagesJson('[{"role":"invalid","content":"x"}]'),
    ).toThrow("invalid role");
  });

  it("accepts multimodal array content", () => {
    const messages = parseMessagesJson([
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ]);
    expect(messages[0]?.content).toEqual([{ type: "text", text: "hello" }]);
  });
});

describe("isValidChatMessageContent", () => {
  it("accepts strings and typed part arrays", () => {
    expect(isValidChatMessageContent("hello")).toBe(true);
    expect(isValidChatMessageContent([{ type: "text", text: "hi" }])).toBe(true);
    expect(isValidChatMessageContent([])).toBe(false);
    expect(isValidChatMessageContent(null)).toBe(false);
  });
});

describe("buildChatCompletionBody", () => {
  it("builds a minimal request body", () => {
    expect(
      buildChatCompletionBody({
        model: "caedral-titan",
        messageMode: "simple",
        message: "Hello",
      }),
    ).toEqual({
      model: "caedral-titan",
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("includes optional parameters when provided", () => {
    expect(
      buildChatCompletionBody({
        model: "caedral-base",
        messageMode: "simple",
        message: "Hello",
        temperature: 0.2,
        maxTokens: 128,
      }),
    ).toEqual({
      model: "caedral-base",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.2,
      max_tokens: 128,
    });
  });

  it("prepends system prompt in simple mode", () => {
    const result = buildChatCompletionBody({
      model: "caedral-base",
      messageMode: "simple",
      message: "Hello",
      systemPrompt: "You are helpful.",
    });
    expect(result.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ]);
  });

  it("does not add system prompt in json mode", () => {
    const result = buildChatCompletionBody({
      model: "caedral-base",
      messageMode: "json",
      messagesJson: [{ role: "user", content: "Hi" }],
      systemPrompt: "Ignored in JSON mode",
    });
    expect(result.messages).toEqual([{ role: "user", content: "Hi" }]);
  });
});

describe("parseChatCompletionResponse", () => {
  it("extracts assistant content and usage", () => {
    const parsed = parseChatCompletionResponse({
      id: "chatcmpl-1",
      model: "caedral-base",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello from Caedral" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 10,
        total_tokens: 15,
      },
    });

    expect(parsed.content).toBe("Hello from Caedral");
    expect(parsed.model).toBe("caedral-base");
    expect(parsed.finishReason).toBe("stop");
    expect(parsed.usage?.total_tokens).toBe(15);
  });
});

describe("formatUsageForOutput", () => {
  it("normalizes missing fields to prepaid shape", () => {
    expect(formatUsageForOutput({})).toEqual({
      accountStatus: "unknown",
      balanceCents: 0,
      balanceMilliCents: 0,
      balanceWeightedUnitsAffordable: 0,
    });
  });
});

describe("formatApiErrorMessage", () => {
  it("formats structured gateway errors", () => {
    expect(
      formatApiErrorMessage(402, {
        error: {
          type: "insufficient_balance",
          message: "Insufficient prepaid balance",
          code: 402,
        },
      }),
    ).toBe("[insufficient_balance] Insufficient prepaid balance");
  });

  it("falls back for plain text bodies", () => {
    expect(formatApiErrorMessage(502, "upstream down")).toBe(
      "Caedral API error (502): upstream down",
    );
  });
});

describe("parseDocumentsJson", () => {
  it("parses a string array", () => {
    expect(parseDocumentsJson('["a","b"]')).toEqual(["a", "b"]);
  });

  it("rejects invalid JSON with NodeOperationError", () => {
    expect(() => parseDocumentsJson("{nope}")).toThrow(NodeOperationError);
    expect(() => parseDocumentsJson("{nope}")).toThrow("valid JSON");
  });

  it("rejects non-string arrays", () => {
    expect(() => parseDocumentsJson("[1,2]")).toThrow("array of strings");
  });
});

describe("parseEmbeddingInput", () => {
  it("keeps plain text", () => {
    expect(parseEmbeddingInput("hello world")).toBe("hello world");
  });

  it("parses JSON string arrays", () => {
    expect(parseEmbeddingInput('["a","b"]')).toEqual(["a", "b"]);
  });
});
