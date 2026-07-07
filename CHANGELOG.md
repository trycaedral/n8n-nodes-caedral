# Changelog

## 0.3.8 — 2026-07-07

Codex metadata fixes for n8n Creator Portal review compliance. No functional changes to node behavior.

- **Removed unsupported `subcategories` field** from all codex files (`Caedral.node.json`, `CaedralChatModel.node.json`, `CaedralEmbeddings.node.json`, `CaedralReranker.node.json`) and from the inline `codex` blocks in `CaedralChatModel.node.ts`, `CaedralEmbeddings.node.ts`, and `CaedralReranker.node.ts`.
- **Fixed codex `node` field format** to fully-qualified `<package>.<nodeName>` values: `n8n-nodes-caedral.caedral`, `n8n-nodes-caedral.caedralChatModel`, and `n8n-nodes-caedral.caedralTrigger`.
- **Fixed codex `nodeVersion`** in `Caedral.node.json` (`2.0` → `1.0`; fixed schema field).
- **Replaced unsupported `AI` category** with `Development` across all five `.node.json` files and all inline `codex` blocks.
- **Wired `SPECIALIZED_PRICING` shared constant** into the pricing descriptions in `Caedral.node.ts`, replacing duplicated hardcoded strings. This also corrects two stale displayed prices: embeddings (`$0.028/1M` → `$0.001 / 1M tokens`) and rerank (`$0.001/search` → `$0.0005 per search`), matching the billing source of truth.
- Merged duplicate import statements from `shared/constants` in `nodes/Caedral/helpers.ts`.

Reference: https://docs.n8n.io/integrations/creating-nodes/build/reference/node-codex-files/
