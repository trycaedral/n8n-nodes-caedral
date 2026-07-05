import type {
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";

import { normalizeBaseUrl, buildRequestUrl } from "../Caedral/helpers";

type CaedralCredentials = {
  apiKey: string;
  baseUrl?: string;
};

type EmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
};

/**
 * Caedral Embeddings — an AI Embedding sub-node compatible with
 * n8n's Vector Store nodes. Provides embedDocuments and embedQuery
 * methods using the Caedral /v1/embeddings endpoint.
 */
export class CaedralEmbeddings implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Caedral Embeddings",
    name: "caedralEmbeddings",
    icon: {
      light: "file:../../icons/caedral.svg",
      dark: "file:../../icons/caedral.dark.svg",
    },
    group: ["transform"],
    version: 1,
    description:
      "Generate text embeddings via Caedral for use with Vector Store nodes",
    defaults: {
      name: "Caedral Embeddings",
    },
    codex: {
      categories: ["AI"],
      subcategories: {
        AI: ["Embeddings"],
      },
      resources: {
        primaryDocumentation: [
          { url: "https://caedral.com/docs/n8n-overview" },
        ],
      },
    },
    inputs: [],
    outputs: [NodeConnectionTypes.AiEmbedding],
    outputNames: ["Embeddings"],
    credentials: [
      {
        name: "caedralApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Model",
        name: "model",
        type: "string",
        default: "caedral-embed",
        description:
          "Embedding model (caedral-embed — $0.028/1M tokens). 1536-dimension vectors.",
      },
      {
        displayName: "Batch Size",
        name: "batchSize",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 2048 },
        default: 512,
        description:
          "Maximum number of documents to embed in a single API call",
      },
    ],
  };

  async supplyData(
    this: ISupplyDataFunctions,
    itemIndex: number,
  ): Promise<SupplyData> {
    const credentials = (await this.getCredentials(
      "caedralApi",
    )) as CaedralCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const apiKey = credentials.apiKey;
    const model = this.getNodeParameter("model", itemIndex) as string;
    const batchSize = this.getNodeParameter("batchSize", itemIndex) as number;
    const helpers = this.helpers;

    async function callEmbeddings(
      input: string | string[],
    ): Promise<number[][]> {
      const url = buildRequestUrl(baseUrl, "/v1/embeddings");
      const response = (await helpers.httpRequest({
        method: "POST",
        url,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: { model, input },
        json: true,
      })) as EmbeddingResponse;

      return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
    }

    const embeddings = {
      lc_namespace: ["langchain", "embeddings", "caedral"],

      async embedDocuments(documents: string[]): Promise<number[][]> {
        if (documents.length === 0) return [];

        const results: number[][] = [];
        for (let i = 0; i < documents.length; i += batchSize) {
          const batch = documents.slice(i, i + batchSize);
          const batchResults = await callEmbeddings(batch);
          results.push(...batchResults);
        }
        return results;
      },

      async embedQuery(query: string): Promise<number[]> {
        const results = await callEmbeddings(query);
        return results[0] ?? [];
      },
    };

    return {
      response: embeddings,
    };
  }
}
