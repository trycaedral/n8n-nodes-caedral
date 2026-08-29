import { describe, expect, it, vi } from "vitest";
import { NodeApiError } from "n8n-workflow";

import { CaedralTrigger } from "../nodes/CaedralTrigger/CaedralTrigger.node";

describe("CaedralTrigger", () => {
  it("uses a (Cents) threshold label and subtitle", () => {
    const node = new CaedralTrigger();
    expect(node.description.subtitle).toBe("Balance below threshold");
    const threshold = node.description.properties.find(
      (p) => p.name === "balanceThreshold",
    );
    expect(threshold?.displayName).toBe("Balance Threshold (Cents)");
    expect(node.description.usableAsTool).toBe(false);
  });

  it("fires when prepaid balance is below the threshold", async () => {
    const node = new CaedralTrigger();
    const mockContext = {
      getCredentials: vi.fn().mockResolvedValue({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter: vi.fn((name: string) => {
        if (name === "triggerCondition") return "balanceBelow";
        if (name === "balanceThreshold") return 1000;
        return undefined;
      }),
      getNode: () => ({
        id: "t",
        name: "Caedral Trigger",
        type: "caedralTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      }),
      helpers: {
        httpRequestWithAuthentication: vi.fn(async () => ({
          statusCode: 200,
          body: {
            accountStatus: "active",
            balanceCents: 250,
            balanceMilliCents: 250000,
            balanceWeightedUnitsAffordable: 1,
          },
        })),
      },
    };

    const result = await node.poll.call(mockContext as never);
    expect(result?.[0]?.[0]?.json).toMatchObject({
      triggered: true,
      balanceCents: 250,
      thresholdCents: 1000,
    });
  });

  it("returns null when balance is above the threshold", async () => {
    const node = new CaedralTrigger();
    const mockContext = {
      getCredentials: vi.fn().mockResolvedValue({
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter: vi.fn((name: string) => {
        if (name === "triggerCondition") return "balanceBelow";
        if (name === "balanceThreshold") return 100;
        return undefined;
      }),
      getNode: () => ({
        id: "t",
        name: "Caedral Trigger",
        type: "caedralTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      }),
      helpers: {
        httpRequestWithAuthentication: vi.fn(async () => ({
          statusCode: 200,
          body: { accountStatus: "active", balanceCents: 500 },
        })),
      },
    };

    expect(await node.poll.call(mockContext as never)).toBeNull();
  });

  it("wraps HTTP 401 as NodeApiError", async () => {
    const node = new CaedralTrigger();
    const mockContext = {
      getCredentials: vi.fn().mockResolvedValue({
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter: vi.fn(() => "balanceBelow"),
      getNode: () => ({
        id: "t",
        name: "Caedral Trigger",
        type: "caedralTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      }),
      helpers: {
        httpRequestWithAuthentication: vi.fn(async () => ({
          statusCode: 401,
          body: {
            error: { type: "invalid_api_key", message: "Invalid key", code: 401 },
          },
        })),
      },
    };

    await expect(node.poll.call(mockContext as never)).rejects.toBeInstanceOf(NodeApiError);
  });
});
