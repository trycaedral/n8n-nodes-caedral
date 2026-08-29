import type {
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes } from "n8n-workflow";

import { DEFAULT_TIMEOUT_MS } from "../../shared/constants";
import { normalizeBaseUrl } from "../Caedral/helpers";
import { getChatModels } from "../Caedral/models";
import { CaedralLangChainChatModel } from "./caedral-langchain-model";

type CaedralCredentials = {
  apiKey: string;
  baseUrl?: string;
};

type ChatModelOptions = {
  timeout?: number;
  maxRetries?: number;
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
    subtitle: '={{$parameter["model"]}}',
    version: 1,
    description: "Use Caedral chat tiers with AI Agent and Chain nodes (prepaid API balance)",
    defaults: {
      name: "Caedral Chat Model",
    },
    codex: {
      categories: ["Development"],
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
        displayName: "Model Name or ID",
        name: "model",
        type: "options",
        typeOptions: { loadOptionsMethod: "getChatModels" },
        default: "caedral-olympus",
        description:
          'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
      {
        displayName: "Options",
        name: "options",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        options: [
          {
            displayName: "Max Retries",
            name: "maxRetries",
            type: "number",
            typeOptions: { minValue: 0, maxValue: 5 },
            default: 2,
            description: "Retries on HTTP 429/502/503/504",
          },
          {
            displayName: "Timeout",
            name: "timeout",
            type: "number",
            typeOptions: { minValue: 1000 },
            default: DEFAULT_TIMEOUT_MS,
            description: "Request timeout in milliseconds",
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      getChatModels,
    },
  };

  async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
    const credentials = (await this.getCredentials("caedralApi")) as CaedralCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const apiKey = credentials.apiKey;
    const model = this.getNodeParameter("model", itemIndex) as string;
    const temperature = this.getNodeParameter("temperature", itemIndex) as number;
    const maxTokens = this.getNodeParameter("maxTokens", itemIndex) as number;
    const options = this.getNodeParameter("options", itemIndex, {}) as ChatModelOptions;
    const node = this.getNode();

    const chatModel = new CaedralLangChainChatModel({
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? 2,
      node,
      httpRequest: (requestOptions) =>
        this.helpers.httpRequest({
          ...requestOptions,
          body: requestOptions.body as Record<string, unknown>,
        }),
    });

    const originalGenerate = chatModel._generate.bind(chatModel);
    chatModel._generate = async (...args) => {
      try {
        return await originalGenerate(...args);
      } catch (error) {
        if (error instanceof NodeApiError) {
          const payload: { message: string; httpCode?: string; description?: string } = {
            message: error.message,
          };
          if (error.httpCode) payload.httpCode = error.httpCode;
          if (error.description) payload.description = error.description;
          throw new NodeApiError(node, payload, {
            message: error.message,
            httpCode: error.httpCode ?? undefined,
            description: error.description ?? undefined,
            itemIndex,
          });
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new NodeApiError(node, { message }, { message, itemIndex });
      }
    };

    return {
      response: chatModel,
    };
  }
}
