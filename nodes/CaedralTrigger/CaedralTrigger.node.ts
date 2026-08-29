import type {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IPollFunctions,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import { DEFAULT_TIMEOUT_MS } from "../../shared/constants";
import {
  buildRequestUrl,
  formatApiErrorMessage,
  includedPoolPercentUsed,
  normalizeBaseUrl,
  safeErrorDescription,
  type CaedralApiErrorBody,
  type UsageResponse,
} from "../Caedral/helpers";

type CaedralCredentials = {
  baseUrl?: string;
};

type TriggerPool = "caedral" | "external";

/**
 * Caedral Trigger — polling trigger for included pool usage.
 */
export class CaedralTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Caedral Trigger",
    name: "caedralTrigger",
    icon: {
      light: "file:caedral.svg",
      dark: "file:caedral.dark.svg",
    },
    group: ["trigger"],
    version: 1,
    subtitle: "Included pool usage",
    description:
      "Triggers when included Caedral or external pool usage reaches a percent threshold",
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
            name: "Caedral Pool Usage At or Above %",
            value: "caedralPoolPercentAtOrAbove",
            description:
              "Trigger when pools.caedral.percentUsed from GET /v1/usage is at or above the threshold",
          },
          {
            name: "External Pool Usage At or Above %",
            value: "externalPoolPercentAtOrAbove",
            description:
              "Trigger when pools.external.percentUsed from GET /v1/usage is at or above the threshold",
          },
        ],
        default: "caedralPoolPercentAtOrAbove",
      },
      {
        displayName: "Usage Percent",
        name: "usagePercent",
        type: "number",
        typeOptions: { minValue: 0, maxValue: 100 },
        default: 80,
        description:
          "Trigger when the selected included pool's percentUsed is at or above this value",
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

    if (triggerCondition === "balanceBelow") {
      throw new NodeOperationError(
        this.getNode(),
        "Prepaid balance triggers are obsolete. Reconfigure Caedral Trigger to use included pool usage percent.",
      );
    }

    const pool: TriggerPool | null =
      triggerCondition === "caedralPoolPercentAtOrAbove"
        ? "caedral"
        : triggerCondition === "externalPoolPercentAtOrAbove"
          ? "external"
          : null;

    if (!pool) {
      throw new NodeOperationError(
        this.getNode(),
        `Unknown trigger condition: ${triggerCondition}`,
      );
    }

    const threshold = this.getNodeParameter("usagePercent") as number;

    let raw: unknown;
    try {
      raw = await this.helpers.httpRequestWithAuthentication.call(this, "caedralApi", {
        method: "GET",
        url: buildRequestUrl(baseUrl, "/v1/usage"),
        json: true,
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
        timeout: DEFAULT_TIMEOUT_MS,
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

    const usage = responseBody as UsageResponse;
    const percentUsed = includedPoolPercentUsed(usage, pool);
    if (percentUsed === null || percentUsed < threshold) {
      return null;
    }

    return [
      [
        {
          json: {
            triggered: true,
            condition: triggerCondition,
            pool,
            percentUsed,
            thresholdPercent: threshold,
            usage,
            timestamp: new Date().toISOString(),
          } as IDataObject,
        },
      ],
    ];
  }
}
