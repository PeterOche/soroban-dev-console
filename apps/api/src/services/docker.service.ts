import { createHash } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import { nanoid } from "nanoid";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_IMAGE = process.env.SOROBAN_BUILD_IMAGE ?? "stellar/stellar-cli:latest";

type DockerBuildResult = {
  wasmPath: string;
  wasmHash: string;
};

async function collectWasmFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectWasmFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".wasm")) {
      results.push(fullPath);
    }
  }

  return results;
}

function isPreferredBuildTarget(filePath: string) {
  return (
    filePath.includes(`${path.sep}target${path.sep}wasm32v1-none${path.sep}release${path.sep}`) ||
    filePath.includes(
      `${path.sep}target${path.sep}wasm32-unknown-unknown${path.sep}release${path.sep}`
    )
  );
}

async function selectWasmArtifact(wasmFiles: string[]): Promise<string> {
  const preferred = wasmFiles.filter(isPreferredBuildTarget);
  const candidates = preferred.length > 0 ? preferred : wasmFiles;

  let selected = candidates[0];
  let selectedSize = (await stat(selected)).size;

  for (const candidate of candidates.slice(1)) {
    const candidateSize = (await stat(candidate)).size;
    if (candidateSize > selectedSize) {
      selected = candidate;
      selectedSize = candidateSize;
    }
  }

  return selected;
}

function buildDockerScript(repoUrl: string) {
  return [
    "set -eu",
    "git clone --depth 1 --recurse-submodules \"$REPO_URL\" repo",
    "cd repo",
    "stellar contract build"
  ].join(" && ");
}

async function forceRemoveContainer(containerName: string) {
  try {
    await execFileAsync("docker", ["rm", "-f", containerName], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024
    });
  } catch {
    // Ignore cleanup errors; container may already be gone.
  }
}

export async function buildRepoInDocker(repoUrl: string): Promise<DockerBuildResult> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "soroban-verify-"));
  const containerName = `soroban-verify-${nanoid(10).toLowerCase()}`;

  try {
    const script = buildDockerScript(repoUrl);

    await execFileAsync(
      "docker",
      [
        "run",
        "--rm",
        "--name",
        containerName,
        "--security-opt",
        "no-new-privileges",
        "--cap-drop",
        "ALL",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "-e",
        `REPO_URL=${repoUrl}`,
        "-v",
        `${tempDir}:/workspace`,
        "-w",
        "/workspace",
        DEFAULT_IMAGE,
        "sh",
        "-lc",
        script
      ],
      {
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024
      }
    );

    const repoPath = path.join(tempDir, "repo");
    const wasmFiles = await collectWasmFiles(repoPath);
    if (wasmFiles.length === 0) {
      throw new Error("Build completed but no .wasm artifact was found.");
    }

    const wasmPath = await selectWasmArtifact(wasmFiles);
    const wasmBytes = await readFile(wasmPath);
    const wasmHash = createHash("sha256").update(wasmBytes).digest("hex");

    return { wasmPath, wasmHash };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("Docker is not installed or not available in PATH.");
    }

    throw error;
  } finally {
    await forceRemoveContainer(containerName);
    await rm(tempDir, { recursive: true, force: true });
  }
}
