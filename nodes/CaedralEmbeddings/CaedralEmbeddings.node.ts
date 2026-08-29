import type {
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError, UserError } from "n8n-workflow";

import { DEFAULT_TIMEOUT_MS } from "../../shared/constants";
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

function decodeBase64Embedding(encoded: string, dimensions?: number): number[] {
  const raw = Buffer.from(encoded, "base64");
  if (raw.length === 0 || raw.length % 4 !== 0) {
    throw new UserError(
      `Base64 embedding payload length ${raw.length} is not a multiple of 4 bytes`,
    );
  }
  const inferred = raw.length / 4;
  const expected = dimensions && dimensions > 0 ? dimensions : inferred;
  const expectedBytes = expected * 4;
  if (raw.length !== expectedBytes) {
    throw new UserError(
      `Base64 embedding payload length ${raw.length} does not match ${expected} dimensions (${expectedBytes} bytes expected)`,
    );
  }
  const floats: number[] = [];
  for (let i = 0; i < expected; i++) {
    floats.push(raw.readFloatLE(i * 4));
  }
  return floats;
}

function normalizeEmbedding(
  value: number[] | string,
  encodingFormat: EncodingFormat,
  dimensions?: number,
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
      light: "file:caedral.svg",
      dark: "file:caedral.dark.svg",
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
        displayName: "Model Name or ID",
        name: "model",
        type: "options",
        typeOptions: { loadOptionsMethod: "getEmbeddingModels" },
        default: "",
        required: true,
        description:
          'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
      },
      {
        displayName: "Dimensions",
        name: "dimensions",
        type: "number",
        typeOptions: { minValue: 0 },
        default: 0,
        description:
          "Optional output dimensionality sent as dimensions. Set to 0 to omit. Do not assume 384 unless the selected model documents that size.",
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
        description: "Response encoding from the embeddings API. Base64 is decoded to float vectors for Vector Store compatibility.",
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
    if (!model?.trim()) {
      throw new NodeOperationError(
        this.getNode(),
        "Model is required. Choose a catalog embedding model or set a model ID with an expression.",
        { itemIndex },
      );
    }
    const dimensions = this.getNodeParameter("dimensions", itemIndex, 0) as number;
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
      const body: Record<string, unknown> = {
        model,
        input,
        input_type: inputType,
        encoding_format: encodingFormat,
      };
      if (typeof dimensions === "number" && dimensions > 0) {
        body.dimensions = dimensions;
      }

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
          body,
          json: true,
          returnFullResponse: true,
          ignoreHttpStatusErrors: true,
          timeout: DEFAULT_TIMEOUT_MS,
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
            normalizeEmbedding(
              item.embedding,
              encodingFormat,
              dimensions > 0 ? dimensions : undefined,
            ),
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
