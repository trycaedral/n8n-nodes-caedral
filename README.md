# n8n-nodes-caedral

Community node for [n8n](https://n8n.io/) that integrates with [Caedral AI](https://caedral.com) — unified access to chat, vision, embeddings, voice, rerank, AI agents, vector stores, and account monitoring through one API.

## Installation

### Self-hosted n8n

1. Open **Settings → Community Nodes**
2. Enter `n8n-nodes-caedral`
3. Click **Install**

Or via CLI inside your n8n data directory:

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
| **Base URL** | Default: `https://api.caedral.com`. Use `http://localhost:5001` for local development |

**Setup walkthrough:**

1. Sign up at [caedral.com/signup](https://caedral.com/signup)
2. Open **Dashboard → API Keys** and create a key
3. In n8n, go to **Credentials → Add credential → Caedral API**
4. Paste your API key and save — n8n validates it with `GET /v1/usage`

API usage (except `caedral-base` under fair use) bills from **prepaid balance**, not Caedral Chat plan pools. Top up at [caedral.com/dashboard/billing](https://caedral.com/dashboard/billing).

## Nodes

### Caedral (main node)

Eight operations covering the full Caedral API:

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| **Chat Completion** | `POST /v1/chat/completions` | Send messages to Base, Titan, Olympus, or Primordial |
| **Generate Image** | `POST /v1/images/generations` | Text-to-image via Caedral Vision |
| **Create Embedding** | `POST /v1/embeddings` | Vector embeddings via Caedral Embed |
| **Generate Audio** | `POST /v1/audio/speech` | Text-to-speech via Caedral Voice |
| **Rerank** | `POST /v1/rerank` | Semantic document reranking |
| **List Models** | `GET /v1/models` | All available chat and specialized models |
| **Get Usage** | `GET /v1/usage` | Pool balance, weekly usage, overage status |
| **Get Account Info** | `GET /v1/usage` | Account status, plan, and balance details |

Chat supports **Simple** mode (single message + optional system prompt) or **JSON** mode (full messages array).

### Caedral Chat Model (AI sub-node)

Language model sub-node for n8n **AI Agent** and **Chain** nodes. Connect its **Model** output to the agent's language model input.

- Select chat tier (Base / Titan / Olympus / Primordial)
- Configure temperature and max tokens
- Works with all standard n8n AI Agent tool patterns

### Caedral Embeddings (Vector Store sub-node)

Embedding model sub-node for n8n **Vector Store** nodes. Provides `embedDocuments` and `embedQuery` via `POST /v1/embeddings`.

- Default model: `caedral-embed`
- Configurable batch size (default 512)

### Caedral Reranker (Vector Store sub-node)

Reranker sub-node for Vector Store retrieval pipelines. Implements LangChain's `compressDocuments` via `POST /v1/rerank`.

- Default model: `caedral-rerank`
- Top N and minimum relevance score filters

### Caedral Trigger (polling)

Polling trigger for account conditions (configure interval in n8n trigger settings):

| Condition | Fires when |
|-----------|------------|
| **Balance Below Threshold** | Prepaid balance in cents drops below your threshold |
| **Pool Usage Above Percentage** | Weekly chat pool usage exceeds a percentage |

## Models & pricing

Pricing sources: [caedral.com/pricing](https://caedral.com/pricing), `site/src/content/site.ts`, `site/src/content/models.ts`, `api-gateway/src/config/specialized-products.ts`.

### Chat tiers

| Model ID | Tier | Upstream model | API pricing |
|----------|------|----------------|-------------|
| `caedral-base` | Base | deepseek/deepseek-v4-flash | Free (200K/wk fair use) |
| `caedral-titan` | Titan | anthropic/claude-haiku-4.5 | $1 in / $5 out per 1M tokens |
| `caedral-olympus` | Olympus | anthropic/claude-sonnet-5 | $2 in / $10 out per 1M tokens |
| `caedral-primordial` | Primordial | anthropic/claude-opus-4.8 | $5 in / $25 out per 1M tokens |

### Specialized products

| Model ID | Modality | Upstream model | API pricing |
|----------|----------|----------------|-------------|
| `caedral-vision` | Image generation | google/gemini-3.1-flash-image | $3.33 / 1M tokens |
| `caedral-embed` | Embeddings | openai/text-embedding-3-small | $0.028 / 1M tokens |
| `caedral-voice` | Audio / TTS | openai/gpt-audio | $11.38 / 1M tokens |
| `caedral-rerank` | Reranking | nvidia/llama-nemotron-rerank-vl-1b-v2:free | $0.001 per search |

## Example workflows

### 1. AI Agent with Caedral Olympus

1. Add an **AI Agent** node
2. Connect **Caedral Chat Model** as the Language Model input
3. Select **Olympus** for balanced agentic workloads
4. Attach tools (HTTP Request, Code, etc.) to the agent

### 2. RAG pipeline with embeddings and rerank

1. **Trigger** — new document arrives (webhook, schedule, etc.)
2. **Caedral** → **Create Embedding** — embed document chunks
3. Store vectors in your Vector Store node using **Caedral Embeddings** as the embedding model
4. On query: retrieve candidates, then pass through **Caedral Reranker** for relevance ordering
5. Feed top results to **Caedral Chat Model** or **Chat Completion** for the final answer

### 3. Low balance alert

1. Add **Caedral Trigger** → **Balance Below Threshold**
2. Set threshold to `1000` (= $10.00)
3. Connect to Slack, Email, or Discord notification node

### 4. Image generation webhook

1. **Webhook** trigger receives `{ "prompt": "..." }`
2. **Caedral** → **Generate Image** with the prompt
3. Return the image URL or binary in the webhook response

## Development

```bash
git clone https://github.com/trycaedral/n8n-nodes-caedral.git
cd n8n-nodes-caedral
npm install
npm run build
npm test
```

Run the official community scan (requires Node 22+ for the scanner's dependencies):

```bash
npx @n8n/scan-community-package n8n-nodes-caedral
```

### Project structure

```
├── credentials/           # Caedral API credential type
├── nodes/
│   ├── Caedral/           # Main multi-operation node
│   ├── CaedralChatModel/  # AI Agent / Chain sub-node
│   ├── CaedralEmbeddings/ # Vector Store embeddings sub-node
│   ├── CaedralReranker/   # Vector Store reranker sub-node
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
