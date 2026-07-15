import { execFileSync } from "node:child_process";
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
const expectedExecutable = process.execPath;
const runtimeChecks = runtimes.map((runtime) => ({
  ...runtime,
  pass:
    runtime.error === undefined &&
    runtime.version.startsWith("v22.") &&
    runtime.executable === expectedExecutable
}));
const checks = [
  {
    label: "Node version is 22.x",
    pass: process.versions.node.split(".")[0] === "22"
  },
  ...runtimeChecks.map((runtime) => ({
    label: `${runtime.label} resolves ${runtime.executable} (${runtime.version})`,
    pass: runtime.pass
  })),
  {
    label: "Qdrant collections are isolated",
    pass: config.QDRANT_COLLECTION !== config.RISALE_QDRANT_COLLECTION
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
console.log(`OpenAI model: ${config.OPENAI_CHAT_MODEL}`);
console.log(`Embedding model: ${config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL}`);
console.log(`Qdrant URL: ${redactUrl(config.QDRANT_URL)}`);
console.log(`FGülen collection: ${config.QDRANT_COLLECTION}`);
console.log(`Risale collection: ${config.RISALE_QDRANT_COLLECTION}`);
console.log("Runtime consistency checks:");
for (const check of checks) console.log(`  ${check.pass ? "PASS" : "FAIL"} ${check.label}`);
console.log(`Overall: ${pass ? "PASS" : "FAIL"}`);

if (!pass) process.exitCode = 1;
