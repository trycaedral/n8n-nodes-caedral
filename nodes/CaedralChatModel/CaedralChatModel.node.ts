import type {
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";

import { MODEL_OPTIONS, normalizeBaseUrl } from "../Caedral/helpers";
import { CaedralLangChainChatModel } from "./caedral-langchain-model";

type CaedralCredentials = {
  apiKey: string;
  baseUrl?: string;
};

/**
 * Caedral Chat Model — an AI Language Model sub-node compatible with
 * n8n's AI Agent and Chain nodes. Implements the supplyData pattern
 * to provide a LangChain-compatible chat model interface.
 */
export class CaedralChatModel implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Caedral Chat Model",
    name: "caedralChatModel",
    icon: {
      light: "file:../../icons/caedral.svg",
      dark: "file:../../icons/caedral.dark.svg",
    },
    group: ["transform"],
    version: 1,
    description: "Use Caedral chat tiers with AI Agent and Chain nodes (prepaid API balance)",
    defaults: {
      name: "Caedral Chat Model",
    },
    codex: {
      categories: ["AI"],
      subcategories: {
        AI: ["Language Models", "Chat Models"],
      },
      resources: {
        primaryDocumentation: [
          { url: "https://caedral.com/docs/n8n-overview" },
        ],
      },
    },
    inputs: [],
    outputs: [NodeConnectionTypes.AiLanguageModel],
    outputNames: ["Model"],
    credentials: [
      {
        name: "caedralApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Model Tier",
        name: "model",
        type: "options",
        options: [...MODEL_OPTIONS],
        default: "caedral-olympus",
        description: "Which Caedral model tier to use for AI Agent completions",
      },
      {
        displayName: "Temperature",
        name: "temperature",
        type: "number",
        typeOptions: { minValue: 0, maxValue: 2, numberStepSize: 0.1 },
        default: 0.7,
        description: "Sampling temperature for responses",
      },
      {
        displayName: "Max Tokens",
        name: "maxTokens",
        type: "number",
        typeOptions: { minValue: 1 },
        default: 4096,
        description: "Maximum tokens in the response",
      },
    ],
  };

  async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
    const credentials = (await this.getCredentials("caedralApi")) as CaedralCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const apiKey = credentials.apiKey;
    const model = this.getNodeParameter("model", itemIndex) as string;
    const temperature = this.getNodeParameter("temperature", itemIndex) as number;
    const maxTokens = this.getNodeParameter("maxTokens", itemIndex) as number;

    const chatModel = new CaedralLangChainChatModel({
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      httpRequest: (options) =>
        this.helpers.httpRequest({
          ...options,
          body: options.body as Record<string, unknown>,
        }),
    });

    return {
      response: chatModel,
    };
  }
}
