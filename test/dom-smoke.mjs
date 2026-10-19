// Smoke-test the full app script from index.html under Node with a stub DOM:
// press Start, deliver a GPS fix and an orientation event, run a few frames,
// and check that coastlines, labels and HUD text were actually drawn.
// Usage: node test/dom-smoke.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const here = new URL('.', import.meta.url).pathname;
const html = readFileSync(here + '../ar/index.html', 'utf8');
const blocks = [...html.matchAll(/<script(?: id="core")?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (blocks.length !== 2) { console.error('expected 2 script blocks, got ' + blocks.length); process.exit(1); }

// ---- recording canvas context ----
const drawn = { moveTo: 0, lineTo: 0, stroke: 0, arc: 0, texts: [] };
const ctx2d = new Proxy({}, {
  get(_, k) {
    if (k === 'fillText' || k === 'strokeText') return (t) => { drawn.texts.push(String(t)); };
    if (k === 'moveTo') return () => drawn.moveTo++;
    if (k === 'lineTo') return () => drawn.lineTo++;
    if (k === 'stroke') return () => drawn.stroke++;
    if (k === 'arc') return () => drawn.arc++;
    return () => {};        // clearRect, setTransform, beginPath, fill, ...
  },
  set() { return true; }    // font, strokeStyle, lineWidth, ...
});

// ---- stub elements ----
function makeEl(id) {
  const listeners = {};
  return {
    id, value: '', textContent: '', style: {}, children: [],
    set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type, ev) { (listeners[type] || []).forEach(fn => fn.call(this, ev || {})); },
    appendChild(c) { this.children.push(c); },
    setPointerCapture() {},
    getContext(kind) { return kind === '2d' ? ctx2d : null; },
    play() { return { catch() {} }; },
  };
}
const els = {};
const byId = id => (els[id] ||= makeEl(id));

// ---- sandbox globals ----
const winListeners = {};
let rafCb = null;
const sandbox = {
  console,
  Math, JSON, Promise, Float32Array, Infinity, NaN, isFinite, parseFloat,
  performance, setTimeout, clearTimeout,
  document: {
    getElementById: byId,
    createElement: () => makeEl('anon'),
  },
  navigator: {
    geolocation: {
      getCurrentPosition(ok) { ok({ coords: { latitude: 40.7128, longitude: -74.0060 } }); },
    },
    // no mediaDevices: camera path degrades to a note, which is the point
  },
  screen: { orientation: { angle: 0 } },
  requestAnimationFrame(cb) { rafCb = cb; },
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, orientation: 0,
  addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let failed = 0;
const check = (name, ok, detail) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  -- ' + detail : ''));
  if (!ok) failed++;
};

try {
  vm.runInContext(blocks[0], sandbox);   // core
  vm.runInContext(blocks[1], sandbox);   // app (IIFE, wires everything at load)
  check('scripts load without throwing', true);
} catch (e) {
  check('scripts load without throwing', false, String(e && e.stack || e));
  process.exit(1);
}

try {
  byId('modeAr').fire('click');          // Camera AR mode: the wide, lens-registered view
  byId('startBtn').fire('click');        // start: attaches sensors, geo fires synchronously
  check('start flow runs (geo fix applied)', /loc 40\.71/.test(byId('chipLoc').textContent),
    JSON.stringify(byId('chipLoc').textContent));
  check('space is the default background; without WebGL the app says so',
    byId('bgSrc').value === 'space' && byId('bgSel').value === 'space' && /WebGL unavailable/.test(byId('note').textContent),
    JSON.stringify(byId('note').textContent));

  // phone flat, top edge north
  (winListeners['deviceorientation'] || []).forEach(fn =>
    fn({ alpha: 0, beta: 0, gamma: 0, absolute: false }));

  const t0 = performance.now();
  for (let i = 1; i <= 5 && rafCb; i++) { const cb = rafCb; rafCb = null; cb(t0 + i * 200); }

  check('coastlines drawn', drawn.lineTo > 2000, drawn.lineTo + ' lineTo calls');
  check('antipode reticle drawn', drawn.texts.some(t => t === 'ANTIPODE'));
  check('ring labels drawn', drawn.texts.some(t => /Θ \d+°/.test(t)),
    JSON.stringify(drawn.texts.filter(t => t.startsWith('Θ')).slice(0, 5)));
  check('city labels drawn', drawn.texts.some(t => t === 'Perth' || t === 'Sydney'),
    JSON.stringify(drawn.texts.filter(t => /^[A-Z]/.test(t)).slice(0, 8)));
  check('HUD readout shows ν and Θ', /ν 0\.0° · Θ 0\.0°/.test(byId('roMain').textContent),
    JSON.stringify(byId('roMain').textContent));
  check('HUD nearest place computed', /Perth|km/.test(byId('roSub').textContent),
    JSON.stringify(byId('roSub').textContent));
  check('sun chip stays quiet without the sky layer', byId('chipSun').textContent === 'sun: –',
    JSON.stringify(byId('chipSun').textContent));

  // the clock control drives the sky's time
  byId('clock').value = '6'; byId('clock').fire('input');
  check('clock offset shows in the panel', /\+6 h/.test(byId('clockVal').textContent) && /UTC/.test(byId('clockInfo').textContent),
    JSON.stringify(byId('clockVal').textContent));
  byId('clockNow').fire('click');
  check('clock reset to now', byId('clockVal').textContent === 'now');

  // switching to the camera background with no camera API degrades to a note
  byId('bgSel').value = 'camera'; byId('bgSel').fire('change');
  check('camera background without a camera API notes it', /no camera API/.test(byId('note').textContent),
    JSON.stringify(byId('note').textContent));
  byId('bgSel').value = 'space'; byId('bgSel').fire('change');

  // tilt 40 deg toward horizon, then run frames: nu should approach 40
  (winListeners['deviceorientation'] || []).forEach(fn =>
    fn({ alpha: 0, beta: 40, gamma: 0, absolute: false }));
  for (let i = 6; i <= 40 && rafCb; i++) { const cb = rafCb; rafCb = null; cb(t0 + i * 200); }
  const nu = parseFloat((byId('roMain').textContent.match(/ν ([\d.]+)°/) || [])[1]);
  check('tilt 40° -> readout ν ≈ 40°', Math.abs(nu - 40) < 1.5, 'ν = ' + nu + '°');

  // window mode: the pane geometry. In the stub (390x844 CSS px, dpr 2, no
  // device-table hit) the screen is taken as 326 ppi -> 6.42 px/mm, so at the
  // assumed 40 cm the pane subtends 2*atan(422 / (6417*0.40)) = 18.6 deg.
  drawn.texts.length = 0;
  byId('modeWin').fire('click');
  byId('startBtn').fire('click');
  (winListeners['deviceorientation'] || []).forEach(fn =>
    fn({ alpha: 0, beta: 0, gamma: 0, absolute: false }));
  for (let i = 41; i <= 60 && rafCb; i++) { const cb = rafCb; rafCb = null; cb(t0 + i * 200); }
  check('window mode: pane subtends ~18.6°', /window 18\.[4-8]°/.test(byId('chipView').textContent),
    JSON.stringify(byId('chipView').textContent));
  check('window mode: only the narrow rings fit', drawn.texts.includes('Θ 10°') && !drawn.texts.includes('Θ 60°'),
    JSON.stringify(drawn.texts.filter(t => t.startsWith('Θ'))));
  check('window mode: Perth still in view, Sydney not', drawn.texts.includes('Perth') && !drawn.texts.includes('Sydney'));

  // self-test button produces all-pass output
  byId('runTest').fire('click');
  const lines = byId('testOut').children.map(c => c.textContent).join('');
  check('in-app self-test panel: all pass', !/✗/.test(lines) && /\/22|passed/.test(lines),
    (lines.match(/(\d+\/\d+ passed)/) || [])[1]);
} catch (e) {
  check('interaction flow runs without throwing', false, String(e && e.stack || e));
}

console.log(failed === 0 ? '\nSMOKE TEST PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
