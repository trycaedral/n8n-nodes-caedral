import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { resolve } from "node:path";
import { buildRequestUrl, normalizeBaseUrl } from "../nodes/Caedral/helpers";

config({ path: resolve(__dirname, "../.env") });

const BASE_URL = normalizeBaseUrl(
  process.env.CAEDRAL_BASE_URL ?? "http://localhost:5001",
);

async function gatewayHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function createEphemeralKey(): Promise<{
  rawKey: string;
  cleanup: () => Promise<void>;
}> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const postgres = (await import("postgres")).default;
  const bcrypt = (await import("bcryptjs")).default;
  const sql = postgres(url, { prepare: false });

  const userId = crypto.randomUUID();
  const keyId = crypto.randomUUID();
  const rawKey = `cd_live_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = await bcrypt.hash(rawKey, 10);
  const email = `n8n-ops-test-${userId}@example.com`;

  // Minimal user row for optional local-gateway tests.
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, balance_cents, account_status)
    VALUES (${userId}, ${"N8N Ops Test"}, ${email}, ${true}, ${5000}, ${"active"})
  `;
  await sql`
    INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash)
    VALUES (${keyId}, ${userId}, ${"n8n ops test"}, ${keyPrefix}, ${keyHash})
  `;

  const cleanup = async () => {
    await sql`DELETE FROM api_keys WHERE id = ${keyId}`;
    await sql`DELETE FROM "user" WHERE id = ${userId}`;
    await sql.end();
  };

  return { rawKey, cleanup };
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

type LiveModel = {
  id: string;
  recommended_endpoint?: { path?: string };
  supported_voices?: string[];
};

