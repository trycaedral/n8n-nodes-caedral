import type { IExecuteFunctions, IHttpRequestOptions, JsonObject } from "n8n-workflow";
import { NodeApiError } from "n8n-workflow";

import { DEFAULT_TIMEOUT_MS } from "../../shared/constants";
import {
  formatApiErrorMessage,
  safeErrorDescription,
  type CaedralApiErrorBody,
} from "./helpers";
import { buildRequestUrl } from "./helpers";

function toJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return { message: value instanceof Error ? value.message : String(value) };
}

function httpCodeFromUnknown(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as {
    httpCode?: unknown;
    statusCode?: unknown;
    status?: unknown;
    response?: { statusCode?: unknown; status?: unknown };
  };
  const code =
    record.httpCode ??
    record.statusCode ??
    record.status ??
    record.response?.statusCode ??
    record.response?.status;
  return code !== undefined && code !== null ? String(code) : undefined;
}

/**
 * Authenticated request to the Caedral gateway.
 *
 * Network failures and HTTP 4xx/5xx are both converted to NodeApiError.
 * NodeApiError is thrown outside the network try/catch so it is never
 * identity-rethrown from a catch block.
 */
export async function caedralRequest<T>(
  context: IExecuteFunctions,
  options: {
    baseUrl: string;
    method: "GET" | "POST";
    path: string;
    body?: Record<string, unknown>;
    itemIndex: number;
    timeout?: number;
  },
): Promise<T> {
  const url = buildRequestUrl(options.baseUrl, options.path);
  const requestOptions: IHttpRequestOptions = {
    method: options.method,
    url,
    headers: {
      Accept: "application/json",
    },
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
  };

  if (options.body !== undefined) {
    requestOptions.headers = {
      ...requestOptions.headers,
      "Content-Type": "application/json",
    };
    requestOptions.body = options.body;
  }

  let response: { statusCode?: number; body?: unknown };

  try {
    response = (await context.helpers.httpRequestWithAuthentication.call(
      context,
      "caedralApi",
      requestOptions,
    )) as { statusCode?: number; body?: unknown };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error calling Caedral API";
    throw new NodeApiError(context.getNode(), toJsonObject(error), {
      message: `Caedral API request failed: ${message}`,
      httpCode: httpCodeFromUnknown(error),
      itemIndex: options.itemIndex,
    });
  }

  const statusCode = Number(response.statusCode ?? 0);
  const responseBody = response.body as T | CaedralApiErrorBody;

  if (statusCode >= 400) {
    const message = formatApiErrorMessage(statusCode, responseBody as CaedralApiErrorBody);
    throw new NodeApiError(
      context.getNode(),
      {
        message,
        httpCode: String(statusCode),
        description: safeErrorDescription(responseBody),
      },
      {
        message,
        httpCode: String(statusCode),
        description: safeErrorDescription(responseBody),
        itemIndex: options.itemIndex,
      },
    );
  }

  return responseBody as T;
}
