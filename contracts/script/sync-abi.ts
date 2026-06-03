const fs = require("fs");
const path = require("path");

const contracts = ["StackBallGame", "Counter"];

const outDir       = path.join(__dirname, "../out");
const deployFile   = path.join(__dirname, "../abi/deployment.json");
const abiDir       = path.join(__dirname, "../../lib/abi-contract");

if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

// ── 1. Sync ABI (sama seperti sebelumnya) ───────────────────────────────────
contracts.forEach((name) => {
  const src = path.join(outDir, `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(src)) { console.warn(`⚠️  Skipped ${name}`); return; }

  const abi = JSON.parse(fs.readFileSync(src, "utf8")).abi;

  fs.writeFileSync(path.join(abiDir, `${name}.json`), JSON.stringify(abi, null, 2));
  fs.writeFileSync(
    path.join(abiDir, `${name}.ts`),
    `// Auto-generated — do not edit manually\nexport const ${name}ABI = ${JSON.stringify(abi, null, 2)} as const;\n`
  );
  console.log(`✅ ABI: ${name}.json + ${name}.ts`);
});

// ── 2. Sync Address → constants.ts ─────────────────────────────────────────
if (!fs.existsSync(deployFile)) {
  console.warn("⚠️  abi/deployment.json not found, skipping address sync");
  process.exit(0);
}

const deployment = JSON.parse(fs.readFileSync(deployFile, "utf8"));
const chainId    = deployment.chainId ?? "unknown";

// Deteksi apakah pakai proxy atau tidak
const isProxy    = !!deployment.proxy;

const proxyAddr  = deployment.proxy          ?? null;
const implAddr   = deployment.implementation ?? null;
const plainAddr  = deployment.address        ?? null;

// Address yang dipakai FE — selalu proxy kalau ada, fallback ke plain
const activeAddress = proxyAddr ?? plainAddr;

const constantsContent = `// Auto-generated — do not edit manually
// Chain ID: ${chainId} | Deployed: ${new Date(deployment.deployedAt * 1000).toISOString()}

export const CONTRACT_ADDRESS = "${activeAddress}" as \`0x\${string}\`;

${isProxy ? `
// Proxy pattern — FE selalu pakai CONTRACT_ADDRESS (proxy)
// Implementation hanya perlu saat upgrade
export const PROXY_ADDRESS          = "${proxyAddr}" as \`0x\${string}\`;
export const IMPLEMENTATION_ADDRESS = "${implAddr}" as \`0x\${string}\`;
` : `
// Regular deploy (no proxy)
`}

export const CHAIN_ID     = ${chainId};
export const DEPLOYED_AT  = ${deployment.deployedAt};
`;

fs.writeFileSync(path.join(abiDir, "constants.ts"), constantsContent);
console.log(`✅ Address: constants.ts (${isProxy ? "proxy mode" : "regular mode"})`);
console.log(`   Active address: ${activeAddress}`);