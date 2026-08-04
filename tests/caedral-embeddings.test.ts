import { describe, expect, it } from "vitest";
import { CaedralEmbeddings } from "../nodes/CaedralEmbeddings/CaedralEmbeddings.node";

describe("CaedralEmbeddings node", () => {
  it("exposes only E1 Small model and 384 dimensions", () => {
    const node = new CaedralEmbeddings();
    const modelProp = node.description.properties.find((p) => p.name === "model");
    const dimProp = node.description.properties.find(
      (p) => p.name === "dimensions",
    );
    expect(modelProp?.type).toBe("options");
    expect(modelProp?.default).toBe("caedral-embed-e1-small-v1");
    expect(dimProp?.type).toBe("options");
    expect(dimProp?.default).toBe(384);
  });
});
