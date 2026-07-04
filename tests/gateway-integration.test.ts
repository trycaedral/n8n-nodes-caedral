import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  buildChatCompletionBody,
  buildRequestUrl,
  normalizeBaseUrl,
} from "../nodes/Caedral/helpers";

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

async function createEphemeralKey(): Promise<{ rawKey: string; cleanup: () => Promise<void> }> {
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
  const email = `n8n-test-${userId}@example.com`;

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, balance_cents, account_status)
    VALUES (${userId}, ${"N8N Test"}, ${email}, ${true}, ${0}, ${"active"})
  `;
  await sql`
    INSERT INTO subscriptions (id, user_id, plan, status, weekly_pool_limit, weekly_pool_used)
    VALUES (${subId}, ${userId}, ${"pro"}, ${"active"}, ${1000000}, ${0})
  `;
  await sql`
    INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash)
    VALUES (${keyId}, ${userId}, ${"n8n test"}, ${keyPrefix}, ${keyHash})
  `;

  const cleanup = async () => {
    await sql`DELETE FROM api_keys WHERE id = ${keyId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${subId}`;
    await sql`DELETE FROM "user" WHERE id = ${userId}`;
    await sql.end();
  };

  return { rawKey, cleanup };
}

describe("n8n node — gateway integration (mirrors credential test + chat)", () => {
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
    "credential test: GET /v1/usage with Bearer token",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const url = buildRequestUrl(BASE_URL, "/v1/usage");
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${rawKey}`,
            Accept: "application/json",
          },
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as { plan?: string; balanceCents?: number };
        expect(body.plan).toBeDefined();
        expect(typeof body.balanceCents).toBe("number");
      } finally {
        await cleanup();
      }
    },
    30_000,
  );

  it.skipIf(skipIntegration)(
    "chat completion operation against live gateway",
    async () => {
      const { rawKey, cleanup } = await createEphemeralKey();
      try {
        const body = buildChatCompletionBody({
          model: "caedral-base",
          messageMode: "simple",
          message: "Reply with: n8n OK",
        });

        const url = buildRequestUrl(BASE_URL, "/v1/chat/completions");
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rawKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
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
});
