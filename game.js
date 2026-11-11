import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';

const $ = (selector) => document.querySelector(selector);
const world = $('#world');
const overlay = $('#overlay');
const startButton = $('#startButton');
const instructions = $('#instructions');
const bestNote = $('#bestNote');
const scoreNode = $('#score');
const discoveriesNode = $('#discoveries');
const progress = $('#progress');
const toast = $('#toast');
const pauseButton = $('#pauseButton');
const soundButton = $('#soundButton');
const locationChip = $('#locationChip');
const mapCanvas = $('#map');
const mapCtx = mapCanvas.getContext('2d');
const keys = new Set();
const touch = new Set();
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const TOTAL_SEEDS = 8;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9de8ef');
scene.fog = new THREE.FogExp2('#9de8ef', 0.00155);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
world.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight('#e5ffff', '#719b83', 2.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3c7', 3.1);
sun.position.set(-80, 140, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -180; sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180;
sun.shadow.bias = -0.0003;
scene.add(sun);

let state = 'intro';
let soundOn = true;
let audio;
let score = 0;
let toastTimer = 0;
let elapsed = 0;
let last = performance.now();
let lookPointer = null;
let lastPointer = { x: 0, y: 0 };
let yaw = 0;
let pitch = 0.62;
let best = Number(localStorage.getItem('aero-isles-best') || 0);
const seeds = [];
const clouds = [];
const keysDown = new Set();

const player = new THREE.Group();
player.position.set(0, 0, 0);
scene.add(player);
let avatar;
let avatarParts = [];
let cameraTarget = new THREE.Vector3();
let cameraPosition = new THREE.Vector3();
let moveVelocity = new THREE.Vector3();
let hopTimer = 0;

function makeMat(color, roughness = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}
function addMesh(parent, geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
function terrainHeight(island, x, z) {
  const dx = x - island.x, dz = z - island.z;
  const distance = Math.hypot(dx, dz);
  const r = island.radius;
  if (distance > r * 1.05) return -1.6;
  const edge = clamp(1 - distance / r, 0, 1);
  return 1.1 + island.height * Math.pow(edge, 0.62) + Math.sin(x * 0.18 + island.seed) * 0.45 + Math.cos(z * 0.14 - island.seed) * 0.36;
}

function buildWater() {
  const geometry = new THREE.PlaneGeometry(1800, 1800, 1, 1);
  const material = new THREE.MeshPhysicalMaterial({
    color: '#58d2d5', roughness: 0.22, metalness: 0.12, clearcoat: 0.9,
    clearcoatRoughness: 0.14, transmission: 0.04, transparent: true, opacity: 0.93
  });
  const water = new THREE.Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -2.35;
  water.receiveShadow = true;
  scene.add(water);
  const discGeometry = new THREE.CircleGeometry(900, 96);
  const disc = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial({ color: '#52cbd2' }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -2.55;
  scene.add(disc);
}

function createTerrain(island) {
  const group = new THREE.Group();
  group.position.set(island.x, 0, island.z);
  scene.add(group);
  const segments = 48, radius = island.radius;
  const positions = [], indices = [], colors = [];
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    for (let side = 0; side <= segments; side++) {
      const a = side / segments * Math.PI * 2;
      const wobble = 1 + 0.035 * Math.sin(a * 5 + island.seed) + 0.025 * Math.cos(a * 8 - island.seed);
      const r = radius * t * wobble;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const d = Math.hypot(x, z);
      const edge = clamp(1 - d / radius, 0, 1);
      const y = 0.35 + island.height * Math.pow(edge, 0.65) + Math.sin((x + island.seed) * 0.18) * 0.3 + Math.cos((z - island.seed) * 0.15) * 0.26;
      positions.push(x, y, z);
      const beach = clamp((t - 0.78) * 5, 0, 1);
      const green = new THREE.Color(island.green);
      const sand = new THREE.Color('#e9dc9b');
      const color = green.lerp(sand, beach * 0.92);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let ring = 0; ring < segments; ring++) {
    for (let side = 0; side < segments; side++) {
      const a = ring * (segments + 1) + side;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }));
  ground.receiveShadow = true; ground.castShadow = true; group.add(ground);
  const underside = addMesh(group, new THREE.ConeGeometry(radius * 0.78, island.height * 2.8 + 4, 40, 4), makeMat(island.rock), [0, -island.height * 0.75, 0], [1, 1, 1]);
  underside.rotation.x = Math.PI;
  const rim = addMesh(group, new THREE.TorusGeometry(radius * 0.93, 1.1, 8, 80), makeMat('#c9dfb0'), [0, 0.15, 0]);
  rim.rotation.x = Math.PI / 2;
  island.group = group;
}

const treeMaterials = ['#55bb86', '#2ba99c', '#88d58a', '#b0dc82'].map(c => makeMat(c, 0.82));
function addTree(parent, x, y, z, size, seed) {
  const rand = seededRandom(seed);
  const trunk = addMesh(parent, new THREE.CylinderGeometry(size * .09, size * .15, size * .9, 7), makeMat('#a97858'), [x, y + size * .43, z]);
  trunk.rotation.z = (rand() - .5) * .18;
  for (let i = 0; i < 3; i++) {
    const crown = addMesh(parent, new THREE.IcosahedronGeometry(size * (0.55 - i * .06), 1), treeMaterials[Math.floor(rand() * treeMaterials.length)], [x + (rand() - .5) * size * .26, y + size * (.84 + i * .3), z + (rand() - .5) * size * .22], [1, .84, 1]);
    crown.rotation.y = rand() * 4;
  }
}
function addFlower(parent, x, y, z, color, size) {
  const stem = addMesh(parent, new THREE.CylinderGeometry(.035, .05, size, 5), makeMat('#56b889'), [x, y + size / 2, z]);
  stem.castShadow = false; stem.receiveShadow = false;
  const bloom = addMesh(parent, new THREE.IcosahedronGeometry(size * .34, 0), makeMat(color), [x, y + size, z], [1, .7, 1]);
  bloom.castShadow = false; bloom.receiveShadow = false;
  const center = addMesh(parent, new THREE.SphereGeometry(size * .12, 8, 6), makeMat('#ffe987'), [x, y + size, z]);
  center.castShadow = false; center.receiveShadow = false;
}

const islandSpecs = [
  { name: 'Sunmeadow', x: 0, z: 0, radius: 34, height: 13, green: '#79d49b', rock: '#668d83', color: '#85f4d0' },
  { name: 'Cloudberry Cay', x: -82, z: -64, radius: 28, height: 11, green: '#83dca2', rock: '#738f96', color: '#ffe99a' },
  { name: 'Glasswing Grove', x: 94, z: -72, radius: 31, height: 15, green: '#69cda5', rock: '#5e8b8b', color: '#a7ecff' },
  { name: 'Coralbell Isle', x: -74, z: 91, radius: 30, height: 12, green: '#8bd18a', rock: '#8b8b79', color: '#ffb2b8' },
  { name: 'Bluebell Reach', x: 91, z: 88, radius: 35, height: 17, green: '#78d49b', rock: '#627f8d', color: '#c4b8ff' },
];

function makeSeed(island, localX, localZ, id) {
  const y = terrainHeight(island, island.x + localX, island.z + localZ) + 2.6;
  const group = new THREE.Group();
  group.position.set(island.x + localX, y, island.z + localZ);
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), new THREE.MeshPhysicalMaterial({ color: '#a8fff0', emissive: island.color, emissiveIntensity: 1.35, roughness: .12, metalness: .08, clearcoat: 1 }));
  shell.scale.set(.72, 1.18, .72); shell.castShadow = true; group.add(shell);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8), new THREE.MeshBasicMaterial({ color: island.color, transparent: true, opacity: .14, depthWrite: false }));
  group.add(glow);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.35, .045, 6, 32), new THREE.MeshBasicMaterial({ color: '#eaffff', transparent: true, opacity: .9 }));
  halo.rotation.x = Math.PI / 2; group.add(halo);
  group.userData = { island, id, baseY: y, got: false, phase: id * 1.7 };
  scene.add(group); seeds.push(group);
}

