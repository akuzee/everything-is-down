// Runs the <script id="core"> block from index.html under Node and verifies:
//  - the built-in self-test panel (same checks the browser "Run self-test" shows)
//  - a deep round-trip of the inlined coastline data against the build script's
//    reference decode (test/coast_reference.json)
// Usage: node test/core-test.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const here = new URL('.', import.meta.url).pathname;
const html = readFileSync(here + '../ar/index.html', 'utf8');

const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) { console.error('core script block not found'); process.exit(1); }

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(m[1], ctx);
const A = ctx.Antipode;

let failed = 0;

// 1. built-in self-test
for (const r of A.runSelfTest()) {
  console.log((r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + (r.detail ? '  -- ' + r.detail : ''));
  if (!r.pass) failed++;
}

// 2. deep round-trip vs the Python build's reference decode
const ref = JSON.parse(readFileSync(here + 'coast_reference.json', 'utf8'));
const dec = A.decodeCoastInt(A.COAST_DATA);
let same = dec.length === ref.length;
if (same) {
  outer: for (let i = 0; i < ref.length; i++) {
    if (dec[i].length !== ref[i].length) { same = false; break; }
    for (let j = 0; j < ref[i].length; j++) {
      if (dec[i][j][0] !== ref[i][j][0] || dec[i][j][1] !== ref[i][j][1]) { same = false; break outer; }
    }
  }
}
console.log((same ? 'PASS' : 'FAIL') + '  JS decoder matches Python reference decode exactly'
  + `  -- ${dec.length} polylines`);
if (!same) failed++;

// 3. the data strings must be raw-embeddable (no escaping surprises)
const safe = s => [...s].every(c => {
  const k = c.charCodeAt(0);
  return k >= 40 && k <= 126 && k !== 60 && k !== 62 && k !== 92 && k !== 96;
});
const dataOk = safe(A.COAST_DATA) && safe(A.STAR_DATA) &&
  A.CONST_DATA.split('#').every(p => safe(p.slice(p.indexOf('!') + 1)) && !/['\\]/.test(p));
console.log((dataOk ? 'PASS' : 'FAIL') + '  data uses only the 83-char safe alphabet');
if (!dataOk) failed++;

// 4. sky data round-trip vs the Python build's reference decode
const sref = JSON.parse(readFileSync(here + 'sky_reference.json', 'utf8'));
const st = A.decodeStars(A.STAR_DATA);
let skySame = st.n === sref.stars.length;
for (let i = 0; skySame && i < st.n; i++) {
  const [raU, deU, mc] = sref.stars[i];
  if (Math.abs(st.ra[i] - raU * sref.q) > 1e-9 || Math.abs(st.dec[i] - (deU * sref.q - 90)) > 1e-9 ||
      Math.abs(st.mag[i] - ((mc >> 3) / 10 - 1.5)) > 1e-5 || st.col[i] !== (mc & 7)) skySame = false;
}
const figs = A.decodeFigures(A.CONST_DATA);
let figSame = figs.length === sref.figures.length;
for (let i = 0; figSame && i < figs.length; i++) {
  if (figs[i].name !== sref.figures[i].n || JSON.stringify(figs[i].chains) !== JSON.stringify(sref.figures[i].c)) figSame = false;
}
console.log((skySame && figSame ? 'PASS' : 'FAIL') + '  JS sky decoders match Python reference decode exactly'
  + `  -- ${st.n} stars, ${figs.length} figures`);
if (!(skySame && figSame)) failed++;

console.log(failed === 0 ? '\nALL TESTS PASSED' : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
