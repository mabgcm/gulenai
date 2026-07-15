import { execFileSync } from "node:child_process";
import { accessSync, readFileSync } from "node:fs";
import { delimiter, dirname } from "node:path";
import { loadConfig } from "../config/env.js";

interface RuntimeResult {
  readonly label: string;
  readonly version: string;
  readonly executable: string;
  readonly error?: string;
}

const probeEnvironment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`
};

const probe = (label: string, command: string, args: readonly string[]): RuntimeResult => {
  try {
    const output = execFileSync(command, [...args], {
      encoding: "utf8",
      env: probeEnvironment
    }).trim();
    const parsed = JSON.parse(output) as { version?: unknown; executable?: unknown };
    if (typeof parsed.version !== "string" || typeof parsed.executable !== "string") {
      throw new Error(`unexpected output: ${output}`);
    }
    return { label, version: parsed.version, executable: parsed.executable };
  } catch (error) {
    return {
      label,
      version: "unavailable",
      executable: "unavailable",
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const nodeProbe = ["-p", "JSON.stringify({version:process.version,executable:process.execPath})"];
const runtimes: readonly RuntimeResult[] = [
  { label: "node", version: process.version, executable: process.execPath },
  probe("pnpm", "pnpm", ["exec", "node", ...nodeProbe]),
  probe("npm", "npm", ["run", "--silent", "runtime:probe"]),
  probe("npx", "npx", [
    "--no-install",
    "-c",
    "./scripts/node-runtime.sh -p 'JSON.stringify({version:process.version,executable:process.execPath})'"
  ]),
  probe("tsx", "tsx", [
    "-e",
    "console.log(JSON.stringify({version:process.version,executable:process.execPath}))"
  ])
];

const redactUrl = (value: string): string => {
  const url = new URL(value);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    return `${url.protocol}//${url.host}`;
  }
  return `${url.protocol}//***`;
};

const config = loadConfig();
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  engines?: { node?: string };
  packageManager?: string;
  scripts?: Record<string, string>;
  volta?: { node?: string; pnpm?: string };
};
const fileValue = (path: string): string => {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "missing";
  }
};
const fileExists = (path: string): boolean => {
  try {
    accessSync(path);
    return true;
  } catch {
    return false;
  }
};
const detectedRuntime = process.execPath.includes("/.nvm/")
  ? "nvm"
  : process.env.VOLTA_HOME !== undefined && process.execPath.startsWith(process.env.VOLTA_HOME)
    ? "Volta"
    : process.env.MISE_SHELL !== undefined
      ? "mise"
      : "system/PATH";
const expectedExecutable = process.execPath;
const runtimeChecks = runtimes.map((runtime) => ({
  ...runtime,
  pass:
    runtime.error === undefined &&
    runtime.version === "v22.23.1" &&
    runtime.executable === expectedExecutable
}));
const checks = [
  {
    label: "Node version is 22.23.1",
    pass: process.versions.node === "22.23.1"
  },
  ...runtimeChecks.map((runtime) => ({
    label: `${runtime.label} resolves ${runtime.executable} (${runtime.version})`,
    pass: runtime.pass
  })),
  {
    label: "Qdrant collections are isolated",
    pass: config.QDRANT_COLLECTION !== config.RISALE_QDRANT_COLLECTION
  },
  {
    label: "OPENAI_API_KEY is configured",
    pass: (config.OPENAI_API_KEY?.trim().length ?? 0) > 0
  },
  {
    label: "Runtime configuration agrees on Node 22.23.1",
    pass:
      fileValue(".nvmrc") === "22.23.1" &&
      fileValue(".node-version") === "22.23.1" &&
      packageJson.engines?.node === "22.23.1" &&
      packageJson.volta?.node === "22.23.1" &&
      packageJson.packageManager === "pnpm@9.15.4" &&
      packageJson.volta?.pnpm === "9.15.4"
  },
  {
    label: "Risale CLI is wired",
    pass:
      packageJson.scripts?.risale?.includes("src/risale/index.ts") === true &&
      fileExists("src/risale/index.ts") &&
      fileExists("scripts/node-runtime.sh")
  }
];
const pass = checks.every((check) => check.pass);
let pnpmVersion = "unavailable";
try {
  pnpmVersion = execFileSync("pnpm", ["--version"], {
    encoding: "utf8",
    env: probeEnvironment
  }).trim();
} catch {
  // The failed runtime check below provides the actionable result.
}

console.log("HürKul runtime doctor");
console.log(`Node version: ${process.version}`);
console.log(`pnpm version: ${pnpmVersion}`);
console.log(`Resolved Node executable: ${process.execPath}`);
console.log(`Detected runtime: ${detectedRuntime}`);
console.log(`OpenAI model: ${config.OPENAI_CHAT_MODEL}`);
console.log(`Embedding model: ${config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL}`);
console.log(`Qdrant URL: ${redactUrl(config.QDRANT_URL)}`);
console.log(`FGülen collection: ${config.QDRANT_COLLECTION}`);
console.log(`Risale collection: ${config.RISALE_QDRANT_COLLECTION}`);
console.log("Environment validation:");
console.log(`  ${config.OPENAI_API_KEY?.trim() ? "PASS" : "FAIL"} OPENAI_API_KEY configured`);
console.log(`  PASS QDRANT_URL valid and redacted`);
console.log(
  `  ${config.QDRANT_COLLECTION !== config.RISALE_QDRANT_COLLECTION ? "PASS" : "FAIL"} collection names isolated`
);
console.log("CLI validation:");
console.log(
  `  ${packageJson.scripts?.risale?.includes("src/risale/index.ts") === true ? "PASS" : "FAIL"} pnpm risale ingest entrypoint`
);
console.log(`  ${fileExists("src/risale/index.ts") ? "PASS" : "FAIL"} Risale CLI source exists`);
console.log("Runtime configuration:");
console.log(`  .nvmrc: ${fileValue(".nvmrc")}`);
console.log(`  .node-version: ${fileValue(".node-version")}`);
console.log(`  package.json engines.node: ${packageJson.engines?.node ?? "missing"}`);
console.log(`  package.json packageManager: ${packageJson.packageManager ?? "missing"}`);
console.log(`  Volta Node: ${packageJson.volta?.node ?? "missing"}`);
console.log("Runtime consistency checks:");
for (const check of checks) console.log(`  ${check.pass ? "PASS" : "FAIL"} ${check.label}`);
console.log(`Overall: ${pass ? "PASS" : "FAIL"}`);

if (!pass) process.exitCode = 1;
