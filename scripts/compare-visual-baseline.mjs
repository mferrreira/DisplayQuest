/**
 * Pixel-diff two visual baseline dirs (R2 gate).
 * Usage: node scripts/compare-visual-baseline.mjs <dirA> <dirB> [maxDiffRatio]
 * Prints per-image diff ratio and a final verdict. Exit 1 if any image exceeds threshold.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const dirA = path.resolve("tests/e2e/__screenshots__", process.argv[2] ?? "baseline-v3");
const dirB = path.resolve("tests/e2e/__screenshots__", process.argv[3] ?? "after-v4");
const thresholdRatio = Number(process.argv[4] ?? 0.01); // >1% pixels changed = fail by default

const files = readdirSync(dirA).filter((f) => f.endsWith(".png"));
let failed = 0;

for (const file of files.sort()) {
  const a = PNG.sync.read(readFileSync(path.join(dirA, file)));
  let b;
  try {
    b = PNG.sync.read(readFileSync(path.join(dirB, file)));
  } catch {
    console.error(`MISSING in ${path.basename(dirB)}: ${file}`);
    failed++;
    continue;
  }
  if (a.width !== b.width || a.height !== b.height) {
    console.error(`SIZE MISMATCH: ${file} (${a.width}x${a.height} vs ${b.width}x${b.height})`);
    failed++;
    continue;
  }
  const diffPixels = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
  const ratio = diffPixels / (a.width * a.height);
  if (ratio > thresholdRatio) {
    console.error(`DIFF ${(ratio * 100).toFixed(2)}% (> ${(thresholdRatio * 100).toFixed(1)}%): ${file}`);
    failed++;
  } else {
    console.log(`ok   ${(ratio * 100).toFixed(3)}%  ${file}`);
  }
}

console.log(failed === 0 ? `\n✅ all ${files.length} images within tolerance` : `\n❌ ${failed}/${files.length} images exceed tolerance`);
process.exit(failed === 0 ? 0 : 1);
