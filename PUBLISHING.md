# Publishing n8n-nodes-caedral

Community node package for [Caedral](https://caedral.com) — chat completions and usage from n8n workflows.

## Two paths

| Goal | What to do |
|------|------------|
| **Self-hosted / private use** | Publish to npm (or install via `file:` / `npm link`) — users add the package to `~/.n8n/custom` |
| **n8n verified community node** | Publish to npm **via GitHub Actions with provenance**, then submit through the **n8n Creator Portal** |

---

## Pre-publish checklist

1. **Version bump** in `n8n-nodes-caedral/package.json` (semver).
2. **Build and test**
   ```bash
   cd n8n-nodes-caedral
   npm install
   npm run build
   npm test
   ```
3. **Verify `n8n` field** in `package.json`:
   ```json
   "n8n": {
     "n8nNodesApiVersion": 1,
     "credentials": ["dist/credentials/CaedralApi.credentials.js"],
     "nodes": ["dist/nodes/Caedral/Caedral.node.js"]
   }
   ```
4. **Required npm metadata**
   - `keywords` must include `"n8n-community-node-package"`
   - `license`: MIT
   - `repository.url` matches your public GitHub repo
   - `author` matches GitHub/npm maintainer
5. **Dry-run tarball**
   ```bash
   npm pack --dry-run
   ```
   Only `dist/` should ship (plus `README.md` if added to `"files"`).

---

## Option A — Quick npm publish (self-hosted)

For your own n8n instance or sharing with users who install custom nodes manually:

```bash
cd n8n-nodes-caedral

npm login
npm pack --dry-run
npm publish --access public
```

Users install:

```bash
mkdir -p ~/.n8n/custom && cd ~/.n8n/custom
npm init -y
npm install n8n-nodes-caedral
# Restart n8n
```

---

## Option B — Verified community node (n8n Creator Portal)

As of **May 1, 2026**, n8n requires verified community nodes to be published from **GitHub Actions with npm provenance**. Local `npm publish` is not accepted for verification.

### Step 1 — Publish via GitHub Actions

A starter workflow is included at `.github/workflows/publish-n8n-node.yml` in this repo. It:

- Triggers on version tags like `n8n-v0.1.0`
- Runs `npm run build` and `npm publish --provenance --access public`
- Uses npm **Trusted Publishing** (OIDC) or an `NPM_TOKEN` secret

**Set up npm Trusted Publishing (recommended):**

1. Create the npm package (first publish) or ensure the package exists.
2. On npm → Package → **Settings** → **Publishing access** → add GitHub Actions trusted publisher:
   - Repository: your GitHub repo
   - Workflow: `publish-n8n-node.yml`
   - Environment: (optional)
3. Tag and push:
   ```bash
   git tag n8n-v0.1.0
   git push origin n8n-v0.1.0
   ```

**Alternative — NPM_TOKEN secret:**

Add `NPM_TOKEN` (granular publish token) to GitHub repository secrets. The workflow uses it when OIDC is not configured.

### Step 2 — Submit for verification

1. Read n8n's current guidelines:
   - [Submit community nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/)
   - [Verification guidelines](https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/)
2. Ensure your package meets requirements:
   - MIT license, public GitHub repo matching npm `repository` URL
   - README with install steps, credentials, and usage examples
   - Single third-party service (Caedral only)
   - No runtime `dependencies` in `package.json` (peer/dev only)
   - Published with provenance from GitHub Actions
3. Sign up / log in to the **[n8n Creator Portal](https://creators.n8n.io/)** (URL may change — check n8n docs).
4. Submit your npm package name: `n8n-nodes-caedral`
5. n8n vets the node; once approved, it appears in the verified community nodes panel for n8n Cloud and self-hosted instances with verified nodes enabled.

### Verification timeline

Verification is manual review by n8n. Plan for days to weeks. You can still distribute via npm install before verification completes.

---

## After publishing

1. Confirm https://www.npmjs.com/package/n8n-nodes-caedral
2. Test in n8n:
   - Credentials → Caedral API → Test (calls `GET /v1/usage`)
   - Caedral node → Chat Completion
3. Update site docs at `/docs/n8n-install` if install steps change

## Unpublishing

Avoid unpublishing after users depend on the package. Ship patch versions instead.
