// Minimal Three.js setup: colored axes and subtle XY plane grid
// No frameworks, just ES modules from CDN via import map (see index.html)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const app = document.getElementById('app');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.setClearColor(0xffffff, 1);
app.appendChild(renderer.domElement);

// Scene & Camera
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, app.clientWidth / app.clientHeight, 0.1, 1000);
// Use right-handed Z-up: set camera up vector, then position looking down toward origin
camera.up.set(0, 0, 1);
camera.position.set(20, 16, 22);
scene.add(camera);

// Lighting: very subtle ambient for material visibility
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 4, 8);
scene.add(dirLight);

// Thick axes made of boxes: extend into negative regions
const AXIS_EXTENT = 100; // half-length; axes run from -extent to +extent
const AXIS_THICKNESS = 0.04; // slightly thinner axes

function createAxis({ axis, color, extent = AXIS_EXTENT, thickness = AXIS_THICKNESS }) {
  const length = extent * 2;
  let geom;
  if (axis === 'x') geom = new THREE.BoxGeometry(length, thickness, thickness);
  else if (axis === 'y') geom = new THREE.BoxGeometry(thickness, length, thickness);
  else if (axis === 'z') geom = new THREE.BoxGeometry(thickness, thickness, length);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(0, 0, 0); // centered at origin
  mesh.renderOrder = 1; // draw over grid where overlapping
  return mesh;
}

scene.add(
  createAxis({ axis: 'x', color: 0xff0000 }), // X red
  createAxis({ axis: 'y', color: 0x00ff00 }), // Y green
  createAxis({ axis: 'z', color: 0x0000ff })  // Z blue
);

// XY plane: minimal grid lines to reduce clutter
// Subtle filled XY plane at z=0
const planeSize = AXIS_EXTENT * 2;
const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
const planeMat = new THREE.MeshBasicMaterial({
  color: 0x8f96a3, // soft neutral
  opacity: 0.12,
  transparent: true,
  side: THREE.DoubleSide
});
// Let the grid lines render clearly on top by not writing depth for the plane
planeMat.depthWrite = false;
const xyPlane = new THREE.Mesh(planeGeom, planeMat);
// In Z-up, PlaneGeometry is XY already; z=0 is correct for the plane
xyPlane.position.set(0, 0, 0);
xyPlane.renderOrder = 0; // draw under axes (axes set to 1)
scene.add(xyPlane);

// Grid lines on XY plane: rotate GridHelper to XY and prevent z-fighting
const gridSize = AXIS_EXTENT * 2;
const gridDivisions = AXIS_EXTENT * 2; // 1 unit spacing
// Darker neutrals for better readability on white
const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x6f7785, 0xb5bcc6);
grid.rotation.x = Math.PI / 2; // put grid on XY plane
grid.renderOrder = 0.6; // below paraboloid (0.9), above plane (0)
if (Array.isArray(grid.material)) {
  grid.material.forEach(m => {
  m.opacity = 0.95;
  m.transparent = true;
  m.polygonOffset = false;
  m.polygonOffsetFactor = 0;
  m.polygonOffsetUnits = 0;
  });
} else {
  grid.material.opacity = 0.95;
  grid.material.transparent = true;
  grid.material.polygonOffset = false;
  grid.material.polygonOffsetFactor = 0;
  grid.material.polygonOffsetUnits = 0;
}
scene.add(grid);

// --- Paraboloid generation ---
// z = a x^2 + b y^2 + c over square domain [-R, R]^2
// We'll build a parametric surface using a regular grid

let surfaceMesh = null;

