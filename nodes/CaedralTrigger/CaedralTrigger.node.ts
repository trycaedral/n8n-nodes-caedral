import type {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IPollFunctions,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";

import { buildRequestUrl, normalizeBaseUrl, type UsageResponse } from "../Caedral/helpers";

type CaedralCredentials = {
  baseUrl?: string;
};

/**
 * Caedral Trigger — polling trigger for balance and pool usage alerts.
 */
export class CaedralTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Caedral Trigger",
    name: "caedralTrigger",
    icon: {
      light: "file:../../icons/caedral.svg",
      dark: "file:../../icons/caedral.dark.svg",
    },
    group: ["trigger"],
    version: 1,
    subtitle: "Balance below threshold",
    description: "Triggers when your Caedral balance drops below a specified amount",
    defaults: {
      name: "Caedral Trigger",
    },
    polling: true,
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "caedralApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Trigger When",
        name: "triggerCondition",
        type: "options",
        options: [
          {
            name: "Balance Below Threshold",
            value: "balanceBelow",
            description: "Trigger when account balance in cents falls below the threshold",
          },
          {
            name: "Pool Usage Above Percentage",
            value: "poolAbove",
            description: "Trigger when weekly pool usage exceeds a percentage",
          },
        ],
        default: "balanceBelow",
      },
      {
        displayName: "Balance Threshold (cents)",
        name: "balanceThreshold",
        type: "number",
        typeOptions: { minValue: 0 },
        displayOptions: { show: { triggerCondition: ["balanceBelow"] } },
        default: 500,
        description: "Trigger when balance drops below this amount in cents (e.g. 500 = $5.00)",
      },
      {
        displayName: "Pool Usage Threshold (%)",
        name: "poolPercentage",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 100 },
        displayOptions: { show: { triggerCondition: ["poolAbove"] } },
        default: 80,
        description: "Trigger when pool usage exceeds this percentage",
      },
    ],
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const credentials = (await this.getCredentials("caedralApi")) as CaedralCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const triggerCondition = this.getNodeParameter("triggerCondition") as string;

    const response = (await this.helpers.httpRequestWithAuthentication.call(
      this,
      "caedralApi",
      {
        method: "GET",
        url: buildRequestUrl(baseUrl, "/v1/usage"),
        json: true,
      },
    )) as UsageResponse;

    if (triggerCondition === "balanceBelow") {
      const threshold = this.getNodeParameter("balanceThreshold") as number;
      const balance = response.balanceCents ?? 0;

      if (balance < threshold) {
        return [
          [
            {
              json: {
                triggered: true,
                condition: "balanceBelow",
                balanceCents: balance,
                thresholdCents: threshold,
                balanceFormatted: `$${(balance / 100).toFixed(2)}`,
                thresholdFormatted: `$${(threshold / 100).toFixed(2)}`,
                plan: response.plan ?? "unknown",
                accountStatus: response.accountStatus ?? "unknown",
                timestamp: new Date().toISOString(),
              } as IDataObject,
            },
          ],
        ];
      }
    }

    if (triggerCondition === "poolAbove") {
      const poolPercentage = this.getNodeParameter("poolPercentage") as number;
      const poolLimit = response.weeklyPool?.limit ?? 0;
      const poolUsed = response.weeklyPool?.used ?? 0;

      if (poolLimit > 0) {
        const usagePercent = Math.round((poolUsed / poolLimit) * 100);
        if (usagePercent >= poolPercentage) {
          return [
            [
              {
                json: {
                  triggered: true,
                  condition: "poolAbove",
                  poolUsed,
                  poolLimit,
                  poolRemaining: response.weeklyPool?.remaining ?? 0,
                  usagePercent,
                  thresholdPercent: poolPercentage,
                  plan: response.plan ?? "unknown",
                  timestamp: new Date().toISOString(),
                } as IDataObject,
              },
            ],
          ];
        }
      }
    }

    return null;
  }
}
