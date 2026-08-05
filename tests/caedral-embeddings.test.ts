import { describe, expect, it, vi } from "vitest";
import { CaedralEmbeddings } from "../nodes/CaedralEmbeddings/CaedralEmbeddings.node";

function findOptionValues(
  prop: { options?: Array<{ value: unknown }> } | undefined,
): unknown[] {
  return prop?.options?.map((o) => o.value) ?? [];
}

describe("CaedralEmbeddings node", () => {
  it("exposes E1 Small and legacy caedral-embed models with 384 dimensions", () => {
    const node = new CaedralEmbeddings();
    const modelProp = node.description.properties.find((p) => p.name === "model");
    const dimProp = node.description.properties.find(
      (p) => p.name === "dimensions",
    );
    expect(modelProp?.type).toBe("options");
    expect(findOptionValues(modelProp)).toEqual([
      "caedral-embed-e1-small-v1",
      "caedral-embed",
    ]);
    expect(modelProp?.default).toBe("caedral-embed-e1-small-v1");
    expect(dimProp?.type).toBe("options");
    expect(dimProp?.default).toBe(384);
  });

  it("exposes input_type and encoding_format options for OpenRouter readiness", () => {
    const node = new CaedralEmbeddings();
    const inputTypeProp = node.description.properties.find(
      (p) => p.name === "inputType",
    );
    const encodingProp = node.description.properties.find(
      (p) => p.name === "encodingFormat",
    );
    expect(findOptionValues(inputTypeProp)).toEqual(["query", "document"]);
    expect(findOptionValues(encodingProp)).toEqual(["float", "base64"]);
    expect(encodingProp?.default).toBe("float");
  });

  it("embedQuery sends input_type query and embedDocuments sends document", async () => {
    const node = new CaedralEmbeddings();
    const bodies: Array<Record<string, unknown>> = [];

    const mockContext = {
      getCredentials: vi.fn().mockResolvedValue({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter: vi.fn((name: string) => {
        const values: Record<string, unknown> = {
          model: "caedral-embed-e1-small-v1",
          dimensions: 384,
          encodingFormat: "float",
          batchSize: 512,
        };
        return values[name];
      }),
      helpers: {
        httpRequest: vi.fn(async (opts: { body: Record<string, unknown> }) => {
          bodies.push(opts.body);
          const input = opts.body.input;
          const items = Array.isArray(input) ? input : [input];
          return {
            model: "caedral-embed-e1-small-v1",
            data: items.map((_: unknown, index: number) => ({
              index,
              embedding: [0.1, 0.2, 0.3],
            })),
          };
        }),
      },
    };

    const { response } = await node.supplyData.call(
      mockContext as never,
      0,
    );
    const embeddings = response as {
      embedQuery: (q: string) => Promise<number[]>;
      embedDocuments: (docs: string[]) => Promise<number[][]>;
    };

    await embeddings.embedQuery("what is RAG?");
    await embeddings.embedDocuments(["chunk one", "chunk two"]);

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      model: "caedral-embed-e1-small-v1",
      dimensions: 384,
      input: "what is RAG?",
      input_type: "query",
      encoding_format: "float",
    });
    expect(bodies[1]).toMatchObject({
      input: ["chunk one", "chunk two"],
      input_type: "document",
      encoding_format: "float",
    });
  });

  it("decodes base64 embeddings to float vectors", async () => {
    const node = new CaedralEmbeddings();
    const vector = [0.25, -0.5, 0.75];
    const packed = Buffer.alloc(12);
    vector.forEach((v, i) => packed.writeFloatLE(v, i * 4));
    const encoded = packed.toString("base64");

    const mockContext = {
      getCredentials: vi.fn().mockResolvedValue({
        apiKey: "cd_live_test",
        baseUrl: "https://api.caedral.com",
      }),
      getNodeParameter: vi.fn((name: string) => {
        const values: Record<string, unknown> = {
          model: "caedral-embed",
          dimensions: 3,
          encodingFormat: "base64",
          batchSize: 512,
        };
        return values[name];
      }),
      helpers: {
        httpRequest: vi.fn(async () => ({
          model: "caedral-embed-e1-small-v1",
          data: [{ index: 0, embedding: encoded }],
        })),
      },
    };

    const { response } = await node.supplyData.call(
      mockContext as never,
      0,
    );
    const embeddings = response as {
      embedQuery: (q: string) => Promise<number[]>;
    };

    const result = await embeddings.embedQuery("test");
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(0.25, 5);
    expect(result[1]).toBeCloseTo(-0.5, 5);
    expect(result[2]).toBeCloseTo(0.75, 5);
  });
});