async function catalogModels(apiKey: string): Promise<LiveModel[]> {
  const res = await fetch(buildRequestUrl(BASE_URL, "/v1/models"), { headers: headers(apiKey) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { object?: string; data?: LiveModel[] };
  expect(Array.isArray(body.data)).toBe(true);
  expect((body.data ?? []).length).toBeGreaterThan(0);
  return body.data ?? [];
}

function firstModelForPath(models: LiveModel[], path: string): string {
  const match = models.find((model) => model.recommended_endpoint?.path === path);
  if (!match) {
    throw new Error(`Live catalog at ${BASE_URL} has no model for ${path}`);
  }
  return match.id;
}

// Live HTTP tests require a running gateway. Opt in with:
//   DATABASE_URL=... CAEDRAL_GATEWAY_LIVE=1 npm test
// skipIf is evaluated at collection time — cannot flip after beforeAll.
const runLiveGateway =
  Boolean(process.env.DATABASE_URL) &&
  process.env.CAEDRAL_GATEWAY_LIVE === "1";

describe.skipIf(!runLiveGateway)("n8n node — all operations integration", () => {
  beforeAll(async () => {
    const healthy = await gatewayHealthy();
    if (!healthy) {
      throw new Error(
        `[n8n integration] CAEDRAL_GATEWAY_LIVE=1 but gateway not reachable at ${BASE_URL}`,
      );
    }
  });

  it(
    "GET /v1/models — list models",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/models");
        const res = await fetch(url, { headers: headers(rawKey) });
        expect(res.status).toBe(200);

        const body = (await res.json()) as {
          object: string;
          data: Array<{ id: string; recommended_endpoint?: { path?: string } }>;
        };
        expect(body.object).toBe("list");
        expect(body.data.length).toBeGreaterThan(0);
        const paths = new Set(
          body.data
            .map((model) => model.recommended_endpoint?.path)
            .filter((path): path is string => typeof path === "string"),
        );
        expect(paths.size).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    },
    30_000,
  );

  it(
    "GET /v1/usage — get account info",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/usage");
        const res = await fetch(url, { headers: headers(rawKey) });
        expect(res.status).toBe(200);

        const body = (await res.json()) as {
          accountStatus?: string;
          plan?: { id?: string; name?: string };
          pools?: { caedral?: { percentUsed?: number } };
          onDemand?: { mode?: string };
          balanceCents?: number;
        };
        expect(typeof body.accountStatus).toBe("string");
        expect(body.plan).toBeTypeOf("object");
        expect(body.pools).toBeTypeOf("object");
        expect(body.onDemand).toBeTypeOf("object");
        expect(body.balanceCents).toBeUndefined();
      } finally {
        await cleanup();
      }
    },
    30_000,
  );

  it(
    "POST /v1/chat/completions — chat with system prompt",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/chat/completions");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: firstModelForPath(await catalogModels(rawKey), "/v1/chat/completions"),
            messages: [
              { role: "system", content: "You are a helpful assistant. Reply with exactly: SYSTEM_OK" },
              { role: "user", content: "Test" },
            ],
          }),
        });

        expect([200, 502]).toContain(res.status);
        if (res.status === 200) {
          const json = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          expect(json.choices?.[0]?.message?.content).toBeTruthy();
        }
      } finally {
        await cleanup();
      }
    },
    45_000,
  );

  it(
    "POST /v1/embeddings — create embedding",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/embeddings");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: firstModelForPath(await catalogModels(rawKey), "/v1/embeddings"),
            input: "Hello world",
          }),
        });

        expect([200, 402, 502]).toContain(res.status);
        if (res.status === 200) {
          const json = (await res.json()) as {
            data?: Array<{ embedding?: number[] }>;
            model?: string;
          };
          expect(json.model).toBeTruthy();
          expect(json.data?.[0]?.embedding?.length).toBeGreaterThan(0);
        }
      } finally {
        await cleanup();
      }
    },
    45_000,
  );

  it(
    "POST /v1/images/generations — generate image",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/images/generations");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: firstModelForPath(await catalogModels(rawKey), "/v1/images/generations"),
            prompt: "A red circle on white background",
            size: "1024x1024",
          }),
        });

        expect([200, 402, 502]).toContain(res.status);
        if (res.status === 200) {
          const json = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
          expect(json.data?.length).toBeGreaterThan(0);
        }
      } finally {
        await cleanup();
      }
    },
    60_000,
  );

  it(
    "POST /v1/audio/speech — generate audio",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/audio/speech");
        const models = await catalogModels(rawKey);
        const speechModel = models.find(
          (model) => model.recommended_endpoint?.path === "/v1/audio/speech",
        );
        expect(speechModel?.id).toBeTruthy();
        const voice = speechModel?.supported_voices?.[0];
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: speechModel?.id,
            input: "Hello world",
            ...(voice ? { voice } : {}),
          }),
        });

        expect([200, 402, 502]).toContain(res.status);
        if (res.status === 200) {
          const json = await res.json();
          expect(json).toBeDefined();
        }
      } finally {
        await cleanup();
      }
    },
    45_000,
  );

  it(
    "POST /v1/rerank — rerank documents",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/rerank");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: firstModelForPath(await catalogModels(rawKey), "/v1/rerank"),
            query: "What is the capital of France?",
            documents: [
              "Paris is the capital of France.",
              "Berlin is in Germany.",
              "London is in England.",
            ],
            top_n: 2,
          }),
        });

        expect([200, 402, 502]).toContain(res.status);
        if (res.status === 200) {
          const json = (await res.json()) as {
            results?: Array<{ index: number; relevance_score: number }>;
          };
          expect(json.results?.length).toBe(2);
          expect(json.results?.[0]?.index).toBe(0);
        }
      } finally {
        await cleanup();
      }
    },
    45_000,
  );

  it(
    "401 for invalid API key on protected endpoint",
    async () => {
      const url = buildRequestUrl(BASE_URL, "/v1/usage");
      const res = await fetch(url, {
        headers: headers("cd_live_INVALID_KEY_123"),
      });
      expect(res.status).toBe(401);
    },
    15_000,
  );

  it(
    "401 for malformed API key",
    async () => {
      const url = buildRequestUrl(BASE_URL, "/v1/usage");
      const res = await fetch(url, {
        headers: headers("not_a_valid_key_at_all"),
      });
      expect(res.status).toBe(401);
    },
    15_000,
  );

  it(
    "401 for missing Authorization header",
    async () => {
      const url = buildRequestUrl(BASE_URL, "/v1/usage");
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      expect(res.status).toBe(401);
    },
    15_000,
  );
});
