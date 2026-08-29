import type {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IPollFunctions,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import {
  buildRequestUrl,
  formatApiErrorMessage,
  formatUsageForOutput,
  normalizeBaseUrl,
  safeErrorDescription,
  type CaedralApiErrorBody,
  type UsageResponse,
} from "../Caedral/helpers";

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
      "Triggers when your Caedral prepaid balance drops below a specified amount (USD Cents)",
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
            description: "Trigger when prepaid balance in cents falls below the threshold",
          },
        ],
        default: "balanceBelow",
      },
      {
        displayName: "Balance Threshold (Cents)",
        name: "balanceThreshold",
        type: "number",
        typeOptions: { minValue: 0 },
        displayOptions: { show: { triggerCondition: ["balanceBelow"] } },
        default: 500,
        description: "Trigger when balance drops below this amount in cents (e.g. 500 = $5.00)",
      },
    ],
    // n8n-workflow types only allow `true`, but trigger nodes must not be AI tools.
    // The community scanner forbids `true` here; the node CLI still requires the field.
    usableAsTool: false as unknown as true,
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const credentials = (await this.getCredentials("caedralApi")) as CaedralCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const triggerCondition = this.getNodeParameter("triggerCondition") as string;

    let raw: unknown;
    try {
      raw = await this.helpers.httpRequestWithAuthentication.call(this, "caedralApi", {
        method: "GET",
        url: buildRequestUrl(baseUrl, "/v1/usage"),
        json: true,
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error calling Caedral API";
      throw new NodeApiError(this.getNode(), { message }, { message });
    }

    const full = raw as { statusCode?: number; body?: UsageResponse };
    const statusCode = Number(full.statusCode ?? (full.body ? 200 : 0));
    const responseBody = (full.body ?? raw) as UsageResponse | CaedralApiErrorBody;

    if (statusCode >= 400) {
      const message = formatApiErrorMessage(statusCode, responseBody as CaedralApiErrorBody);
      throw new NodeApiError(
        this.getNode(),
        {
          message,
          httpCode: String(statusCode),
          description: safeErrorDescription(responseBody),
        },
        {
          message,
          httpCode: String(statusCode),
          description: safeErrorDescription(responseBody),
        },
      );
    }

    const response = responseBody as UsageResponse;

    if (triggerCondition === "balanceBelow") {
      const threshold = this.getNodeParameter("balanceThreshold") as number;
      const usage = formatUsageForOutput(response);
      const balance = usage.balanceCents;

      if (balance < threshold) {
        return [
          [
            {
              json: {
                triggered: true,
                condition: "balanceBelow",
                ...usage,
                thresholdCents: threshold,
                balanceFormatted: `$${(balance / 100).toFixed(2)}`,
                thresholdFormatted: `$${(threshold / 100).toFixed(2)}`,
                timestamp: new Date().toISOString(),
              } as IDataObject,
            },
          ],
        ];
      }
    } else {
      throw new NodeOperationError(
        this.getNode(),
        `Unknown trigger condition: ${triggerCondition}`,
      );
    }

    return null;
  }
}