function buildParaboloid({ a, b, c, R, segments }) {
  const seg = Math.max(4, Math.min(256, segments));
  const positions = new Float32Array((seg + 1) * (seg + 1) * 3);
  const indices = new Uint32Array(seg * seg * 6);

  const step = (2 * R) / seg;
  let p = 0;
  for (let iy = 0; iy <= seg; iy++) {
    const y = -R + iy * step;
    for (let ix = 0; ix <= seg; ix++) {
      const x = -R + ix * step;
      const z = a * x * x + b * y * y + c;
      positions[p++] = x;
      positions[p++] = y;
      positions[p++] = z;
    }
  }

  let t = 0;
  const row = seg + 1;
  for (let iy = 0; iy < seg; iy++) {
    for (let ix = 0; ix < seg; ix++) {
      const aIdx = iy * row + ix;
      const bIdx = aIdx + 1;
      const cIdx = aIdx + row;
      const dIdx = cIdx + 1;
      // two triangles (a, c, b) and (b, c, d)
      indices[t++] = aIdx; indices[t++] = cIdx; indices[t++] = bIdx;
      indices[t++] = bIdx; indices[t++] = cIdx; indices[t++] = dIdx;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({
    color: 0x3a8ee6,
    specular: 0x99c2ff,
    shininess: 20,
    side: THREE.DoubleSide,
    depthWrite: true,
    transparent: false,
    opacity: 1.0,
  });

  if (surfaceMesh) scene.remove(surfaceMesh);
  surfaceMesh = new THREE.Mesh(geo, mat);
  surfaceMesh.renderOrder = 0.9; // above plane and grid, below axes
  scene.add(surfaceMesh);
}

// Controls wiring
const surfaceSelect = document.getElementById('surfaceSelect');
const rSlider = document.getElementById('rSlider');
const rValue = document.getElementById('rValue');
const eqEl = document.getElementById('equation');
const paramRows = document.getElementById('paramRows');

// Surface registry
const SURFACES = {
  paraboloid: {
    label: 'Paraboloid',
    params: {
      a: { min: -2, max: 2, step: 0.05, value: 0.5, label: 'a' },
      b: { min: -2, max: 2, step: 0.05, value: 0.5, label: 'b' },
      c: { min: -5, max: 5, step: 0.1, value: 0.0, label: 'c' },
    },
    equation: ({ a, b, c }) => formatEq([
      term(a, 'x²', 2), term(b, 'y²', 2), term(c, '', 1)
    ]),
    build: buildParaboloid,
  },
  plane: {
    label: 'Plane',
    params: {
      px: { min: -2, max: 2, step: 0.05, value: 0.2, label: 'p (x coeff)' },
      qy: { min: -2, max: 2, step: 0.05, value: -0.15, label: 'q (y coeff)' },
      r: { min: -5, max: 5, step: 0.1, value: 0.0, label: 'r (offset)' },
    },
    equation: ({ px, qy, r }) => formatEq([
      term(px, 'x', 2), term(qy, 'y', 2), term(r, '', 1)
    ]),
    build: ({ px, qy, r, R, segments }) => buildFromHeight((x, y) => px * x + qy * y + r, { R, segments }),
  },
  sine: {
    label: 'Sine wave',
    params: {
      amp: { min: 0, max: 5, step: 0.1, value: 1.0, label: 'amplitude' },
      kx: { min: 0, max: 5, step: 0.1, value: 1.0, label: 'kx' },
      ky: { min: 0, max: 5, step: 0.1, value: 1.0, label: 'ky' },
      phase: { min: 0, max: 6.283, step: 0.01, value: 0.0, label: 'phase' },
    },
    equation: ({ amp, kx, ky, phase }) => `z = ${amp.toFixed(2)} sin(${kx.toFixed(2)} x + ${ky.toFixed(2)} y + ${phase.toFixed(2)})`,
    build: ({ amp, kx, ky, phase, R, segments }) => buildFromHeight((x, y) => amp * Math.sin(kx * x + ky * y + phase), { R, segments }),
  },
  sinc: {
    label: 'Radial ripples (sinc)',
    params: {
      A: { min: 0, max: 5, step: 0.1, value: 2.0, label: 'amplitude A' },
      k: { min: 0.1, max: 5, step: 0.1, value: 2.0, label: 'frequency k' },
    },
      equation: ({ A, k }) => `z = ${A.toFixed(2)} sin(k r)/(k r), r = √(x² + y²)`,
    build: ({ A, k, R, segments }) => buildFromHeight((x, y) => {
      const r = Math.hypot(x, y);
      const kr = k * r;
      if (kr === 0) return A; // limit r->0: A * 1
      return A * Math.sin(kr) / kr;
    }, { R, segments }),
  },
  gaussian: {
    label: 'Gaussian bump',
    params: {
      A: { min: 0, max: 5, step: 0.1, value: 2.0, label: 'amplitude A' },
      sx: { min: 0.1, max: 10, step: 0.1, value: 3.0, label: 'sigma x' },
      sy: { min: 0.1, max: 10, step: 0.1, value: 3.0, label: 'sigma y' },
    },
    equation: ({ A, sx, sy }) => `z = ${A.toFixed(2)} exp(-(x²/${(2*sx*sx).toFixed(2)} + y²/${(2*sy*sy).toFixed(2)}))`,
    build: ({ A, sx, sy, R, segments }) => buildFromHeight((x, y) => A * Math.exp(-(x*x/(2*sx*sx) + y*y/(2*sy*sy))), { R, segments }),
  },
};

// Helpers to format equation pieces
function term(coeff, symbol, decimals) {
  if (Math.abs(coeff) < 1e-9) return null;
  const mag = Math.abs(coeff).toFixed(decimals);
  const sign = coeff >= 0 ? '+' : '-';
  const body = symbol ? `${mag} ${symbol}` : `${(+mag).toFixed(decimals)}`;
  return { sign, body };
}
function formatEq(terms) {
  const filtered = terms.filter(Boolean);
  if (filtered.length === 0) return 'z = 0';
  let s = 'z = ';
  // first term keeps its sign only if negative
  const first = filtered[0];
  s += (first.sign === '-' ? '- ' : '') + first.body;
  for (let i = 1; i < filtered.length; i++) {
    s += ` ${filtered[i].sign} ${filtered[i].body}`;
  }
  return s;
}

// Generic builder from a height function z = f(x,y)
function buildFromHeight(f, { R, segments }) {
  const seg = Math.max(4, Math.min(256, segments));
  const positions = new Float32Array((seg + 1) * (seg + 1) * 3);
  const indices = new Uint32Array(seg * seg * 6);
  const step = (2 * R) / seg;
  let p = 0;
  for (let iy = 0; iy <= seg; iy++) {
    const y = -R + iy * step;
    for (let ix = 0; ix <= seg; ix++) {
      const x = -R + ix * step;
      const z = f(x, y);
      positions[p++] = x; positions[p++] = y; positions[p++] = z;
    }
  }
  let t = 0;
  const row = seg + 1;
  for (let iy = 0; iy < seg; iy++) {
    for (let ix = 0; ix < seg; ix++) {
      const aIdx = iy * row + ix;
      const bIdx = aIdx + 1;
      const cIdx = aIdx + row;
      const dIdx = cIdx + 1;
      indices[t++] = aIdx; indices[t++] = cIdx; indices[t++] = bIdx;
      indices[t++] = bIdx; indices[t++] = cIdx; indices[t++] = dIdx;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({
    color: 0x3a8ee6,
    specular: 0x99c2ff,
    shininess: 20,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  if (surfaceMesh) scene.remove(surfaceMesh);
  surfaceMesh = new THREE.Mesh(geo, mat);
  surfaceMesh.renderOrder = 0.9;
  scene.add(surfaceMesh);
}

function getParams() {
  const R = parseFloat(rSlider.value);
  const segments = Math.round(R * 4);
  // pull dynamic params from current UI
  const current = surfaceSelect.value;
  const def = SURFACES[current];
  const params = {};
  for (const key of Object.keys(def.params)) {
    const el = document.getElementById(`param_${key}`);
    params[key] = parseFloat(el.value);
  }
  return { ...params, R, segments };
}

function updateReadouts(paramsWithR) {
  const { R, ...params } = paramsWithR;
  rValue.textContent = R.toFixed(0);
  const current = surfaceSelect.value;
  const def = SURFACES[current];
  // Update small value spans beside inputs
  for (const key of Object.keys(def.params)) {
    const span = document.getElementById(`value_${key}`);
    const decimals = def.params[key].step < 0.1 ? 2 : 1;
    span.textContent = parseFloat(params[key]).toFixed(decimals);
  }
  // Update equation text
  eqEl.textContent = def.equation(params);
}

function updateSurface() {
  const current = surfaceSelect.value;
  const params = getParams();
  updateReadouts(params);
  const def = SURFACES[current];
  def.build({ ...params });
}

// Wire events (input for live updates)
// Dynamic params UI builder
function renderParamRows(surfaceKey) {
  const def = SURFACES[surfaceKey];
  paramRows.innerHTML = '';
  for (const [key, cfg] of Object.entries(def.params)) {
    const label = document.createElement('label');
    const text = document.createTextNode(' ' + cfg.label + ' ');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(cfg.min);
    input.max = String(cfg.max);
    input.step = String(cfg.step);
    input.value = String(cfg.value);
    input.id = `param_${key}`;
    const span = document.createElement('span');
    span.id = `value_${key}`;
    const decimals = cfg.step < 0.1 ? 2 : 1;
    span.textContent = parseFloat(cfg.value).toFixed(decimals);

    // place into grid: label content handles alignment
    label.appendChild(text);
    label.appendChild(input);
    label.appendChild(span);
    paramRows.appendChild(label);

    input.addEventListener('input', updateSurface);
  }
}

surfaceSelect.addEventListener('change', () => {
  renderParamRows(surfaceSelect.value);
  updateSurface();
});

rSlider.addEventListener('input', updateSurface);

// Initial render
renderParamRows(surfaceSelect.value);
updateSurface();

// A thin line for the XY plane boundary is unnecessary; keep uncluttered.

// Controls: rotate and zoom (disable pan), with damping for smoothness
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = true;
controls.minDistance = 2;
controls.maxDistance = 1000;
controls.target.set(0, 0, 0);

// Keep camera somewhat above plane initially
controls.update();

// Home view reset
const HOME = {
  position: new THREE.Vector3(20, 16, 22),
  target: new THREE.Vector3(0, 0, 0),
  up: new THREE.Vector3(0, 0, 1),
};

function resetView() {
  camera.up.copy(HOME.up);
  camera.position.copy(HOME.position);
  controls.target.copy(HOME.target);
  controls.update();
}

document.getElementById('homeBtn')?.addEventListener('click', resetView);

// Handle resize
function onResize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