function buildIslands() {
  const colors = ['#fff0aa', '#d2f3ff', '#ffd6da', '#ded4ff', '#c4fff1'];
  islandSpecs.forEach((island, index) => {
    island.seed = index * 3.17 + 1.4;
    createTerrain(island);
    const random = seededRandom(800 + index * 91);
    const trees = 8 + index * 2;
    for (let i = 0; i < trees; i++) {
      const a = random() * Math.PI * 2;
      const r = island.radius * (.16 + random() * .52);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      addTree(island.group, x, terrainHeight(island, island.x + x, island.z + z) + .25, z, 4.2 + random() * 4.6, index * 100 + i);
    }
    for (let i = 0; i < 22; i++) {
      const a = random() * Math.PI * 2;
      const r = island.radius * (.12 + random() * .7);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      addFlower(island.group, x, terrainHeight(island, island.x + x, island.z + z) + .2, z, colors[(i + index) % colors.length], .55 + random() * .55);
    }
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + index;
      const x = Math.cos(a) * island.radius * .32, z = Math.sin(a) * island.radius * .32;
      addMesh(island.group, new THREE.SphereGeometry(1, 8, 6), makeMat('#e8f3d9'), [x, terrainHeight(island, island.x + x, island.z + z) + .45, z], [1.3, .7, .8]);
    }
  });
  const seedSpots = [[8, -8], [-12, 10], [0, -7], [10, 4], [-8, -8], [5, 12], [-9, 5], [12, -9]];
  seedSpots.forEach(([x, z], i) => makeSeed(islandSpecs[i % islandSpecs.length], x, z, i));
}

