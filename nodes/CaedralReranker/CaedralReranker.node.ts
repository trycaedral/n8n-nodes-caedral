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

type RerankResult = {
  index: number;
  relevance_score: number;
};

type RerankResponse = {
  model: string;
  results: RerankResult[];
};

type LangChainDocument = {
  pageContent: string;
  metadata: Record<string, unknown>;
};

/**
 * Caedral Reranker — an AI Reranker sub-node compatible with
 * n8n's Vector Store nodes. Implements the compressDocuments pattern
 * (LangChain BaseDocumentCompressor interface) using Caedral /v1/rerank.
 */
export class CaedralReranker implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Caedral Reranker",
    name: "caedralReranker",
    icon: {
      light: "file:../../icons/caedral.svg",
      dark: "file:../../icons/caedral.dark.svg",
    },
    group: ["transform"],
    version: 1,
    description:
      "Rerank documents by relevance using Caedral for improved retrieval quality",
    defaults: {
      name: "Caedral Reranker",
    },
    codex: {
      categories: ["AI"],
      subcategories: {
        AI: ["Miscellaneous"],
      },
      resources: {
        primaryDocumentation: [
          { url: "https://caedral.com/docs/n8n-overview" },
        ],
      },
    },
    inputs: [],
    outputs: [NodeConnectionTypes.AiReranker],
    outputNames: ["Reranker"],
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
        default: "caedral-rerank",
        description: "Reranking model to use",
      },
      {
        displayName: "Top N",
        name: "topN",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 100 },
        default: 5,
        description:
          "Number of most relevant documents to return after reranking",
      },
      {
        displayName: "Minimum Score",
        name: "minScore",
        type: "number",
        typeOptions: { minValue: 0, maxValue: 1, numberStepSize: 0.05 },
        default: 0,
        description:
          "Only return documents with a relevance score above this threshold (0 = no filtering)",
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
    const topN = this.getNodeParameter("topN", itemIndex) as number;
    const minScore = this.getNodeParameter("minScore", itemIndex) as number;
    const helpers = this.helpers;

    const reranker = {
      lc_namespace: ["langchain", "retrievers", "document_compressors", "caedral"],

      async compressDocuments(
        documents: LangChainDocument[],
        query: string,
      ): Promise<LangChainDocument[]> {
        if (documents.length === 0) return [];

        const documentTexts = documents.map((doc) => doc.pageContent);

        const url = buildRequestUrl(baseUrl, "/v1/rerank");
        const response = (await helpers.httpRequest({
          method: "POST",
          url,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: {
            model,
            query,
            documents: documentTexts,
            top_n: Math.min(topN, documents.length),
          },
          json: true,
        })) as RerankResponse;

        const results = response.results
          .filter((r) => r.relevance_score >= minScore)
          .sort((a, b) => b.relevance_score - a.relevance_score)
          .slice(0, topN);

        return results.map((r) => {
          const original = documents[r.index];
          return {
            pageContent: original.pageContent,
            metadata: {
              ...original.metadata,
              relevance_score: r.relevance_score,
            },
          };
        });
      },
    };

    return {
      response: reranker,
    };
  }
}
