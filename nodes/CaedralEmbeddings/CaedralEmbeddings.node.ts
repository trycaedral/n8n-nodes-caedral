import type {
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError, UserError } from "n8n-workflow";

import { EMBEDDING_DIMENSIONS } from "../../shared/constants";
import {
  buildRequestUrl,
  formatApiErrorMessage,
  normalizeBaseUrl,
  safeErrorDescription,
  type CaedralApiErrorBody,
} from "../Caedral/helpers";
import { getEmbeddingModels } from "../Caedral/models";

type CaedralCredentials = {
  apiKey: string;
  baseUrl?: string;
};

type EmbeddingItem = {
  embedding: number[] | string;
  index: number;
};

type EmbeddingResponse = {
  data: EmbeddingItem[];
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
};

type InputType = "query" | "document";
type EncodingFormat = "float" | "base64";

function decodeBase64Embedding(encoded: string, dimensions: number): number[] {
  const raw = Buffer.from(encoded, "base64");
  const expectedBytes = dimensions * 4;
  if (raw.length !== expectedBytes) {
    throw new UserError(
      `Base64 embedding payload length ${raw.length} does not match ${dimensions} dimensions (${expectedBytes} bytes expected)`,
    );
  }
  const floats: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    floats.push(raw.readFloatLE(i * 4));
  }
  return floats;
}

function normalizeEmbedding(
  value: number[] | string,
  encodingFormat: EncodingFormat,
  dimensions: number,
): number[] {
  if (encodingFormat === "base64" && typeof value === "string") {
    return decodeBase64Embedding(value, dimensions);
  }
  return value as number[];
}

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
    subtitle: '={{$parameter["model"]}}',
    version: 1,
    description: "Generate text embeddings via Caedral for use with Vector Store nodes",
    defaults: {
      name: "Caedral Embeddings",
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
        displayName: "Dimensions",
        name: "dimensions",
        type: "options",
        options: [{ name: "384", value: 384 }],
        default: EMBEDDING_DIMENSIONS,
        required: true,
        description: "Native embedding dimension of Caedral E1 Small",
      },
      {
        displayName: "Model Name or ID",
        name: "model",
        type: "options",
        typeOptions: { loadOptionsMethod: "getEmbeddingModels" },
        default: "caedral-embed-e1-small-v1",
        required: true,
        description:
          'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
      },
      {
        displayName: "Encoding Format",
        name: "encodingFormat",
        type: "options",
        options: [
          { name: "Base64", value: "base64" },
          { name: "Float", value: "float" },
        ],
        default: "float",
        description: 'Response encoding from the embeddings API. Base64 is decoded to float vectors for Vector Store compatibility.',
      },
      {
        displayName: "Batch Size",
        name: "batchSize",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 2048 },
        default: 512,
        description: "Maximum number of documents to embed in a single API call",
      },
    ],
  };

  methods = {
    loadOptions: {
      getEmbeddingModels,
    },
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
    const dimensions = this.getNodeParameter("dimensions", itemIndex) as number;
    const encodingFormat = this.getNodeParameter(
      "encodingFormat",
      itemIndex,
    ) as EncodingFormat;
    const batchSize = this.getNodeParameter("batchSize", itemIndex) as number;
    const helpers = this.helpers;
    const node = this.getNode();

    async function callEmbeddings(
      input: string | string[],
      inputType: InputType,
    ): Promise<number[][]> {
      const url = buildRequestUrl(baseUrl, "/v1/embeddings");
      let raw: unknown;
      try {
        raw = await helpers.httpRequest({
          method: "POST",
          url,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: {
            model,
            dimensions,
            input,
            input_type: inputType,
            encoding_format: encodingFormat,
          },
          json: true,
          returnFullResponse: true,
          ignoreHttpStatusErrors: true,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected error calling Caedral embeddings";
        throw new NodeApiError(node, { message }, { message, itemIndex });
      }

      const full = raw as { statusCode?: number; body?: EmbeddingResponse };
      const statusCode = Number(full.statusCode ?? (full.body ? 200 : 0));
      const responseBody = (full.body ?? raw) as EmbeddingResponse | CaedralApiErrorBody;

      if (statusCode >= 400) {
        const message = formatApiErrorMessage(
          statusCode,
          responseBody as CaedralApiErrorBody,
        );
        throw new NodeApiError(
          node,
          {
            message,
            httpCode: String(statusCode),
            description: safeErrorDescription(responseBody),
          },
          {
            message,
            httpCode: String(statusCode),
            description: safeErrorDescription(responseBody),
            itemIndex,
          },
        );
      }

      const response = responseBody as EmbeddingResponse;
      try {
        return response.data
          .sort((a, b) => a.index - b.index)
          .map((item) =>
            normalizeEmbedding(item.embedding, encodingFormat, dimensions),
          );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new NodeOperationError(node, message, { itemIndex });
      }
    }

    const embeddings = {
      lc_namespace: ["langchain", "embeddings", "caedral"],

      async embedDocuments(documents: string[]): Promise<number[][]> {
        if (documents.length === 0) return [];

        const results: number[][] = [];
        for (let i = 0; i < documents.length; i += batchSize) {
          const batch = documents.slice(i, i + batchSize);
          const batchResults = await callEmbeddings(batch, "document");
          results.push(...batchResults);
        }
        return results;
      },

      async embedQuery(query: string): Promise<number[]> {
        const results = await callEmbeddings(query, "query");
        return results[0] ?? [];
      },
    };

    return {
      response: embeddings,
    };
  }
}
