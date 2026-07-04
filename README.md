# n8n-nodes-caedral

Community node for [n8n](https://n8n.io/) that integrates with [Caedral AI](https://caedral.com) — unified access to frontier and proprietary AI models through one API.

## Installation

In your n8n instance:

1. Go to **Settings → Community Nodes**
2. Enter `n8n-nodes-caedral`
3. Click **Install**

Or via CLI:

```bash
cd ~/.n8n
npm install n8n-nodes-caedral
```

## Nodes

### Caedral (Main Node)

Full-featured node with 8 operations covering all Caedral API capabilities:

| Operation | Description |
|-----------|-------------|
| **Chat Completion** | Send messages to any Caedral model tier (Base, Titan, Olympus, Primordial) with system prompts, temperature, and max tokens |
| **Generate Image** | Create images from text prompts using Caedral Vision (1024×1024, 1792×1024, 1024×1792) |
| **Create Embedding** | Generate vector embeddings for text or arrays of texts using Caedral Embed |
| **Generate Audio** | Convert text to speech with voice selection (alloy, echo, fable, onyx, nova, shimmer) |
| **Rerank** | Semantically rerank documents by relevance to a query using Caedral Rerank |
| **List Models** | Retrieve all available models (chat + specialized) |
| **Get Usage** | Check pool balance, weekly usage, and overage status |
| **Get Account Info** | View account status, plan details, and billing information |

### Caedral Chat Model (AI Sub-Node)

An AI Language Model node that plugs directly into n8n's native **AI Agent** and **Chain** nodes. Connect it as the language model input to instantly power your AI workflows with Caedral.

- Select model tier (Base/Titan/Olympus/Primordial)
- Configure temperature and max tokens
- Compatible with all n8n AI Agent patterns

### Caedral Trigger (Polling)

Automatically trigger workflows based on account conditions:

- **Balance Below Threshold** — fires when your balance in cents drops below a configured amount
- **Pool Usage Above Percentage** — fires when weekly pool usage exceeds a percentage threshold

Polling interval configurable in n8n's trigger settings.

## Credentials

Create a **Caedral API** credential with:

| Field | Description |
|-------|-------------|
| **API Key** | Your `cd_live_...` key from the [Caedral dashboard](https://caedral.com/dashboard/api-keys) |
| **Base URL** | Default: `https://api.caedral.com`. Use `http://localhost:5001` for local development |

The credential is validated by calling `GET /v1/usage` on save.

## Models

### Chat Models (for Chat Completion & AI Agent)

| Model ID | Tier | Use Case |
|----------|------|----------|
| `caedral-base` | Free | Prototyping, everyday tasks |
| `caedral-titan` | Efficient | High-volume production |
| `caedral-olympus` | Balanced | Complex agentic applications |
| `caedral-primordial` | Frontier | Research, mission-critical |

### Specialized Models

| Model ID | Modality | Pricing |
|----------|----------|---------|
| `caedral-vision` | Image generation | ~$3.50/M tokens |
| `caedral-embed` | Text embeddings | ~$0.18/M tokens |
| `caedral-voice` | Audio/speech | ~$0.84/M tokens |
| `caedral-rerank` | Semantic reranking | ~$0.35/request |

## Example Workflows

### AI Agent with Caedral

1. Add an **AI Agent** node
2. Connect a **Caedral Chat Model** node as the Language Model input
3. Select your preferred model tier (e.g., Olympus for balanced performance)
4. Add tools (HTTP Request, Code, etc.) to the agent

### Low Balance Alert

1. Add a **Caedral Trigger** node
2. Set condition to "Balance Below Threshold"
3. Set threshold to 1000 (= $10.00)
4. Connect to a Slack/Email notification node

### Document Embedding Pipeline

1. Trigger: new documents arrive
2. **Caedral** node → Create Embedding operation
3. Store embeddings in your vector database

## Development

```bash
git clone https://github.com/caedral/n8n-nodes-caedral.git
cd n8n-nodes-caedral
npm install
npm run build
npm test
```

### Project Structure

```
├── credentials/          # API credential type
├── nodes/
│   ├── Caedral/          # Main multi-operation node
│   ├── CaedralChatModel/ # AI Agent sub-node
│   └── CaedralTrigger/   # Polling trigger node
├── shared/               # Constants and utilities
├── tests/                # Integration tests
└── icons/                # Node icons (light + dark)
```

## Links

- [Caedral Documentation](https://caedral.com/docs)
- [API Reference](https://caedral.com/docs/api-reference)
- [n8n Integration Guide](https://caedral.com/docs/n8n-overview)
- [Report Issues](https://github.com/caedral/n8n-nodes-caedral/issues)

## License

MIT
