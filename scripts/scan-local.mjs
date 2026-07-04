#!/usr/bin/env node
/**
 * Lint the published artifact the same way @n8n/scan-community-package does,
 * without downloading from npm (useful before publish).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzePackage } from "@n8n/scan-community-package/scanner/scanner.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "n8n-nodes-caedral-scan-"));
const packResult = spawnSync("npm", ["pack"], {
  cwd: packageRoot,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (packResult.status !== 0) {
  console.error("npm pack failed:", packResult.stderr || packResult.stdout);
  process.exit(1);
}

const tarball = packResult.stdout
  .trim()
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.endsWith(".tgz"))
  .pop();
if (!tarball) {
  console.error("Could not determine tarball name from npm pack output");
  process.exit(1);
}

const tarballPath = path.join(packageRoot, tarball);
const extractDir = path.join(tempDir, "package");
fs.mkdirSync(extractDir, { recursive: true });

const tarResult = spawnSync(
  "tar",
  ["-xzf", tarballPath, "-C", extractDir, "--strip-components=1"],
  { stdio: "pipe", shell: process.platform === "win32" },
);

if (tarResult.status !== 0) {
  console.error("tar extraction failed:", tarResult.stderr?.toString());
  process.exit(1);
}

const result = await analyzePackage(extractDir);

try {
  fs.unlinkSync(tarballPath);
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {
  // best-effort cleanup
}

if (result.passed) {
  console.log("✅ Local community scan passed");
  process.exit(0);
}

console.log("❌ Local community scan failed");
console.log(`Reason: ${result.message}`);
if (result.details) {
  console.log("\nDetails:");
  console.log(result.details);
}
process.exit(1);