function buildClouds() {
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: .82 });
  const random = seededRandom(514);
  for (let i = 0; i < 32; i++) {
    const group = new THREE.Group();
    const x = (random() - .5) * 650, z = (random() - .5) * 650;
    group.position.set(x, 58 + random() * 54, z);
    const puffs = 4 + Math.floor(random() * 4);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
      puff.position.set((j - puffs / 2) * 4.4, random() * 1.3, (random() - .5) * 2.3);
      puff.scale.set(3.4 + random() * 2.6, 1.6 + random() * 1.6, 2.3 + random() * 2.2);
      group.add(puff);
    }
    group.userData = { drift: 1.5 + random() * 2, originX: x };
    scene.add(group); clouds.push(group);
  }
}

function buildAvatar() {
  avatar = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#5dd6d0', roughness: .22, metalness: .05, clearcoat: 1, clearcoatRoughness: .14 });
  const bellyMat = makeMat('#c4fff0', .32);
  const darkMat = makeMat('#0c5068', .2);
  const body = addMesh(avatar, new THREE.SphereGeometry(1, 24, 16), bodyMat, [0, 1.65, 0], [1.18, 1.12, 1.45]);
  const belly = addMesh(avatar, new THREE.SphereGeometry(1, 18, 12), bellyMat, [0, 1.26, .12], [.82, .57, 1.15]);
  const eyeWhite = makeMat('#ffffff', .22);
  for (const side of [-1, 1]) {
    addMesh(avatar, new THREE.SphereGeometry(.22, 12, 10), eyeWhite, [side * .52, 1.94, 1.12], [.82, 1.1, .6]);
    addMesh(avatar, new THREE.SphereGeometry(.105, 12, 10), darkMat, [side * .54, 1.93, 1.26], [.75, 1, .55]);
    addMesh(avatar, new THREE.SphereGeometry(.045, 8, 6), makeMat('#ffffff'), [side * .57, 2.01, 1.31]);
  }
  const tail = addMesh(avatar, new THREE.ConeGeometry(.56, 1.2, 10), makeMat('#35b9c9'), [0, 1.54, -1.55]);
  tail.rotation.x = -Math.PI / 2;
  const fin1 = addMesh(avatar, new THREE.ConeGeometry(.48, .85, 9), makeMat('#68dfcf'), [-.72, 1.23, -.15]); fin1.rotation.z = Math.PI / 2.3;
  const fin2 = addMesh(avatar, new THREE.ConeGeometry(.48, .85, 9), makeMat('#68dfcf'), [.72, 1.23, -.15]); fin2.rotation.z = -Math.PI / 2.3;
  avatarParts = [tail, body, belly, fin1, fin2];
  player.add(avatar);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), new THREE.MeshBasicMaterial({ color: '#236e70', transparent: true, opacity: .18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .07; player.add(shadow);
}

function initWorld() {
  buildWater();
  buildIslands();
  buildClouds();
  buildAvatar();
  player.position.set(0, terrainHeight(islandSpecs[0], 0, 0) - 0.3, 0);
  camera.position.set(0, 10, 18);
  updateCamera(1);
}

function updateCamera(dt) {
  const look = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const distance = window.innerWidth < 700 ? 12 : 15;
  const horizontal = new THREE.Vector3(look.x, 0, look.z).multiplyScalar(-distance * Math.cos(pitch));
  cameraTarget.set(player.position.x, player.position.y + 3.2, player.position.z);
  cameraPosition.set(player.position.x + horizontal.x, player.position.y + 6 + Math.sin(pitch) * distance, player.position.z + horizontal.z);
  camera.position.lerp(cameraPosition, 1 - Math.exp(-dt * 4));
  camera.lookAt(cameraTarget);
}
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  toastTimer = 2.4;
}
function updateHud() {
  scoreNode.textContent = score;
  progress.style.width = `${score / TOTAL_SEEDS * 100}%`;
  const found = islandSpecs.filter(island => island.found).length;
  discoveriesNode.textContent = found;
  const nearest = islandSpecs.reduce((bestIsland, island) => {
    const d = Math.hypot(player.position.x - island.x, player.position.z - island.z);
    return d < bestIsland.distance ? { island, distance: d } : bestIsland;
  }, { island: islandSpecs[0], distance: Infinity });
  locationChip.querySelector('b').textContent = nearest.distance < nearest.island.radius + 22 ? nearest.island.name : 'Open blue';
  drawMap();
}
function drawMap() {
  const ctx = mapCtx, size = mapCanvas.width;
  ctx.clearRect(0, 0, size, size);
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#9debed'); bg.addColorStop(1, '#4bb9d0');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(size / 2, size / 2, size * .48, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(size / 2, size / 2, size * .48, 0, Math.PI * 2); ctx.clip();
  for (const island of islandSpecs) {
    const x = size / 2 + island.x * .39, y = size / 2 + island.z * .39;
    ctx.fillStyle = island.found ? '#a4e7a4' : '#f2e7ad';
    ctx.strokeStyle = '#ffffffc9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, island.radius * .39, island.radius * .33, -.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (island.found) { ctx.fillStyle = '#3caa91'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
  }
  const px = size / 2 + player.position.x * .39, py = size / 2 + player.position.z * .39;
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1698a5'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, 4.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function playTone(type = 'seed') {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    const notes = { start: [420, 660], seed: [640, 1040], island: [460, 820], hop: [350, 520] };
    const pair = notes[type] || notes.seed;
    osc.type = 'sine'; osc.frequency.setValueAtTime(pair[0], now); osc.frequency.exponentialRampToValueAtTime(pair[1], now + .18);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(type === 'seed' ? .06 : .035, now + .025); gain.gain.exponentialRampToValueAtTime(.0001, now + .3);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + .31);
  } catch (_) { /* audio is an optional flourish */ }
}
function begin() {
  state = 'playing'; score = 0; elapsed = 0; yaw = 0; pitch = .62;
  player.position.set(0, terrainHeight(islandSpecs[0], 0, 0) - .3, 0);
  moveVelocity.set(0, 0, 0);
  for (const island of islandSpecs) island.found = false;
  for (const seed of seeds) { seed.visible = true; seed.userData.got = false; }
  updateHud(); overlay.classList.add('hidden'); last = performance.now();
  playTone('start');
}
function finish() {
  state = 'won';
  if (score > best) { best = score; localStorage.setItem('aero-isles-best', best); }
  $('#overlayTitle').innerHTML = 'Isles <em>illuminated!</em>';
  $('#overlayText').innerHTML = 'Every light seed is home.<br>The whole wide blue is glowing.';
  instructions.style.display = 'none'; bestNote.textContent = `YOUR BEST: ${best} LIGHT SEEDS`;
  startButton.innerHTML = 'Wander again <span>↗</span>';
  overlay.classList.remove('hidden');
  playTone('island');
}
function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    $('#overlayTitle').innerHTML = 'Take a <em>breather</em>';
    $('#overlayText').innerHTML = 'The wide blue will wait right here.<br>Ready when you are.';
    instructions.style.display = 'none'; bestNote.style.display = 'none';
    startButton.innerHTML = 'Keep exploring <span>↗</span>';
    overlay.classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'playing'; overlay.classList.add('hidden'); last = performance.now();
  }
}
function inputVector() {
  const x = (keysDown.has('d') || keysDown.has('arrowright') || touch.has('right') ? 1 : 0) - (keysDown.has('a') || keysDown.has('arrowleft') || touch.has('left') ? 1 : 0);
  const z = (keysDown.has('w') || keysDown.has('arrowup') || touch.has('up') ? 1 : 0) - (keysDown.has('s') || keysDown.has('arrowdown') || touch.has('down') ? 1 : 0);
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}
function update(dt) {
  elapsed += dt;
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toast.classList.remove('show');
  if (hopTimer > 0) hopTimer = Math.max(0, hopTimer - dt);
  const input = inputVector();
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const desired = forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x));
  const speed = keysDown.has('shift') ? 22 : 14;
  desired.multiplyScalar(speed);
  moveVelocity.x = lerp(moveVelocity.x, desired.x, 1 - Math.exp(-dt * 5));
  moveVelocity.z = lerp(moveVelocity.z, desired.z, 1 - Math.exp(-dt * 5));
  player.position.x += moveVelocity.x * dt;
  player.position.z += moveVelocity.z * dt;
  const nearest = islandSpecs.reduce((bestIsland, island) => {
    const d = Math.hypot(player.position.x - island.x, player.position.z - island.z);
    return d < bestIsland.distance ? { island, distance: d } : bestIsland;
  }, { island: islandSpecs[0], distance: Infinity });
  const targetY = nearest.distance < nearest.island.radius * 1.08
    ? terrainHeight(nearest.island, player.position.x, player.position.z) - .3
    : .1 + Math.sin(elapsed * 1.8) * .2;
  player.position.y = lerp(player.position.y, targetY, 1 - Math.exp(-dt * 4));
  if (desired.lengthSq() > .1) {
    const angle = Math.atan2(desired.x, desired.z);
    player.rotation.y = lerp(player.rotation.y, angle, 1 - Math.exp(-dt * 8));
    const swim = Math.sin(elapsed * 10) * .08;
    avatar.position.y = swim + (hopTimer > 0 ? Math.sin((1 - hopTimer / .48) * Math.PI) * 1.8 : 0);
    avatarParts[0].rotation.z = Math.sin(elapsed * 9) * .35;
    avatarParts[3].rotation.x = Math.sin(elapsed * 8) * .12;
    avatarParts[4].rotation.x = -Math.sin(elapsed * 8) * .12;
  } else {
    avatar.position.y = Math.sin(elapsed * 2.4) * .1 + (hopTimer > 0 ? Math.sin((1 - hopTimer / .48) * Math.PI) * 1.8 : 0);
    avatarParts[0].rotation.z = Math.sin(elapsed * 2.2) * .12;
  }
  for (const island of islandSpecs) {
    const d = Math.hypot(player.position.x - island.x, player.position.z - island.z);
    if (d < island.radius * .72 && !island.found) {
      island.found = true;
      showToast(`${island.name} discovered! ✦`);
      playTone('island');
    }
  }
  for (const seed of seeds) {
    const data = seed.userData;
    if (data.got) continue;
    seed.rotation.y += dt * 1.4;
    seed.position.y = data.baseY + Math.sin(elapsed * 2.6 + data.phase) * .48;
    seed.children[1].scale.setScalar(1 + Math.sin(elapsed * 3 + data.phase) * .08);
    const distance = Math.hypot(player.position.x - seed.position.x, player.position.z - seed.position.z);
    if (distance < 3.2 && Math.abs(player.position.y - seed.position.y) < 6) {
      data.got = true; seed.visible = false; score++;
      playTone('seed'); showToast(['A little more light!', 'Beautiful find!', 'The isles say thanks!'][score % 3]);
      if (score >= TOTAL_SEEDS) finish();
    }
  }
  for (const cloud of clouds) {
    cloud.position.x += Math.sin(elapsed * .08 + cloud.userData.originX) * cloud.userData.drift * dt * .03;
  }
  updateCamera(dt);
  updateHud();
}

