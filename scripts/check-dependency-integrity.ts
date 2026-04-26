import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

/**
 * DEVOPS-024: Dependency and Workspace Integrity Check.
 * Ensures that:
 * 1. package-lock.json is consistent with package.json (no drift).
 * 2. Workspace dependencies use consistent versions.
 * 3. Local workspace links are correctly resolved.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function getWorkspaces() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  const workspacePaths: string[] = [];
  
  for (const pattern of rootPkg.workspaces) {
    const base = pattern.replace(/\/\*$/, "");
    const fullBase = path.join(ROOT, base);
    if (fs.existsSync(fullBase)) {
      const dirs = fs.readdirSync(fullBase).filter(d => fs.statSync(path.join(fullBase, d)).isDirectory());
      workspacePaths.push(...dirs.map(d => path.join(base, d)));
    }
  }
  return workspacePaths;
}

const workspacePaths = getWorkspaces();
const pkgMap = new Map<string, any>();
const pathMap = new Map<string, string>();

for (const wp of workspacePaths) {
  const pkgPath = path.join(ROOT, wp, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    pkgMap.set(pkg.name, pkg);
    pathMap.set(pkg.name, wp);
  }
}

let errors = 0;

console.log(`🔍 Validating ${pkgMap.size} workspace packages...\n`);

// ── 1. Workspace Dependency Consistency ──────────────────────────────────────

for (const [name, pkg] of pkgMap) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [depName, depVersion] of Object.entries(deps)) {
    if (pkgMap.has(depName)) {
      const actualVersion = pkgMap.get(depName).version;
      
      // We recommend using "*" for workspace links to avoid sync issues,
      // but if a version is used, it MUST match the actual version.
      if (depVersion !== "*" && depVersion !== actualVersion && depVersion !== `^${actualVersion}`) {
        console.error(`❌ Mismatched workspace dependency in "${name}":`);
        console.error(`   Depends on "${depName}@${depVersion}"`);
        console.error(`   Actual version is "${actualVersion}"`);
        console.error(`   Suggested fix: Change to "*" or "${actualVersion}"\n`);
        errors++;
      }
    }
  }
}

// ── 2. External Dependency Version Drift (Critical ones) ─────────────────────

const CRITICAL_DEPS = ["react", "react-dom", "next", "@stellar/stellar-sdk", "tailwindcss"];
const externalDeps = new Map<string, Map<string, string[]>>();

for (const [name, pkg] of pkgMap) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [depName, depVersion] of Object.entries(deps)) {
    if (CRITICAL_DEPS.includes(depName)) {
      if (!externalDeps.has(depName)) externalDeps.set(depName, new Map());
      const versionStr = depVersion as string;
      if (!externalDeps.get(depName)!.has(versionStr)) {
        externalDeps.get(depName)!.set(versionStr, []);
      }
      externalDeps.get(depName)!.get(versionStr)!.push(name);
    }
  }
}

for (const [depName, versionMap] of externalDeps) {
  if (versionMap.size > 1) {
    console.error(`❌ Version drift detected for critical dependency "${depName}":`);
    for (const [version, packages] of versionMap) {
      console.error(`   ${version} used by: ${packages.join(", ")}`);
    }
    console.error(`   Suggested fix: Align versions across all packages.\n`);
    errors++;
  }
}

// ── 3. Lockfile Drift ────────────────────────────────────────────────────────

try {
  console.log("⏳ Verifying lockfile integrity (this may take a moment)...");
  const lockfilePath = path.join(ROOT, "package-lock.json");
  
  if (!fs.existsSync(lockfilePath)) {
    console.error("❌ package-lock.json is missing!");
    errors++;
  } else {
    const before = fs.readFileSync(lockfilePath, "utf-8");
    
    // We use --package-lock-only to avoid actually installing everything
    execSync("npm install --package-lock-only", { cwd: ROOT, stdio: "ignore" });
    
    const after = fs.readFileSync(lockfilePath, "utf-8");
    if (before !== after) {
      console.error("❌ Lockfile drift detected!");
      console.error("   The package-lock.json is out of sync with package.json.");
      console.error("   Action: Run 'npm install' locally and commit the updated package-lock.json.\n");
      
      // Restore the original file for local runs
      fs.writeFileSync(lockfilePath, before);
      errors++;
    } else {
      console.log("✅ Lockfile is up to date.\n");
    }
  }
} catch (err) {
  console.error("❌ Failed to verify lockfile integrity. Is npm installed?\n");
  errors++;
}

// ── Summary ──────────────────────────────────────────────────────────────────

if (errors > 0) {
  console.error(`\n💥 Total integrity issues found: ${errors}`);
  console.error("Please fix the issues above before pushing.");
  process.exit(1);
}

console.log("✨ Dependency and workspace integrity check passed.");
