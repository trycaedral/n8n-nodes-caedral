const { cpSync, existsSync, mkdirSync, readdirSync, statSync } = require("node:fs");
const { dirname, join } = require("node:path");

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (/\.(svg|png|json)$/i.test(entry)) {
      mkdirSync(dirname(destPath), { recursive: true });
      cpSync(srcPath, destPath);
    }
  }
}

copyDir(join(ROOT, "icons"), join(DIST, "icons"));
copyDir(join(ROOT, "nodes"), join(DIST, "nodes"));

console.log("Copied static assets to dist/");
