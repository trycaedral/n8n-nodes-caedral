import { describe, expect, it, vi } from "vitest";
import type { IExecuteFunctions } from "n8n-workflow";

import { Caedral } from "../nodes/Caedral/Caedral.node";
import { CaedralChatModel } from "../nodes/CaedralChatModel/CaedralChatModel.node";
import { CaedralTrigger } from "../nodes/CaedralTrigger/CaedralTrigger.node";
import { getSpeechVoices } from "../nodes/Caedral/models";
import { ENDPOINT_PATHS } from "../shared/constants";

const CURRENT_USAGE = {
  accountStatus: "active",
  plan: { id: "hobby", name: "Hobby", interval: "monthly", status: "active" },
  billingPeriod: { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" },
  pools: {
    caedral: {
      usedMilli: 10_000,
      limitMilli: 100_000,
      usedFormatted: "$0.10",
      limitFormatted: "$1.00",
      percentUsed: 10,
    },
    external: {
      usedMilli: 0,
      limitMilli: 0,
      usedFormatted: "$0.00",
      limitFormatted: "$0.00",
      percentUsed: 0,
      available: false,
    },
  },
  onDemand: {
    mode: "disabled",
    allowed: false,
    blocked: false,
    accruedMilli: 0,
    spentMilli: 0,
    accruedFormatted: "$0.00",
    spentFormatted: "$0.00",
  },
};

describe("v2 manual-test regressions", () => {
  it("BUG 1: Account operations return plan/quota/on-demand fields, not prepaid balance", async () => {
    const httpRequestWithAuthentication = vi.fn(async () => ({
      statusCode: 200,
      body: CURRENT_USAGE,
    }));
    const context = {
      getInputData: () => [{ json: {} }],
      getCredentials: async () => ({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter(name: string, _itemIndex: number, ...fallback: unknown[]) {
        if (name === "resource") return "account";
        if (name === "operation") return "getAccountInfo";
        if (fallback.length > 0) return fallback[0];
        throw new Error(`Could not get parameter "${name}"`);
      },
      getNode: () => ({
        id: "test-node",
        name: "Caedral",
        type: "caedral",
        typeVersion: 2,
        position: [0, 0],
        parameters: {},
      }),
      continueOnFail: () => false,
      helpers: { httpRequestWithAuthentication },
    } as unknown as IExecuteFunctions;

    const node = new Caedral();
    const result = await node.execute.call(context);
    const json = result[0]?.[0]?.json;

    expect(json).toEqual(CURRENT_USAGE);
    expect(json).not.toHaveProperty("balanceCents");
    expect(json).not.toHaveProperty("balanceMilliCents");
    expect(json).not.toHaveProperty("balanceWeightedUnitsAffordable");

    const serialized = JSON.stringify(node.description);
    expect(serialized).not.toMatch(/prepaid/i);
    expect(serialized).not.toMatch(/balanceCents/);
    expect(new CaedralTrigger().description.properties.some((p) => p.name === "balanceThreshold")).toBe(
      false,
    );
  });

  it("BUG 2: chat requests omit artificial max token fields even when a legacy maxTokens param is stored", async () => {
    const httpRequestWithAuthentication = vi.fn(async () => ({
      statusCode: 200,
      body: {
        id: "chatcmpl-test",
        model: "openai/gpt-5-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hi" },
            finish_reason: "stop",
          },
        ],
      },
    }));
    const context = {
      getInputData: () => [{ json: {} }],
      getCredentials: async () => ({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter(name: string, _itemIndex: number, ...fallback: unknown[]) {
        const stored: Record<string, unknown> = {
          resource: "ai",
          operation: "chatCompletion",
          model: "openai/gpt-5-mini",
          messageMode: "simple",
          message: "Hello",
          temperature: 1,
          maxTokens: 4096,
          systemPrompt: "",
        };
        if (name in stored) return stored[name];
        if (fallback.length > 0) return fallback[0];
        throw new Error(`Could not get parameter "${name}"`);
      },
      getNode: () => ({
        id: "test-node",
        name: "Caedral",
        type: "caedral",
        typeVersion: 2,
        position: [0, 0],
        parameters: { maxTokens: 4096 },
      }),
      continueOnFail: () => false,
      helpers: { httpRequestWithAuthentication },
    } as unknown as IExecuteFunctions;

    const node = new Caedral();
    await node.execute.call(context);
    const body = (httpRequestWithAuthentication.mock.calls[0]?.[1] as { body: Record<string, unknown> })
      .body;
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("max_completion_tokens");

    const mainNames = new Caedral().description.properties.map((p) => p.name);
    expect(mainNames).not.toContain("maxTokens");
    const chatNames = new CaedralChatModel().description.properties.map((p) => p.name);
    expect(chatNames).not.toContain("maxTokens");
  });

  it("BUG 3: Generate Speech loads voices for the selected model and sends that exact ID", async () => {
    const catalog = {
      object: "list",
      data: [
        {
          id: "future-tts/provider-model",
          name: "Provider TTS 2030",
          owned_by: "future-tts",
          supported_voices: ["nova-2030", "orion-2030"],
          recommended_endpoint: { path: ENDPOINT_PATHS.audioSpeech },
        },
        {
          id: "caedral-voice-1",
          name: "Caedral Voice V1",
          owned_by: "caedral",
          supported_voices: ["caedral-f1", "caedral-f2", "caedral-m1", "caedral-m2"],
          recommended_endpoint: { path: ENDPOINT_PATHS.audioSpeech },
        },
      ],
    };
    const loadContext = {
      getCredentials: vi.fn().mockResolvedValue({
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
      getCurrentNodeParameter: vi.fn(() => "future-tts/provider-model"),
      helpers: {
        httpRequestWithAuthentication: vi.fn(async () => catalog),
      },
    };

    const voices = await getSpeechVoices.call(loadContext as never);
    expect(voices.map((option) => option.value).sort()).toEqual(["nova-2030", "orion-2030"]);
    expect(voices.map((option) => option.value)).not.toContain("caedral-f1");
    expect(voices.map((option) => option.value)).not.toContain("alloy");

    const httpRequestWithAuthentication = vi.fn(async () => ({
      statusCode: 200,
      body: Buffer.from("RIFF"),
      headers: { "content-type": "audio/wav" },
    }));
    const executeContext = {
      getInputData: () => [{ json: {} }],
      getCredentials: async () => ({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter(name: string, _itemIndex: number, ...fallback: unknown[]) {
        const stored: Record<string, unknown> = {
          resource: "audio",
          operation: "audioGeneration",
          audioModel: "future-tts/provider-model",
          audioInput: "Hello from 2030",
          audioVoice: "orion-2030",
        };
        if (name in stored) return stored[name];
        if (fallback.length > 0) return fallback[0];
        throw new Error(`Could not get parameter "${name}"`);
      },
      getNode: () => ({
        id: "test-node",
        name: "Caedral",
        type: "caedral",
        typeVersion: 2,
        position: [0, 0],
        parameters: {},
      }),
      continueOnFail: () => false,
      helpers: {
        httpRequestWithAuthentication,
        prepareBinaryData: async (buffer: Buffer, fileName?: string, mimeType?: string) => ({
          data: Buffer.from(buffer).toString("base64"),
          fileName,
          mimeType,
        }),
      },
    } as unknown as IExecuteFunctions;

    await new Caedral().execute.call(executeContext);
    expect(httpRequestWithAuthentication.mock.calls[0]?.[1]).toMatchObject({
      body: {
        model: "future-tts/provider-model",
        input: "Hello from 2030",
        voice: "orion-2030",
      },
    });
  });
});
