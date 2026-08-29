export type CatalogRecommendedEndpoint = {
  method?: string;
  path?: string;
  content_type?: string;
  async?: boolean;
  status_path?: string;
  content_path?: string;
  aliases?: string[];
};

export type CatalogModel = {
  id: string;
  object?: string;
  name?: string;
  description?: string;
  context_window?: number;
  context_length?: number;
  max_output?: number;
  pricing_tier?: string;
  owned_by?: string;
  is_caedral_hosted?: boolean;
  is_free?: boolean;
  supported_parameters?: string[];
  supported_voices?: string[];
  default_parameters?: Record<string, unknown>;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  recommended_endpoint?: CatalogRecommendedEndpoint;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractDataArray(response: unknown): unknown[] | null {
  const root = asRecord(response);
  if (!root) return null;

  if (typeof root.statusCode === "number" && root.statusCode >= 400) {
    return null;
  }

  if (Array.isArray(root.data)) return root.data;

  const nestedBody = asRecord(root.body);
  if (nestedBody && Array.isArray(nestedBody.data)) return nestedBody.data;

  return null;
}

export function parseCatalogResponse(response: unknown): CatalogModel[] | null {
  const data = extractDataArray(response);
  if (!data) return null;

  return data.filter((entry): entry is CatalogModel => {
    const model = asRecord(entry);
    return typeof model?.id === "string" && model.id.trim().length > 0;
  }) as CatalogModel[];
}

export function endpointPath(model: CatalogModel): string | undefined {
  const path = model.recommended_endpoint?.path;
  return typeof path === "string" && path.trim() ? path.trim() : undefined;
}

export function endpointAliases(model: CatalogModel): string[] {
  const aliases = model.recommended_endpoint?.aliases;
  if (!Array.isArray(aliases)) return [];
  return aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0);
}

export function modelUsesEndpoint(model: CatalogModel, canonicalPath: string): boolean {
  const path = endpointPath(model);
  if (path === canonicalPath) return true;
  return endpointAliases(model).includes(canonicalPath);
}

export function filterModelsByEndpoint(
  models: CatalogModel[],
  canonicalPath: string,
): CatalogModel[] {
  return models.filter((model) => modelUsesEndpoint(model, canonicalPath));
}

export function distinctEndpointPaths(models: CatalogModel[]): string[] {
  const paths = new Set<string>();
  for (const model of models) {
    const path = endpointPath(model);
    if (path) paths.add(path);
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function findCatalogModel(
  models: CatalogModel[],
  modelId: string,
): CatalogModel | undefined {
  return models.find((model) => model.id === modelId);
}
