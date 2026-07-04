import { describe, expect, it, vi } from "vitest";
import type { IExecuteFunctions } from "n8n-workflow";

import { Caedral } from "../Caedral.node";

/**
 * Regression tests for "Could not get parameter" errors.
 *
 * In n8n, parameters hidden by `displayOptions` are not stored on the
 * node, and `getNodeParameter` throws `Could not get parameter "<name>"`
 * unless a fallback value is passed. These tests simulate that exact
 * behavior: the mock context only knows the parameters that would be
 * visible for the selected operation/messageMode, and throws for
 * anything else requested without a fallback.
 */

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

function createContext(visibleParams: Record<string, unknown>) {
  const httpRequestWithAuthentication = vi.fn(async () => ({
    statusCode: 200,
    body: CHAT_RESPONSE,
  }));

  const context = {
    getInputData: () => [{ json: {} }],
    getCredentials: async () => ({ apiKey: "cd_live_test", baseUrl: "http://localhost:5001" }),
    getNodeParameter(name: string, _itemIndex: number, ...fallback: unknown[]) {
      if (name in visibleParams) return visibleParams[name];
      // n8n only falls back when a fallback argument was actually passed
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
    continueOnFail: () => false,
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
      // no "messagesJson" — hidden in simple mode
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
      // no "message"/"systemPrompt" — hidden in json mode
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
});
