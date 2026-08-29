# n8n-nodes-caedral

Official [n8n](https://n8n.io/) community node for the [Caedral](https://caedral.com) API (**v2**).

Use Caedral chat, embeddings, rerank, vision, voice, model discovery, and prepaid account usage from n8n workflows. Chat and embeddings also connect to n8n AI Agent, Chain, and Vector Store nodes.

Production API: `https://api.caedral.com`

## Installation

### Self-hosted n8n

1. Open **Settings → Community Nodes**
2. Enter `n8n-nodes-caedral`
3. Click **Install**

Or via CLI:

```bash
cd ~/.n8n
npm install n8n-nodes-caedral
```

Restart n8n after installation.

### n8n Cloud

Community node verification for n8n Cloud is pending. Self-hosted instances can install from npm today.

## Credentials

Create a **Caedral API** credential:

| Field | Description |
|-------|-------------|
| **API Key** | Your `cd_live_...` key from the [Caedral dashboard](https://caedral.com/dashboard/api-keys) |
| **Base URL** | Default: `https://api.caedral.com`. Use `http://localhost:5001` for a local gateway |

n8n tests the credential with `GET /v1/usage` and `Authorization: Bearer <key>`.

API usage (except gated free Base / promo specialized) bills from **prepaid balance**. Top up at [caedral.com/dashboard/billing](https://caedral.com/dashboard/billing).

## Registered nodes

This package registers four nodes (the maximum n8n allows for this mix of node types):

| Node | Type | Role |
|------|------|------|
| **Caedral** | Action | Chat, embeddings, rerank, vision, voice, models, account |
| **Caedral Trigger** | Trigger | Poll prepaid balance and fire when it drops below a threshold |
| **Caedral Chat Model** | AI sub-node | Language model for AI Agent / Chain |
| **Caedral Embeddings** | AI sub-node | Embeddings for Vector Store nodes |

The v1 **Caedral Reranker** standalone AI sub-node is **not** registered. n8n community-node verification allows one regular node, one trigger, and up to two AI sub-nodes (chat model and embeddings). Reranking remains available on the main Caedral node (**AI → Rerank**).

## Main node resources

The action node uses a **Resource** selector. Execution still keys off the v1 **operation** identifiers, so existing workflows continue to run even if they were saved without `resource`.

### AI

| Operation | Endpoint | Notes |
|-----------|----------|--------|
| **Chat Completion** | `POST /v1/chat/completions` | Base, Titan, Olympus, Primordial. Simple or JSON messages. Optional temperature, max tokens, tools, `response_format`, penalties |
| **Create Embedding** | `POST /v1/embeddings` | `caedral-embed-e1-small-v1` (alias `caedral-embed`), 384 dimensions, `input_type`, `encoding_format` |
| **Rerank** | `POST /v1/rerank` | `caedral-rerank`, query + documents JSON array, `top_n`, optional minimum score |

### Audio

| Operation | Endpoint | Notes |
|-----------|----------|--------|
| **Generate Audio** | `POST /v1/audio/speech` | `caedral-voice`. Voices: Alloy, Ash, Ballad, Coral, Echo, Sage, Shimmer, Verse, or a custom ID. Default `alloy` |

### Image

| Operation | Endpoint | Notes |
|-----------|----------|--------|
| **Generate Image** | `POST /v1/images/generations` | `caedral-vision`. Prompt + size |

### Model

| Operation | Endpoint | Notes |
|-----------|----------|--------|
| **List Models** | `GET /v1/models` | Public catalog (chat + specialized) |
| **Get Model** | `GET /v1/models/:id` | Single model metadata |

### Account

| Operation | Endpoint | Notes |
|-----------|----------|--------|
| **Get Account Info** | `GET /v1/usage` | `accountStatus`, `balanceCents`, `balanceMilliCents`, `balanceWeightedUnitsAffordable` |
| **Get Usage** | `GET /v1/usage` | Same payload (kept for v1 operation compatibility) |

Chat supports **Simple** mode (single message + optional system prompt) or **JSON** mode (full messages array, including tool and multimodal content).

Streaming (`stream: true`) is supported by the Caedral API but is not exposed on the action node. n8n workflows should use non-streaming JSON. Use **Caedral Chat Model** inside an AI Agent for tool-calling loops.

## Model selection

Chat, embedding, rerank, image, and audio model fields load from `GET /v1/models` when credentials are available. The live catalog is filtered by each model's `recommended_endpoint.path` (and by `pricing_tier` / product IDs on the local branded gateway). If the catalog request fails, the node falls back to current Caedral product IDs. Those branded IDs remain in the list even when the public catalog uses a broader model set.

- Chat: `caedral-base`, `caedral-titan`, `caedral-olympus`, `caedral-primordial`
- Embeddings: `caedral-embed-e1-small-v1`, `caedral-embed`
- Rerank: `caedral-rerank`
- Image: `caedral-vision`
- Audio: `caedral-voice`

You can always set a model ID with an n8n expression.

## AI sub-nodes

### Caedral Chat Model

Connect the **Model** output to an n8n **AI Agent** or **Chain**.

- Dynamic chat model list (default Olympus)
- Temperature and max tokens
- Optional timeout and retries on HTTP 429/502/503/504
- `bindTools` for n8n Tools Agent

### Caedral Embeddings

Connect the **Embeddings** output to a **Vector Store** node.

- Default model: `caedral-embed-e1-small-v1` (Caedral E1 Small, 384 dimensions)
- Legacy prepaid alias: `caedral-embed`
- `embedQuery` sends `input_type: query`; `embedDocuments` sends `document`
- `encoding_format`: Float (default) or Base64 (decoded for Vector Store compatibility)
- Configurable batch size (default 512)

## Caedral Trigger

Polling trigger (set the interval in n8n trigger settings):

| Condition | Fires when |
|-----------|------------|
| **Balance Below Threshold** | Prepaid balance in USD cents drops below your threshold |

## Upgrade from v1.x to v2.x

### What still works

Existing **Caedral** action-node workflows keep their operation IDs (`chatCompletion`, `createEmbedding`, `rerank`, `audioGeneration`, `imageGeneration`, `listModels`, `getUsage`, `getAccountInfo`). If a workflow was saved without the new `resource` parameter, execution infers the resource from the operation.

Chat **temperature** / **maxTokens**, embeddings input, rerank documents JSON, and credential fields are unchanged.

**Caedral Chat Model** and **Caedral Embeddings** keep the same node names, credentials, and connection types. Subtitles now show the selected model.

### Breaking change: Caedral Reranker sub-node

The standalone **Caedral Reranker** AI sub-node was removed from the package.

n8n's community-node verification policy allows at most two AI sub-nodes in this package (chat model and embeddings). A third AI sub-node type is not permitted, so the Reranker registration was removed.

**Reranking is still supported.** Open the main **Caedral** node, set **Resource** to **AI**, and set **Operation** to **Rerank**.

If a workflow still references `caedralReranker`:

1. Remove the Reranker sub-node
2. Add **Caedral → AI → Rerank**
3. Pass the query and a JSON array of document strings
4. Use **Top N** / **Minimum Score** as before

### Other v2 changes

- Main node UI is grouped by resource (AI, Audio, Image, Model, Account)
- Model dropdowns load from the live catalog
- Audio voices match current Caedral Voice (gpt-audio): Alloy, Ash, Ballad, Coral, Echo, Sage, Shimmer, Verse — not the older TTS-1-only Fable / Nova / Onyx set
- Usage output includes `balanceMilliCents` and no longer invents subscription `plan` / pool fields
- API errors surface HTTP status and the Caedral `{ error: { type, message, code } }` envelope without leaking credentials

## Models and pricing

Authoritative pricing: [caedral.com/pricing](https://caedral.com/pricing) and [caedral.com/models](https://caedral.com/models). All API usage bills from **prepaid balance** only.

### Chat tiers

| Model ID | Tier | API pricing |
|----------|------|-------------|
| `caedral-base` | Base | Free ($0.01 min balance, not charged) |
| `caedral-titan` | Titan | $2 in / $0.20 cached / $6 out per 1M tokens |
| `caedral-olympus` | Olympus | $5 in / $0.50 cached / $15 out per 1M tokens |
| `caedral-primordial` | Primordial | $10 in / $1 cached / $30 out per 1M tokens |

### Specialized products

| Model ID | Modality | API pricing |
|----------|----------|-------------|
| `caedral-vision` | Image generation | $5 / 1M tokens |
| `caedral-embed-e1-small-v1` | Embeddings (E1 Small, 384d) | Free until 28 Sep 2026 (130 RPM, $0.01 gate) · then $0.001 / 1M tokens |
| `caedral-voice` | Audio / TTS | $15 / 1M tokens |
| `caedral-rerank` | Reranking | Free until 28 Sep 2026 (130 RPM, $0.01 gate) · then $0.0005 per search |

## Example workflows

### 1. AI Agent with Caedral Olympus

1. Add an **AI Agent** node
2. Connect **Caedral Chat Model** as the Language Model input
3. Select **Olympus** (or another catalog model)
4. Attach tools (HTTP Request, Code, etc.) to the agent

### 2. RAG pipeline with embeddings and rerank

1. **Trigger** — new document arrives (webhook, schedule, etc.)
2. **Caedral** → **AI** → **Create Embedding** — embed document chunks
3. Store vectors in your Vector Store node using **Caedral Embeddings**
4. On query: retrieve candidates, then **Caedral** → **AI** → **Rerank**
5. Feed top results to **Caedral Chat Model** or **Chat Completion**

### 3. Low balance alert

1. Add **Caedral Trigger** → **Balance Below Threshold**
2. Set threshold to `1000` (= $10.00)
3. Connect to Slack, Email, or Discord

### 4. Image generation webhook

1. **Webhook** trigger receives `{ "prompt": "..." }`
2. **Caedral** → **Image** → **Generate Image**
3. Return the image URL or binary in the webhook response

## Compatibility

- n8n: community node API v1 (`n8nNodesApiVersion: 1`)
- Node.js: >= 18.10
- Caedral API: current production `/v1` gateway at `https://api.caedral.com`

The gateway is OpenAI-compatible for chat completions. It is not full OpenAI API parity. Supported customer routes are listed above. `GET /health` and `GET /v1/status` exist on the gateway but are not exposed as n8n operations.

## Development

```bash
git clone https://github.com/trycaedral/n8n-nodes-caedral.git
cd n8n-nodes-caedral
npm install
npm run build
npm test
npm run lint
```

Official scanners:

```bash
npx @n8n/node-cli@latest lint
npx @n8n/scan-community-package@beta n8n-nodes-caedral
```

### Project structure

```
├── credentials/           # Caedral API credential type
├── nodes/
│   ├── Caedral/           # Main resource/operation node
│   ├── CaedralChatModel/  # AI Agent / Chain sub-node
│   ├── CaedralEmbeddings/ # Vector Store embeddings sub-node
│   └── CaedralTrigger/    # Polling trigger node
├── shared/                # Constants and pricing metadata
├── tests/                 # Integration tests
└── icons/                 # Node icons (light + dark)
```

## Links

- [Caedral Documentation](https://caedral.com/docs)
- [API Reference](https://caedral.com/docs/api-reference)
- [n8n Integration Guide](https://caedral.com/docs/n8n-overview)
- [Pricing](https://caedral.com/pricing)
- [Report Issues](https://github.com/trycaedral/n8n-nodes-caedral/issues)

## License

MIT
