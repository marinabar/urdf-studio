// Emit a standalone XY object placement editor for the HK cargo-port world layout.
//
// This version does NOT regenerate the yard.
// It treats every object in `environment.elements[]` as directly editable in XY.
// Export preserves Z, rotation, scale, physics, URI, metadata, material_color, etc.
// Only `position_xyz[0]` and `position_xyz[1]` change.
//
// Run:
//   node tools/scripts/build-container-yard.mjs
//
// Outputs:
//   tools/container-yard-editor.html
//
// Then open:
//   tools/container-yard-editor.html
//
// After editing, click "Download world-layout.json" and replace:
//   web/public/world-layouts/hk-cargo-port.world-layout.json

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const LAYOUT = resolve(ROOT, "web/public/world-layouts/hk-cargo-port.world-layout.json");
const EDITOR = resolve(ROOT, "tools/container-yard-editor.html");

const doc = JSON.parse(readFileSync(LAYOUT, "utf8"));

if (!doc.environment || !Array.isArray(doc.environment.elements)) {
  throw new Error("Invalid world layout: expected environment.elements[]");
}

writeFileSync(EDITOR, renderEditor({ baseDoc: doc }) + "\n");

console.log(`Wrote XY object editor -> ${EDITOR.replace(ROOT + "/", "")}`);
console.log(`Loaded ${doc.environment.elements.length} editable objects from ${LAYOUT.replace(ROOT + "/", "")}`);

