import { describe, expect, it, vi } from "vitest";

import {
  CaedralLangChainChatModel,
  langChainMessageToOpenAI,
  langChainToolToOpenAI,
} from "../nodes/CaedralChatModel/caedral-langchain-model";

const calculatorTool = {
  name: "calculator",
  description: "Add two numbers",
  schema: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["a", "b"],
  },
};

describe("CaedralLangChainChatModel", () => {
  it("exposes bindTools returning a LangChain-compatible Runnable", () => {
    const model = new CaedralLangChainChatModel({
      baseUrl: "https://api.caedral.com",
      apiKey: "test-key",
      model: "caedral-olympus",
      temperature: 0.7,
      maxTokens: 1024,
      httpRequest: vi.fn(),
    });

    expect(model.lc_namespace).toContain("chat_models");
    expect(model.lc_runnable).toBe(true);
    expect(typeof model.bindTools).toBe("function");
    expect(model._modelType()).toBe("base_chat_model");

    const bound = model.bindTools([calculatorTool]);

    expect(bound.lc_runnable).toBe(true);
    expect(bound.bound).toBe(model);
    expect(bound).not.toBe(model);
    expect(typeof bound.invoke).toBe("function");
  });

  it("passes tools and tool_choice to the Caedral API via bindTools Runnable", async () => {
    const httpRequest = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: { name: "calculator", arguments: '{"a":1,"b":2}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const model = new CaedralLangChainChatModel({
      baseUrl: "https://api.caedral.com",
      apiKey: "test-key",
      model: "caedral-olympus",
      temperature: 0.2,
      maxTokens: 512,
      httpRequest,
    });

    const bound = model.bindTools([calculatorTool]);
    const result = await bound.invoke([
      { _getType: () => "human", content: "What is 1 + 2?" },
    ]);

    expect(httpRequest).toHaveBeenCalledOnce();
    const requestBody = httpRequest.mock.calls[0][0].body as Record<string, unknown>;
    expect(requestBody.tools).toEqual([
      {
        type: "function",
        function: {
          name: "calculator",
          description: "Add two numbers",
          parameters: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
          },
        },
      },
    ]);
    expect(requestBody.tool_choice).toBe("auto");

    expect(result.tool_calls).toEqual([
      {
        id: "call_123",
        name: "calculator",
        args: { a: 1, b: 2 },
        type: "tool_call",
      },
    ]);
  });

  it("passes tools and tool_choice to the Caedral API via _generate options", async () => {
    const httpRequest = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: { name: "calculator", arguments: '{"a":1,"b":2}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const model = new CaedralLangChainChatModel({
      baseUrl: "https://api.caedral.com",
      apiKey: "test-key",
      model: "caedral-olympus",
      temperature: 0.2,
      maxTokens: 512,
      httpRequest,
    });

    const result = await model._generate(
      [{ _getType: () => "human", content: "What is 1 + 2?" }],
      { tools: [calculatorTool], tool_choice: "auto" },
    );

    expect(httpRequest).toHaveBeenCalledOnce();
    const requestBody = httpRequest.mock.calls[0][0].body as Record<string, unknown>;
    expect(requestBody.tools).toEqual([
      {
        type: "function",
        function: {
          name: "calculator",
          description: "Add two numbers",
          parameters: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
          },
        },
      },
    ]);
    expect(requestBody.tool_choice).toBe("auto");

    const generation = result.generations[0];
    expect(generation.message.tool_calls).toEqual([
      {
        id: "call_123",
        name: "calculator",
        args: { a: 1, b: 2 },
        type: "tool_call",
      },
    ]);
    expect(generation.generationInfo.finishReason).toBe("tool_calls");
  });

  it("maps LangChain tool and assistant tool-call messages to OpenAI format", () => {
    expect(
      langChainMessageToOpenAI({
        _getType: () => "tool",
        content: "3",
        tool_call_id: "call_123",
      }),
    ).toEqual([
      {
        role: "tool",
        content: "3",
        tool_call_id: "call_123",
      },
    ]);

    expect(
      langChainMessageToOpenAI({
        _getType: () => "ai",
        content: "",
        tool_calls: [
          { id: "call_123", name: "calculator", args: { a: 1, b: 2 } },
        ],
      }),
    ).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: { name: "calculator", arguments: '{"a":1,"b":2}' },
          },
        ],
      },
    ]);
  });

  it("converts zod-like tool schemas to OpenAI parameters", () => {
    const zodTool = {
      name: "search",
      description: "Search the web",
      schema: {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            query: {
              _def: { typeName: "ZodString", description: "Search query" },
            },
          }),
        },
      },
    };

    expect(langChainToolToOpenAI(zodTool)).toEqual({
      type: "function",
      function: {
        name: "search",
        description: "Search the web",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
    });
  });
});
