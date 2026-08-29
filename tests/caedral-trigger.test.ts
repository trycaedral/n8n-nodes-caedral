import { describe, expect, it, vi } from "vitest";
import { NodeApiError, NodeOperationError } from "n8n-workflow";

import { CaedralTrigger } from "../nodes/CaedralTrigger/CaedralTrigger.node";

const USAGE = {
  accountStatus: "active",
  plan: { id: "pro", name: "Pro", interval: "monthly", status: "active" },
  pools: {
    caedral: {
      usedMilli: 90_000,
      limitMilli: 100_000,
      usedFormatted: "$0.90",
      limitFormatted: "$1.00",
      percentUsed: 90,
    },
    external: {
      usedMilli: 10_000,
      limitMilli: 500_000,
      usedFormatted: "$0.10",
      limitFormatted: "$5.00",
      percentUsed: 2,
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

function pollContext(params: Record<string, unknown>, body: unknown = USAGE, statusCode = 200) {
  return {
    getCredentials: vi.fn().mockResolvedValue({
      apiKey: "cd_live_test",
      baseUrl: "https://api.caedral.com",
    }),
    getNodeParameter: vi.fn((name: string) => params[name]),
    getNode: () => ({
      id: "t",
      name: "Caedral Trigger",
      type: "caedralTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: params,
    }),
    helpers: {
      httpRequestWithAuthentication: vi.fn(async () => ({
        statusCode,
        body,
      })),
    },
  };
}

describe("CaedralTrigger", () => {
  it("uses included pool usage copy", () => {
    const node = new CaedralTrigger();
    expect(node.description.subtitle).toBe("Included pool usage");
    const threshold = node.description.properties.find((p) => p.name === "usagePercent");
    expect(threshold?.displayName).toBe("Usage Percent");
    expect(node.description.properties.some((p) => p.name === "balanceThreshold")).toBe(false);
    expect(node.description.usableAsTool).toBe(false);
  });

  it("fires when Caedral pool percentUsed is at or above the threshold", async () => {
    const node = new CaedralTrigger();
    const mockContext = pollContext({
      triggerCondition: "caedralPoolPercentAtOrAbove",
      usagePercent: 80,
    });

    const result = await node.poll.call(mockContext as never);
    expect(result?.[0]?.[0]?.json).toMatchObject({
      triggered: true,
      condition: "caedralPoolPercentAtOrAbove",
      pool: "caedral",
      percentUsed: 90,
      thresholdPercent: 80,
    });
    expect(result?.[0]?.[0]?.json).not.toHaveProperty("balanceCents");
    expect(result?.[0]?.[0]?.json.usage).toEqual(USAGE);
  });

  it("returns null when Caedral pool percentUsed is below the threshold", async () => {
    const node = new CaedralTrigger();
    const mockContext = pollContext({
      triggerCondition: "caedralPoolPercentAtOrAbove",
      usagePercent: 95,
    });

    expect(await node.poll.call(mockContext as never)).toBeNull();
  });

  it("rejects the obsolete prepaid balance condition", async () => {
    const node = new CaedralTrigger();
    const mockContext = pollContext({
      triggerCondition: "balanceBelow",
      balanceThreshold: 1000,
    });

    await expect(node.poll.call(mockContext as never)).rejects.toBeInstanceOf(NodeOperationError);
  });

  it("wraps HTTP 401 as NodeApiError", async () => {
    const node = new CaedralTrigger();
    const mockContext = pollContext(
      { triggerCondition: "caedralPoolPercentAtOrAbove", usagePercent: 80 },
      {
        error: { type: "invalid_api_key", message: "Invalid key", code: 401 },
      },
      401,
    );

    await expect(node.poll.call(mockContext as never)).rejects.toBeInstanceOf(NodeApiError);
  });
});
