const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "node_modules");

function patchPkg(pkgDir) {
  const f = path.join(pkgDir, "package.json");
  if (!fs.existsSync(f)) return false;
  const pkg = JSON.parse(fs.readFileSync(f, "utf8"));
  let changed = false;

  // Strip "exports" from @coral-xyz/anchor (CJS only, no ESM re-export of BN)
  if (pkgDir.includes("@coral-xyz/anchor")) {
    if (pkg.exports) {
      delete pkg.exports;
      changed = true;
    }
  }

  // For meteora packages: remove "import" from exports["."] so Node uses CJS
  if (pkgDir.includes("@meteora-ag/")) {
    if (pkg.exports?.["."]?.import) {
      delete pkg.exports["."].import;
      changed = true;
    }
    // If no main field, set it to the likely CJS entry point
    if (!pkg.main && !pkg.exports) {
      pkg.main = "dist/index.js";
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(f, JSON.stringify(pkg, null, 2));
    console.log("[patch]", path.relative(ROOT, pkgDir));
  }
  return changed;
}

// Walk all node_modules
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === ".package-lock.json" || entry === ".bin" || entry === ".cache") continue;
    if (entry.startsWith("@")) {
      // scoped package
      for (const sub of fs.readdirSync(full)) {
        const pkgDir = path.join(full, sub);
        if (fs.existsSync(path.join(pkgDir, "package.json"))) {
          patchPkg(pkgDir);
        }
        // nested node_modules
        walk(path.join(pkgDir, "node_modules"));
      }
    } else if (fs.existsSync(path.join(full, "package.json"))) {
      patchPkg(full);
    }
  }
}

walk(ROOT);
console.log("[patch] done");
