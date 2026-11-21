import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = "19.0.1";
const DESTINATION = join(process.cwd(), "public", "stockfish");
const ASSETS = [
  {
    name: "stockfish-19-lite-single.js",
    sha256: "ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a",
  },
  {
    name: "stockfish-19-lite-single.wasm",
    sha256: "ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de",
  },
] as const;

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

async function isVerified(path: string, expected: string) {
  try {
    return sha256(await readFile(path)) === expected;
  } catch {
    return false;
  }
}

await mkdir(DESTINATION, { recursive: true });

for (const asset of ASSETS) {
  const destination = join(DESTINATION, asset.name);
  if (await isVerified(destination, asset.sha256)) {
    console.log(`[Stockfish ${VERSION}] ${asset.name} already verified.`);
    continue;
  }

  const url = `https://github.com/nmrugg/stockfish.js/releases/download/v${VERSION}/${asset.name}`;
  console.log(`[Stockfish ${VERSION}] Downloading ${asset.name}...`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Could not download ${asset.name}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== asset.sha256) {
    throw new Error(`Checksum mismatch for ${asset.name}: expected ${asset.sha256}, received ${actual}`);
  }

  const temporary = destination + ".download";
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  console.log(`[Stockfish ${VERSION}] Verified ${asset.name} (${bytes.byteLength.toLocaleString("en-US")} bytes).`);
}
