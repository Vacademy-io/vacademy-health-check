#!/usr/bin/env node
/**
 * Build-time guard against the recurring postcss.config.js payload injection.
 *
 * The worm appends an obfuscated IIFE after the config, hidden behind hundreds
 * of spaces so editors and GitHub diffs render the line blank. This repo's
 * origin carried it once already (2026-08); the canonical file is 80 bytes.
 * Detect by LINE LENGTH and by IOC markers — never by eyeballing the file.
 *
 * Wired as `prebuild`, so `npm run build` (local and Cloudflare Pages) refuses
 * to execute a compromised config. Fail-closed on detection, fail-open on
 * unexpected errors so a broken guard can't block a clean build.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "postcss.config.js");

const MAX_LINE = 200;
const MAX_BYTES = 500;
const IOCS = [
  "createRequire",
  "_0x",
  "global['!']",
  "global.i=",
  "_t_s",
  "ETH_RPC_URL",
  "0x/clb",
  "0x/ls",
  "166.88.134.62",
  "String.fromCharCode",
  "child_process",
];

try {
  if (!existsSync(target)) process.exit(0);

  const raw = readFileSync(target, "utf8");
  const problems = [];

  if (Buffer.byteLength(raw) > MAX_BYTES) {
    problems.push(`file is ${Buffer.byteLength(raw)} bytes (expected <= ${MAX_BYTES})`);
  }
  raw.split(/\r?\n/).forEach((line, i) => {
    if (line.length > MAX_LINE) {
      problems.push(`line ${i + 1} is ${line.length} chars (expected <= ${MAX_LINE})`);
    }
  });
  for (const ioc of IOCS) {
    if (raw.includes(ioc)) problems.push(`contains known payload marker: ${ioc}`);
  }

  if (problems.length) {
    console.error("\n[31m╔══════════════════════════════════════════════════════════╗");
    console.error("║  BUILD BLOCKED — postcss.config.js looks compromised     ║");
    console.error("╚══════════════════════════════════════════════════════════╝[0m");
    for (const p of problems) console.error(`  • ${p}`);
    console.error("\nThis config executes during `vite build`. Do NOT build or deploy.");
    console.error("Restore the 80-byte canonical config and investigate before continuing.\n");
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.warn("guard-postcss: unexpected error, not blocking build:", err?.message || err);
  process.exit(0);
}
