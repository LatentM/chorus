// Exhaustive Shamir test against the REAL crypto.js module.
// For every (t, n) with 2 <= t <= n <= 9:
//   - every t-subset of shares reconstructs the secret
//   - every (t-1)-subset does not
//   - all n shares together reconstruct
// Run: npm run test:shamir
import { shamirSplit, shamirCombine } from "../crypto.js";

const combos = (arr, k) =>
  k === 0 ? [[]] : arr.flatMap((v, i) => combos(arr.slice(i + 1), k - 1).map((c) => [v, ...c]));

const SUBGROUP_ORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n;
function randSecret() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let x = 0n; for (const v of b) x = (x << 8n) | BigInt(v);
  return (x % SUBGROUP_ORDER).toString();
}

let pass = 0, fail = 0, configs = 0, subsets = 0;
const check = (ok, label) => { ok ? pass++ : fail++; if (!ok) console.log("  FAIL:", label); };

for (let n = 2; n <= 9; n++) {
  for (let t = 2; t <= n; t++) {
    configs++;
    const secret = randSecret();
    const shares = shamirSplit(secret, t, n);
    check(shares.length === n, `${t}-of-${n} share count`);
    for (const sub of combos(shares, t)) {
      subsets++;
      check(shamirCombine(sub) === secret, `${t}-of-${n} subset [${sub.map((s) => s.index)}]`);
    }
    for (const sub of combos(shares, t - 1)) {
      subsets++;
      check(shamirCombine(sub) !== secret, `${t}-of-${n} MUST FAIL with t-1 [${sub.map((s) => s.index)}]`);
    }
    if (n > t) check(shamirCombine(shares) === secret, `${t}-of-${n} all shares`);
  }
}
for (const [t, n] of [[1, 3], [4, 3], [0, 0], [2, 1]]) {
  let threw = false;
  try { shamirSplit(1n, t, n); } catch { threw = true; }
  check(threw, `rejects t=${t} n=${n}`);
}
console.log(`${configs} (t,n) configurations · ${subsets} subsets · ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
