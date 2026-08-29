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

function headerValue(
  headers: unknown,
  name: string,
): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const record = headers as Record<string, unknown>;
  const direct = record[name] ?? record[name.toLowerCase()];
  if (typeof direct === "string" && direct.trim()) return direct;
  if (Array.isArray(direct) && typeof direct[0] === "string") return direct[0];
  return undefined;
}

function throwIfHttpError(
  context: IExecuteFunctions,
  statusCode: number,
  responseBody: unknown,
  itemIndex: number,
): void {
  if (statusCode < 400) return;
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
      itemIndex,
    },
  );
}

export type CaedralRequestOptions = {
  baseUrl: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown> | FormData;
  json?: boolean;
  encoding?: IHttpRequestOptions["encoding"];
  accept?: string;
  itemIndex: number;
  timeout?: number;
};

async function sendCaedralRequest(
  context: IExecuteFunctions,
  options: CaedralRequestOptions,
): Promise<{ statusCode: number; body: unknown; headers?: unknown }> {
  const url = buildRequestUrl(options.baseUrl, options.path);
  const json = options.json !== false && !(options.body instanceof FormData);
  const requestOptions: IHttpRequestOptions = {
    method: options.method,
    url,
    headers: {
      Accept: options.accept ?? (json ? "application/json" : "*/*"),
    },
    json,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
  };

  if (options.encoding) {
    requestOptions.encoding = options.encoding;
  }

  if (options.body instanceof FormData) {
    requestOptions.body = options.body;
    requestOptions.json = false;
  } else if (options.body !== undefined) {
    requestOptions.headers = {
      ...requestOptions.headers,
      "Content-Type": "application/json",
    };
    requestOptions.body = options.body;
  }

  try {
    return (await context.helpers.httpRequestWithAuthentication.call(
      context,
      "caedralApi",
      requestOptions,
    )) as { statusCode: number; body: unknown; headers?: unknown };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error calling Caedral API";
    throw new NodeApiError(context.getNode(), toJsonObject(error), {
      message: `Caedral API request failed: ${message}`,
      httpCode: httpCodeFromUnknown(error),
      itemIndex: options.itemIndex,
    });
  }
}

/**
 * Authenticated JSON request to the Caedral gateway.
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
    body?: Record<string, unknown> | FormData;
    itemIndex: number;
    timeout?: number;
  },
): Promise<T> {
  const response = await sendCaedralRequest(context, {
    ...options,
    json: true,
  });
  const statusCode = Number(response.statusCode ?? 0);
  throwIfHttpError(context, statusCode, response.body, options.itemIndex);
  return response.body as T;
}

export async function caedralRequestBinary(
  context: IExecuteFunctions,
  options: {
    baseUrl: string;
    method: "GET" | "POST";
    path: string;
    body?: Record<string, unknown> | FormData;
    itemIndex: number;
    timeout?: number;
    fallbackMimeType: string;
    fallbackFileName: string;
  },
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const response = await sendCaedralRequest(context, {
    ...options,
    json: false,
    encoding: "arraybuffer",
    accept: `${options.fallbackMimeType.split("/")[0] || "*"}/*, application/octet-stream, application/json, */*`,
  });
  const statusCode = Number(response.statusCode ?? 0);

  const body = response.body;
  if (statusCode >= 400) {
    let parsed: unknown = body;
    if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        parsed = body.toString("utf8");
      }
    } else if (typeof body === "string") {
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = body;
      }
    }
    throwIfHttpError(context, statusCode, parsed, options.itemIndex);
  }

  const buffer = toBuffer(body);
  if (!buffer) {
    throw new NodeApiError(
      context.getNode(),
      { message: "Caedral API returned a non-binary body" },
      { message: "Caedral API returned a non-binary body", itemIndex: options.itemIndex },
    );
  }
  const mimeType =
    headerValue(response.headers, "content-type")?.split(";")[0]?.trim() ||
    options.fallbackMimeType;
  const disposition = headerValue(response.headers, "content-disposition");
  const fileName = filenameFromDisposition(disposition) || options.fallbackFileName;

  return { buffer, mimeType, fileName };
}

function toBuffer(body: unknown): Buffer | null {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof body === "string") return Buffer.from(body);
  return null;
}

function filenameFromDisposition(header?: string): string | undefined {
  if (!header) return undefined;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) return decodeURIComponent(star[1]);
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim();
}
