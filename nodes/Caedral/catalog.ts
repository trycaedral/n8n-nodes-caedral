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
  display_name?: string;
  provider?: string;
  is_caedral_hosted?: boolean;
  is_free?: boolean;
  supported_parameters?: string[];
  supported_voices?: unknown;
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

export function parseModelDetailResponse(
  response: unknown,
  modelId: string,
): CatalogModel | null {
  const listed = parseCatalogResponse(response);
  if (listed) {
    return findCatalogModel(listed, modelId) ?? null;
  }

  const root = asRecord(response);
  if (!root) return null;

  if (typeof root.statusCode === "number" && root.statusCode >= 400) {
    return null;
  }

  const body = asRecord(root.body) ?? root;
  if (typeof body.statusCode === "number" && body.statusCode >= 400) {
    return null;
  }

  if (typeof body.id === "string" && body.id.trim().length > 0) {
    return body as CatalogModel;
  }

  return null;
}

export function parseSupportedVoices(raw: unknown): CatalogSelectOption[] {
  if (!Array.isArray(raw)) return [];

  const options: CatalogSelectOption[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    let value = "";
    let name = "";

    if (typeof entry === "string") {
      value = entry.trim();
      name = value;
    } else {
      const record = asRecord(entry);
      if (!record) continue;
      value = firstNonEmpty(record.id, record.voice, record.value);
      name = firstNonEmpty(record.name, record.display_name, record.label) || value;
    }

    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ name, value });
  }

  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function catalogProvider(model: CatalogModel): string {
  const explicit = firstNonEmpty(model.provider, model.owned_by);
  if (explicit) return explicit.replace(/^~/, "");
  const slash = model.id.indexOf("/");
  if (slash > 0) return model.id.slice(0, slash).replace(/^~/, "");
  return "";
}

export function catalogDisplayName(model: CatalogModel): string {
  return firstNonEmpty(model.display_name, model.name) || model.id;
}

/** Dropdown label. The option value must remain the exact catalog `id`. */
export function catalogOptionLabel(model: CatalogModel): string {
  const named = firstNonEmpty(model.display_name, model.name);
  const provider = catalogProvider(model);
  if (named && provider && named.toLowerCase() !== provider.toLowerCase()) {
    return `${named} — ${provider}`;
  }
  return named || model.id;
}

export type CatalogSelectOption = {
  name: string;
  value: string;
  description?: string;
};

export function toCatalogSelectOptions(models: CatalogModel[]): CatalogSelectOption[] {
  const options = models.map((model) => {
    const option: CatalogSelectOption = {
      name: catalogOptionLabel(model),
      value: model.id,
    };
    if (typeof model.description === "string" && model.description.trim()) {
      option.description = model.description;
    }
    return option;
  });
  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

export function optionsForEndpoint(
  models: CatalogModel[],
  canonicalPath: string,
): CatalogSelectOption[] {
  return toCatalogSelectOptions(filterModelsByEndpoint(models, canonicalPath));
}
