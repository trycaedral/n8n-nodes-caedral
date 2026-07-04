import type {
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";

import {
  MODEL_OPTIONS,
  normalizeBaseUrl,
  buildRequestUrl,
  type ChatMessage,
  type ChatCompletionResponse,
} from "../Caedral/helpers";

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
    description: "Use Caedral models with AI Agent and Chain nodes",
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

    const helpers = this.helpers;

    const chatModel = {
      lc_namespace: ["langchain", "chat_models", "caedral"],

      async invoke(messages: Array<{ role: string; content: string }>) {
        const url = buildRequestUrl(baseUrl, "/v1/chat/completions");
        const body = {
          model,
          messages: messages as ChatMessage[],
          temperature,
          max_tokens: maxTokens,
        };

        const response = (await helpers.httpRequest({
          method: "POST",
          url,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body,
          json: true,
        })) as ChatCompletionResponse;

        const content = response.choices?.[0]?.message?.content ?? "";
        return { content };
      },

      async _generate(
        messages: Array<{ role?: string; content?: string; _getType?: () => string }>,
        _options?: Record<string, unknown>,
      ) {
        const formatted = messages.map((m) => {
          let role = "user";
          if (typeof m._getType === "function") {
            const type = m._getType();
            if (type === "system" || type === "SystemMessage") role = "system";
            else if (type === "ai" || type === "AIMessage") role = "assistant";
            else if (type === "human" || type === "HumanMessage") role = "user";
            else role = type;
          } else if (m.role) {
            role = m.role;
          }
          return { role, content: String(m.content ?? "") };
        });

        const url = buildRequestUrl(baseUrl, "/v1/chat/completions");
        const body = {
          model,
          messages: formatted,
          temperature,
          max_tokens: maxTokens,
        };

        const response = (await helpers.httpRequest({
          method: "POST",
          url,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body,
          json: true,
        })) as ChatCompletionResponse;

        const content = response.choices?.[0]?.message?.content ?? "";
        const usage = response.usage;

        return {
          generations: [
            [
              {
                text: content,
                message: { content, role: "assistant" },
                generationInfo: {
                  finishReason: response.choices?.[0]?.finish_reason ?? "stop",
                },
              },
            ],
          ],
          llmOutput: {
            tokenUsage: {
              completionTokens: usage?.completion_tokens ?? 0,
              promptTokens: usage?.prompt_tokens ?? 0,
              totalTokens: usage?.total_tokens ?? 0,
            },
          },
        };
      },

      _llmType() {
        return "caedral";
      },

      _modelType() {
        return "base_chat_model";
      },
    };

    return {
      response: chatModel,
    };
  }
}
