# Changelog

## 2.0.0 — 2026-08-29

Official n8n integration for the current Caedral production API.

### Breaking

- Removed the standalone **Caedral Reranker** AI sub-node. n8n community-node verification allows one regular node, one trigger, and two AI sub-nodes (chat model and embeddings). Rerank remains available as **Caedral → AI → Rerank**.
- Audio voices now follow current Caedral Voice (Alloy, Ash, Ballad, Coral, Echo, Sage, Shimmer, Verse). TTS-1-only Fable / Nova / Onyx presets were removed from the dropdown; stored custom values can still be sent via Custom or an expression.

### Added

- Resource selector on the main node: Account, AI, Audio, Image, Model
- `GET /v1/models/:id` as **Get Model**
- Dynamic model lists from `GET /v1/models` (with static fallback)
- Chat options: top_p, stop, penalties, tools JSON, response_format, user
- Embedding `input_type` and `encoding_format` on the main node
- Chat Model timeout and retry options
- Prepaid `balanceMilliCents` on usage output
- n8n-native `NodeOperationError` / `NodeApiError` handling for validation and HTTP 4xx/5xx
- Legacy workflows without `resource` infer it from the existing operation id

### Fixed

- n8n review: operations grouped by resource; option lists alphabetized; no raw `Error` from execute/helpers; credentials and subtitles; `(Cents)` / `(Legacy Alias)` copy
- Usage payload aligned with the current gateway (no subscription plan/pool fields)

## 1.2.0 — 2026-08-04

OpenRouter provider readiness for the Caedral Embeddings Vector Store sub-node.

- Add legacy prepaid model alias `caedral-embed` alongside `caedral-embed-e1-small-v1`
- Send `input_type` (`query` for `embedQuery`, `document` for `embedDocuments`) for retrieval-aware prefixing
- Add `encoding_format` option (`float` | `base64`); base64 responses are decoded for Vector Store compatibility

## 1.1.0 — 2026-08-04

Migrate Caedral Embeddings Vector Store sub-node to Caedral E1 Small (`caedral-embed-e1-small-v1`) with native 384-dimensional vectors.

## 1.0.0 — 2026-07-29

First stable release of the official Caedral n8n community node.

- Chat, embeddings, rerank, vision/audio operations, LangChain chat model nodes, and trigger
- Pricing copy aligned with prepaid agency rates (Titan/Olympus/Primordial + specialized)
- Codex metadata compliant with n8n Creator Portal guidelines

## 0.3.8 — 2026-07-07

Codex metadata fixes for n8n Creator Portal review compliance. No functional changes to node behavior.

- **Removed unsupported `subcategories` field** from all codex files (`Caedral.node.json`, `CaedralChatModel.node.json`, `CaedralEmbeddings.node.json`, `CaedralReranker.node.json`) and from the inline `codex` blocks in `CaedralChatModel.node.ts`, `CaedralEmbeddings.node.ts`, and `CaedralReranker.node.ts`.
- **Fixed codex `node` field format** to fully-qualified `<package>.<nodeName>` values: `n8n-nodes-caedral.caedral`, `n8n-nodes-caedral.caedralChatModel`, and `n8n-nodes-caedral.caedralTrigger`.
- **Fixed codex `nodeVersion`** in `Caedral.node.json` (`2.0` → `1.0`; fixed schema field).
- **Replaced unsupported `AI` category** with `Development` across all five `.node.json` files and all inline `codex` blocks.
- **Wired `SPECIALIZED_PRICING` shared constant** into the pricing descriptions in `Caedral.node.ts`, replacing duplicated hardcoded strings. This also corrects two stale displayed prices: embeddings (`$0.028/1M` → `$0.001 / 1M tokens`) and rerank (`$0.001/search` → `$0.0005 per search`), matching the billing source of truth.
- Merged duplicate import statements from `shared/constants` in `nodes/Caedral/helpers.ts`.

Reference: https://docs.n8n.io/integrations/creating-nodes/build/reference/node-codex-files/
