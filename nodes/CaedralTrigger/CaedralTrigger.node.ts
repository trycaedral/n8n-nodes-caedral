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
 * Caedral Trigger — polling trigger for prepaid balance alerts.
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
    description:
      "Triggers when your Caedral prepaid balance drops below a specified amount (USD cents)",
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
            description:
              "Trigger when prepaid balance in cents falls below the threshold",
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
        description:
          "Trigger when balance drops below this amount in cents (e.g. 500 = $5.00)",
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
                accountStatus: response.accountStatus ?? "unknown",
                timestamp: new Date().toISOString(),
              } as IDataObject,
            },
          ],
        ];
      }
    }

    return null;
  }
}
