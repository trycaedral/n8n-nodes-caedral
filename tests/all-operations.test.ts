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
  const subId = crypto.randomUUID();
  const rawKey = `cd_live_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = await bcrypt.hash(rawKey, 10);
  const email = `n8n-ops-test-${userId}@example.com`;

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, balance_cents, account_status)
    VALUES (${userId}, ${"N8N Ops Test"}, ${email}, ${true}, ${5000}, ${"active"})
  `;
  await sql`
    INSERT INTO subscriptions (id, user_id, plan, status, weekly_pool_limit, weekly_pool_used)
    VALUES (${subId}, ${userId}, ${"pro"}, ${"active"}, ${1000000}, ${0})
  `;
  await sql`
    INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash)
    VALUES (${keyId}, ${userId}, ${"n8n ops test"}, ${keyPrefix}, ${keyHash})
  `;

  const cleanup = async () => {
    await sql`DELETE FROM api_keys WHERE id = ${keyId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${subId}`;
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

describe("n8n node — all operations integration", () => {
  let skipIntegration = !process.env.DATABASE_URL;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    const healthy = await gatewayHealthy();
    if (!healthy) {
      skipIntegration = true;
      console.warn(
        `[n8n integration] Gateway not reachable at ${BASE_URL} — skipping live HTTP tests`,
      );
    }
  });

  it.skipIf(skipIntegration)(
    "GET /v1/models — list models",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/models");
        const res = await fetch(url, { headers: headers(rawKey) });
        expect(res.status).toBe(200);

        const body = (await res.json()) as { object: string; data: Array<{ id: string }> };
        expect(body.object).toBe("list");
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data.some((m) => m.id === "caedral-base")).toBe(true);
        expect(body.data.some((m) => m.id === "caedral-vision")).toBe(true);
        expect(body.data.some((m) => m.id === "caedral-embed")).toBe(true);
      } finally {
        await cleanup();
      }
    },
    30_000,
  );

  it.skipIf(skipIntegration)(
    "GET /v1/usage — get account info",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/usage");
        const res = await fetch(url, { headers: headers(rawKey) });
        expect(res.status).toBe(200);

        const body = (await res.json()) as { plan?: string; balanceCents?: number };
        expect(body.plan).toBe("pro");
        expect(typeof body.balanceCents).toBe("number");
      } finally {
        await cleanup();
      }
    },
    30_000,
  );

  it.skipIf(skipIntegration)(
    "POST /v1/chat/completions — chat with system prompt",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/chat/completions");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: "caedral-base",
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

  it.skipIf(skipIntegration)(
    "POST /v1/embeddings — create embedding",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/embeddings");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: "caedral-embed",
            input: "Hello world",
          }),
        });

        expect([200, 402, 502]).toContain(res.status);
        if (res.status === 200) {
          const json = (await res.json()) as {
            data?: Array<{ embedding?: number[] }>;
            model?: string;
          };
          expect(json.model).toBe("caedral-embed");
          expect(json.data?.[0]?.embedding?.length).toBeGreaterThan(0);
        }
      } finally {
        await cleanup();
      }
    },
    45_000,
  );

  it.skipIf(skipIntegration)(
    "POST /v1/images/generations — generate image",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/images/generations");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: "caedral-vision",
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

  it.skipIf(skipIntegration)(
    "POST /v1/audio/speech — generate audio",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/audio/speech");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: "caedral-voice",
            input: "Hello world",
            voice: "alloy",
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

  it.skipIf(skipIntegration)(
    "POST /v1/rerank — rerank documents",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/rerank");
        const res = await fetch(url, {
          method: "POST",
          headers: headers(rawKey),
          body: JSON.stringify({
            model: "caedral-rerank",
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

  it.skipIf(skipIntegration)(
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

  it.skipIf(skipIntegration)(
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

  it.skipIf(skipIntegration)(
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