function renderEditor({ baseDoc }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HK Port - XY Object Layout Editor</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.45 system-ui, sans-serif; background: #0e0f12; color: #e6e6e6; }
  header { padding: 12px 16px; border-bottom: 1px solid #23252b; }
  header h1 { font-size: 15px; margin: 0 0 2px; }
  header p { margin: 0; color: #9aa0a6; font-size: 12px; }
  main { display: grid; grid-template-columns: 340px 1fr; gap: 16px; padding: 16px; align-items: start; }
  .panel { background: #15171c; border: 1px solid #23252b; border-radius: 10px; padding: 14px; }
  .panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9aa0a6; margin: 0 0 10px; }
  label { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 6px 0; }
  input, select {
    background: #0e0f12; border: 1px solid #2c2f37; color: #e6e6e6;
    border-radius: 6px; padding: 4px 6px;
  }
  input[type=number] { width: 110px; }
  input[type=text] { width: 190px; }
  select { width: 190px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  button.act { background: #2a6df4; color: #fff; border: 0; border-radius: 7px; padding: 8px 12px; cursor: pointer; font-weight: 600; }
  button.ghost { background: #1d2028; color: #e6e6e6; border: 1px solid #2c2f37; border-radius: 7px; padding: 8px 12px; cursor: pointer; }
  canvas { background: #0a0b0e; border: 1px solid #23252b; border-radius: 10px; width: 100%; height: auto; display: block; cursor: crosshair; touch-action: none; }
  .hint { color: #9aa0a6; font-size: 11px; margin-top: 8px; }
  .count { color: #cdd1d6; font-size: 12px; margin-top: 8px; }
  code, kbd { background: #0e0f12; padding: 1px 5px; border-radius: 4px; border: 1px solid #2c2f37; }
  hr { border: 0; border-top: 1px solid #23252b; margin: 14px 0; }
</style>
</head>
<body>
<header>
  <h1>HK Port — XY Object Layout Editor</h1>
  <p>Drag any object in the top-down world XY view. Only <code>position_xyz[0]</code> and <code>position_xyz[1]</code> are changed on export. Z, rotation, scale, physics, URI, metadata and colors are preserved.</p>
</header>

<main>
  <section class="panel">
    <h2>Selected object</h2>
    <label>ID <input id="objId" type="text" disabled></label>
    <label>Name <input id="objName" type="text" disabled></label>
    <label>X <input type="number" id="objX" step="0.01" disabled></label>
    <label>Y <input type="number" id="objY" step="0.01" disabled></label>

    <div class="row">
      <button class="ghost" id="nudgeLeft">←</button>
      <button class="ghost" id="nudgeRight">→</button>
      <button class="ghost" id="nudgeUp">↑</button>
      <button class="ghost" id="nudgeDown">↓</button>
    </div>
    <label>Nudge step <input type="number" id="nudgeStep" step="0.001" value="0.01"></label>

    <hr>

    <h2>Objects</h2>
    <label>Filter <input id="filter" type="text" placeholder="yard, crane, ship..."></label>
    <label>Object <select id="objectList"></select></label>

    <div class="row">
      <button class="ghost" id="fit">Fit view</button>
      <button class="ghost" id="resetObjects">Reset objects</button>
    </div>

    <hr>

    <h2>Grid / snapping</h2>
    <label><span>Show grid</span><input type="checkbox" id="showGrid" checked></label>
    <label><span>Snap while dragging</span><input type="checkbox" id="snapDrag"></label>
    <label>Grid step <input type="number" id="gridStep" min="0.001" step="0.001" value="0.05"></label>

    <hr>

    <h2>Export</h2>
    <div class="row">
      <button class="act" id="download">Download world-layout.json</button>
      <button class="ghost" id="copy">Copy full layout JSON</button>
      <button class="ghost" id="copyElements">Copy elements JSON</button>
    </div>

    <div class="count" id="count"></div>
    <p class="hint">This editor edits every existing element directly. It does not regenerate or reorder the yard.</p>
  </section>

  <section class="panel">
    <h2>Top-down world XY — red = grabbables · gray = yard containers · outlined = large meshes</h2>
    <canvas id="cv" width="1060" height="720"></canvas>
    <p class="hint" id="sel">Nothing selected.</p>
  </section>
</main>

<script>
const BASE_DOC = ${JSON.stringify(baseDoc)};

const ARM = { x: 0, y: 0, reach: 0.32 };
const $ = (id) => document.getElementById(id);
const round = (n) => Math.round(n * 1e6) / 1e6;

let objects = JSON.parse(JSON.stringify(BASE_DOC.environment.elements || []));
let sel = { id: null };
let drag = null;
let view = null;

const cv = $("cv");
const ctx = cv.getContext("2d");

function objPos(o) {
  return [Number(o.position_xyz?.[0] || 0), Number(o.position_xyz?.[1] || 0)];
}

function setObjXY(o, x, y) {
  o.position_xyz ||= [0, 0, 0];
  o.position_xyz[0] = round(x);
  o.position_xyz[1] = round(y);
}

function selectedObject() {
  return objects.find((o) => o.id === sel.id) || null;
}

function objectKind(o) {
  const id = o.id || "";
  const name = o.name || "";
  if (id.startsWith("grabbable-container")) return "grabbable";
  if (id.startsWith("yard-container")) return "yard";
  if (id.includes("crane")) return "crane";
  if (id.includes("ship") || name.toLowerCase().includes("ship")) return "ship";
  return "object";
}

function colorFor(o, selected) {
  if (selected) return "#ffffff";
  if (o.material_color) return o.material_color;
  switch (objectKind(o)) {
    case "grabbable": return "#ef4444";
    case "yard": return "#9aa0a6";
    case "crane": return "#f59e0b";
    case "ship": return "#60a5fa";
    default: return "#cdd1d6";
  }
}

function markerRadiusPx(o) {
  switch (objectKind(o)) {
    case "yard": return 6;
    case "grabbable": return 8;
    case "crane": return 12;
    case "ship": return 13;
    default: return 9;
  }
}

function filteredObjects() {
  const q = $("filter").value.trim().toLowerCase();
  if (!q) return objects;
  return objects.filter((o) =>
    String(o.id || "").toLowerCase().includes(q) ||
    String(o.name || "").toLowerCase().includes(q)
  );
}

function refreshObjectList() {
  const list = $("objectList");
  const prev = list.value;
  list.innerHTML = "";

  for (const o of filteredObjects()) {
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.id + (o.name ? " — " + o.name : "");
    list.appendChild(opt);
  }

  if (sel.id && [...list.options].some((o) => o.value === sel.id)) {
    list.value = sel.id;
  } else if (prev && [...list.options].some((o) => o.value === prev)) {
    list.value = prev;
  }
}

function contentBounds() {
  const pts = objects.map(objPos);
  pts.push([ARM.x - ARM.reach, ARM.y - ARM.reach], [ARM.x + ARM.reach, ARM.y + ARM.reach]);

  if (!pts.length) return { minx: -1, miny: -1, maxx: 1, maxy: 1 };

  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of pts) {
    minx = Math.min(minx, x);
    miny = Math.min(miny, y);
    maxx = Math.max(maxx, x);
    maxy = Math.max(maxy, y);
  }

  const pad = 0.15 * Math.max(maxx - minx, maxy - miny, 0.001);
  return { minx: minx - pad, miny: miny - pad, maxx: maxx + pad, maxy: maxy + pad };
}

function fitView() {
  view = contentBounds();
  draw();
}

function tf() {
  const W = cv.width, H = cv.height;
  const vw = view.maxx - view.minx;
  const vh = view.maxy - view.miny;
  const sc = Math.min(W / vw, H / vh);
  return { sc, ox: (W - vw * sc) / 2, oy: (H - vh * sc) / 2 };
}

const PX = (wx, t) => t.ox + (wx - view.minx) * t.sc;
const PY = (wy, t) => t.oy + (view.maxy - wy) * t.sc;

function mouseWorld(e) {
  const r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) * cv.width / r.width;
  const py = (e.clientY - r.top) * cv.height / r.height;
  const t = tf();

  return {
    wx: view.minx + (px - t.ox) / t.sc,
    wy: view.maxy - (py - t.oy) / t.sc,
  };
}

function snap(v) {
  const step = Number($("gridStep").value) || 0.05;
  return round(Math.round(v / step) * step);
}

function maybeSnapXY(x, y) {
  if (!$("snapDrag").checked) return [round(x), round(y)];
  return [snap(x), snap(y)];
}

function objectAt(wx, wy) {
  const t = tf();

  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    const [x, y] = objPos(o);
    const radiusWorld = markerRadiusPx(o) / t.sc;

    if (Math.hypot(wx - x, wy - y) <= radiusWorld) {
      return o;
    }
  }

  return null;
}

function drawGrid(t) {
  if (!$("showGrid").checked) return;

  const step = Number($("gridStep").value) || 0.05;
  const minx = Math.floor(view.minx / step) * step;
  const maxx = Math.ceil(view.maxx / step) * step;
  const miny = Math.floor(view.miny / step) * step;
  const maxy = Math.ceil(view.maxy / step) * step;

  ctx.save();
  ctx.strokeStyle = "#20232a";
  ctx.lineWidth = 1;

  for (let x = minx; x <= maxx + 1e-9; x += step) {
    ctx.beginPath();
    ctx.moveTo(PX(x, t), PY(miny, t));
    ctx.lineTo(PX(x, t), PY(maxy, t));
    ctx.stroke();
  }

  for (let y = miny; y <= maxy + 1e-9; y += step) {
    ctx.beginPath();
    ctx.moveTo(PX(minx, t), PY(y, t));
    ctx.lineTo(PX(maxx, t), PY(y, t));
    ctx.stroke();
  }

  ctx.restore();
}

function drawObject(o, t) {
  const [x, y] = objPos(o);
  const px = PX(x, t);
  const py = PY(y, t);
  const selected = sel.id === o.id;
  const kind = objectKind(o);
  const r = markerRadiusPx(o);

  ctx.save();

  if (kind === "yard" || kind === "grabbable") {
    ctx.beginPath();
    ctx.arc(px, py, selected ? r + 2 : r, 0, Math.PI * 2);
    ctx.fillStyle = colorFor(o, selected);
    ctx.fill();
    ctx.strokeStyle = "#0a0b0e";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(px, py, selected ? r + 2 : r, 0, Math.PI * 2);
    ctx.lineWidth = selected ? 2.5 : 1.4;
    ctx.strokeStyle = colorFor(o, selected);
    ctx.stroke();

    ctx.fillStyle = "#9aa0a6";
    ctx.font = "10px system-ui";
    ctx.fillText(o.name || o.id, px + r + 4, py - 5);
  }

  ctx.restore();
}

function draw() {
  if (!view) view = contentBounds();
  const t = tf();

  ctx.clearRect(0, 0, cv.width, cv.height);

  drawGrid(t);

  ctx.save();
  ctx.strokeStyle = "#2f3540";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PX(view.minx, t), PY(0, t));
  ctx.lineTo(PX(view.maxx, t), PY(0, t));
  ctx.moveTo(PX(0, t), PY(view.miny, t));
  ctx.lineTo(PX(0, t), PY(view.maxy, t));
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#1b6f7a";
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(PX(ARM.x, t), PY(ARM.y, t), ARM.reach * t.sc, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.arc(PX(ARM.x, t), PY(ARM.y, t), 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "11px system-ui";
  ctx.fillText("arm origin", PX(ARM.x, t) + 8, PY(ARM.y, t) - 6);
  ctx.restore();

  for (const o of objects) drawObject(o, t);

  $("count").textContent = objects.length + " editable objects";
}

function syncInspector() {
  const o = selectedObject();

  $("objId").value = o ? o.id || "" : "";
  $("objName").value = o ? o.name || "" : "";
  $("objX").value = o ? o.position_xyz[0] : "";
  $("objY").value = o ? o.position_xyz[1] : "";

  $("objX").disabled = !o;
  $("objY").disabled = !o;

  refreshObjectList();
}

function showSel() {
  const o = selectedObject();

  if (!o) {
    $("sel").textContent = "Nothing selected. Drag any object to move it in XY.";
    syncInspector();
    return;
  }

  $("sel").textContent =
    'Selected "' + o.id + '" @ x=' +
    Number(o.position_xyz[0]).toFixed(3) +
    ", y=" +
    Number(o.position_xyz[1]).toFixed(3);

  syncInspector();
}

function selectObject(id, shouldCenter = false) {
  const o = objects.find((x) => x.id === id);
  sel = { id: o ? id : null };

  if (shouldCenter && o) {
    const [x, y] = objPos(o);
    const w = view ? view.maxx - view.minx : 1;
    const h = view ? view.maxy - view.miny : 1;
    view = { minx: x - w / 2, maxx: x + w / 2, miny: y - h / 2, maxy: y + h / 2 };
  }

  showSel();
  draw();
}

function nudgeSelected(dx, dy) {
  const o = selectedObject();
  if (!o) return;

  const [x, y] = objPos(o);
  setObjXY(o, x + dx, y + dy);
  showSel();
  draw();
}

cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);

  const { wx, wy } = mouseWorld(e);
  const o = objectAt(wx, wy);

  if (!o) {
    sel = { id: null };
    drag = null;
    showSel();
    draw();
    return;
  }

  const [x, y] = objPos(o);

  sel = { id: o.id };
  drag = {
    id: o.id,
    dx: x - wx,
    dy: y - wy,
  };

  showSel();
  draw();
});

cv.addEventListener("pointermove", (e) => {
  if (!drag) return;

  const { wx, wy } = mouseWorld(e);
  const o = objects.find((obj) => obj.id === drag.id);
  if (!o) return;

  const [x, y] = maybeSnapXY(wx + drag.dx, wy + drag.dy);
  setObjXY(o, x, y);

  showSel();
  draw();
});

cv.addEventListener("pointerup", () => { drag = null; });
cv.addEventListener("pointercancel", () => { drag = null; });

$("objX").addEventListener("input", () => {
  const o = selectedObject();
  if (!o) return;
  setObjXY(o, Number($("objX").value), o.position_xyz[1]);
  draw();
  showSel();
});

$("objY").addEventListener("input", () => {
  const o = selectedObject();
  if (!o) return;
  setObjXY(o, o.position_xyz[0], Number($("objY").value));
  draw();
  showSel();
});

$("objectList").addEventListener("change", () => selectObject($("objectList").value, true));
$("filter").addEventListener("input", () => refreshObjectList());

$("fit").onclick = fitView;

$("resetObjects").onclick = () => {
  objects = JSON.parse(JSON.stringify(BASE_DOC.environment.elements || []));
  sel = { id: null };
  drag = null;
  showSel();
  fitView();
};

$("showGrid").addEventListener("change", draw);
$("gridStep").addEventListener("input", draw);

$("nudgeLeft").onclick = () => nudgeSelected(-(Number($("nudgeStep").value) || 0.01), 0);
$("nudgeRight").onclick = () => nudgeSelected(Number($("nudgeStep").value) || 0.01, 0);
$("nudgeUp").onclick = () => nudgeSelected(0, Number($("nudgeStep").value) || 0.01);
$("nudgeDown").onclick = () => nudgeSelected(0, -(Number($("nudgeStep").value) || 0.01));

window.addEventListener("keydown", (e) => {
  if (!selectedObject()) return;

  const step = Number($("nudgeStep").value) || 0.01;

  if (e.key === "ArrowLeft") { e.preventDefault(); nudgeSelected(-step, 0); }
  if (e.key === "ArrowRight") { e.preventDefault(); nudgeSelected(step, 0); }
  if (e.key === "ArrowUp") { e.preventDefault(); nudgeSelected(0, step); }
  if (e.key === "ArrowDown") { e.preventDefault(); nudgeSelected(0, -step); }
});

function buildDoc() {
  const out = JSON.parse(JSON.stringify(BASE_DOC));
  out.environment.elements = JSON.parse(JSON.stringify(objects));

  out.environment.notes = (out.environment.notes || []).filter(
    (n) => !String(n).startsWith("Scene manually edited")
  );

  out.environment.notes.push(
    "Scene manually edited in tools/container-yard-editor.html. Only environment.elements position_xyz X/Y values were changed."
  );

  return out;
}

$("download").onclick = () => {
  const blob = new Blob([JSON.stringify(buildDoc(), null, 2) + "\\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hk-cargo-port.world-layout.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

$("copy").onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(buildDoc(), null, 2));
  $("copy").textContent = "Copied!";
  setTimeout(() => ($("copy").textContent = "Copy full layout JSON"), 1200);
};

$("copyElements").onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(objects, null, 2));
  $("copyElements").textContent = "Copied!";
  setTimeout(() => ($("copyElements").textContent = "Copy elements JSON"), 1200);
};

refreshObjectList();
showSel();
fitView();
</script>
</body>
</html>`;
}