function resize() {
  const rect = world.getBoundingClientRect();
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = width < 600 ? 64 : 58;
  camera.updateProjectionMatrix();
}
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000 || 0);
  last = now;
  if (state === 'playing') update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

startButton.addEventListener('click', () => {
  if (state === 'paused') { togglePause(); return; }
  instructions.style.display = 'flex'; bestNote.style.display = 'block';
  $('#overlayTitle').innerHTML = 'Aero <em>Isles</em>';
  $('#overlayText').innerHTML = 'A whole bright world, just beyond the blue.<br>Wander, swim, and find the light seeds.';
  begin();
});
pauseButton.addEventListener('click', togglePause);
soundButton.addEventListener('click', () => {
  soundOn = !soundOn;
  soundButton.innerHTML = `${soundOn ? '♫' : '♩'} <span>Sound ${soundOn ? 'on' : 'off'}</span>`;
  if (soundOn) playTone('start');
});
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  keysDown.add(key);
  if (!event.repeat && key === 'escape' || !event.repeat && key === 'p') togglePause();
  if (!event.repeat && key === ' ' && state === 'playing') { hopTimer = .48; playTone('hop'); }
  if (!event.repeat && key === 'enter' && state !== 'playing') startButton.click();
});
window.addEventListener('keyup', event => keysDown.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => {
  keysDown.clear(); touch.clear();
  if (state === 'playing') togglePause();
});
renderer.domElement.addEventListener('pointerdown', event => {
  if (state !== 'playing' || event.pointerType === 'touch') return;
  lookPointer = event.pointerId; lastPointer = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (lookPointer !== event.pointerId) return;
  yaw -= (event.clientX - lastPointer.x) * .006;
  pitch = clamp(pitch + (event.clientY - lastPointer.y) * .0035, -.18, .72);
  lastPointer = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', () => { lookPointer = null; });
const lookPad = $('#lookPad');
lookPad.addEventListener('pointerdown', event => {
  event.preventDefault(); lookPointer = event.pointerId; lastPointer = { x: event.clientX, y: event.clientY };
  lookPad.setPointerCapture(event.pointerId); lookPad.classList.add('pressed');
});
lookPad.addEventListener('pointermove', event => {
  if (lookPointer !== event.pointerId) return;
  yaw -= (event.clientX - lastPointer.x) * .009;
  pitch = clamp(pitch + (event.clientY - lastPointer.y) * .005, -.18, .72);
  lastPointer = { x: event.clientX, y: event.clientY };
});
lookPad.addEventListener('pointerup', () => { lookPointer = null; lookPad.classList.remove('pressed'); });
lookPad.addEventListener('pointercancel', () => { lookPointer = null; lookPad.classList.remove('pressed'); });
document.querySelectorAll('.dpad').forEach(button => {
  const direction = button.dataset.dir;
  const down = event => { event.preventDefault(); touch.add(direction); button.classList.add('pressed'); button.setPointerCapture(event.pointerId); };
  const up = event => { event.preventDefault(); touch.delete(direction); button.classList.remove('pressed'); };
  button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up);
});
window.addEventListener('resize', resize);
initWorld();
resize();
drawMap();
requestAnimationFrame(frame);
