import { describe, expect, it } from "vitest";

import {
  buildChatCompletionBody,
  buildRequestUrl,
  formatApiErrorMessage,
  formatUsageForOutput,
  normalizeBaseUrl,
  parseChatCompletionResponse,
  parseMessagesJson,
  resolveMessages,
} from "../helpers";

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

describe("resolveMessages", () => {
  it("builds a single user message in simple mode", () => {
    expect(resolveMessages("simple", "Hello Caedral")).toEqual([
      { role: "user", content: "Hello Caedral" },
    ]);
  });

  it("throws when simple message is empty", () => {
    expect(() => resolveMessages("simple", "   ")).toThrow(
      "Message is required",
    );
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
    const messages = parseMessagesJson(
      '[{"role":"user","content":"Test"}]',
    );
    expect(messages).toEqual([{ role: "user", content: "Test" }]);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseMessagesJson("{not json}")).toThrow("valid JSON");
  });

  it("rejects invalid roles", () => {
    expect(() =>
      parseMessagesJson('[{"role":"invalid","content":"x"}]'),
    ).toThrow("invalid role");
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
  it("normalizes missing fields", () => {
    expect(formatUsageForOutput({})).toEqual({
      accountStatus: "unknown",
      plan: "free",
      planStatus: "unknown",
      balanceCents: 0,
      weeklyPool: { limit: 0, used: 0, remaining: 0 },
      overage: {
        enabled: false,
        limitCents: null,
        usedCents: 0,
        remainingCents: null,
      },
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
          message: "Pool exhausted",
          code: 402,
        },
      }),
    ).toBe("[insufficient_balance] Pool exhausted");
  });

  it("falls back for plain text bodies", () => {
    expect(formatApiErrorMessage(502, "upstream down")).toBe(
      "Caedral API error (502): upstream down",
    );
  });
});
