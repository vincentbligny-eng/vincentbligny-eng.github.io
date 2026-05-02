<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { BOARD_SIZE, PREMIUM_GRID, LETTER_VALUE } from '../engine/constants';
  import type { Board, Direction, Placement } from '../engine/types';

  export let board: Board;
  export let pending: Placement[] = [];
  export let ghost: Placement[] = [];
  export let cursor: { row: number; col: number; dir: Direction } | null = null;

  const dispatch = createEventDispatcher<{ cellClick: { r: number; c: number } }>();

  // ─── Scene state ────────────────────────────────────────────────────────
  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let raycaster: THREE.Raycaster;
  let mouseNDC: THREE.Vector2;
  let cellMeshes: THREE.Mesh[] = [];
  let premiumMeshes: Array<{ mesh: THREE.Mesh; baseEmissive: number; phase: number }> = [];
  let tileGroup: THREE.Group;
  let tileMap = new Map<string, THREE.Mesh>();
  let cursorMesh: THREE.Group;
  let starMesh: THREE.Mesh;
  let dustPoints: THREE.Points | null = null;
  let rimLight: THREE.DirectionalLight;
  let keyLight: THREE.DirectionalLight;
  let animationId = 0;
  let resizeObserver: ResizeObserver;
  let textureCache = new Map<string, THREE.CanvasTexture>();
  let pointerStart: { x: number; y: number; t: number } | null = null;
  let pointerDown = false;
  let lastTap: { x: number; y: number; t: number } | null = null;
  let isFlying = false;
  let hoveredKey: string | null = null;
  let lastInteractAt = performance.now();
  let shakeStrength = 0;
  let shakeStart = 0;
  let bingoPlan: { key: string; startAt: number }[] = [];

  const DEFAULT_CAMERA = new THREE.Vector3(0, 13, 17);
  const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

  // Degrade on phones / weak GPUs: fewer particles, smaller shadow map, lower pixel ratio.
  const lowEnd = typeof window !== 'undefined' && (
    window.matchMedia('(max-width: 768px)').matches
    || (navigator.hardwareConcurrency ?? 4) < 4
  );
  const DUST_COUNT = lowEnd ? 80 : 240;
  const SHADOW_MAP_SIZE = lowEnd ? 1024 : 2048;

  // ─── Init ──────────────────────────────────────────────────────────────
  onMount(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.Fog(0x05070c, 24, 60);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.copy(DEFAULT_CAMERA);

    renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.copy(DEFAULT_TARGET);
    controls.addEventListener('start', markInteract);

    addLights();
    buildTable();
    buildBoard();
    buildCursor();
    buildDust();
    tileGroup = new THREE.Group();
    scene.add(tileGroup);
    syncTiles();
    updateCursor();

    raycaster = new THREE.Raycaster();
    mouseNDC = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);
    onResize();

    animate();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    resizeObserver?.disconnect();
    if (renderer?.domElement) {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
    }
    controls?.dispose();
    for (const tex of textureCache.values()) tex.dispose();
    textureCache.clear();
    scene?.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
      else if (mesh.material) (mesh.material as THREE.Material).dispose();
    });
    renderer?.dispose();
  });

  function onResize() {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function markInteract() { lastInteractAt = performance.now(); }

  // ─── Scene construction ────────────────────────────────────────────────
  function addLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));

    keyLight = new THREE.DirectionalLight(0xfff0d4, 1.2);
    keyLight.position.set(-12, 22, 10);
    keyLight.castShadow = !lowEnd;
    keyLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 60;
    keyLight.shadow.camera.left = -14;
    keyLight.shadow.camera.right = 14;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    rimLight = new THREE.DirectionalLight(0xa3e635, 0.35);
    rimLight.position.set(10, 6, -15);
    scene.add(rimLight);

    const fill = new THREE.PointLight(0xfb923c, 0.5, 40);
    fill.position.set(8, 6, 10);
    scene.add(fill);

    // Roving accent light — drifts slowly to animate reflections
    const rove = new THREE.PointLight(0x38bdf8, 0.45, 30);
    rove.position.set(0, 8, 0);
    rove.userData.isRove = true;
    scene.add(rove);
  }

  function buildTable() {
    const tableGeom = new THREE.BoxGeometry(40, 0.3, 40);
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x0f1a12, roughness: 0.95, metalness: 0 });
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.position.y = -0.6;
    table.receiveShadow = true;
    scene.add(table);

    const trayGeom = new THREE.BoxGeometry(16.4, 0.5, 16.4);
    const trayMat = new THREE.MeshStandardMaterial({
      map: createWoodTexture(), color: 0x4a3423, roughness: 0.8, metalness: 0,
    });
    const tray = new THREE.Mesh(trayGeom, trayMat);
    tray.position.y = -0.25;
    tray.receiveShadow = true;
    tray.castShadow = true;
    scene.add(tray);

    const surfaceGeom = new THREE.BoxGeometry(15.6, 0.08, 15.6);
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x0a1b12, roughness: 0.8, metalness: 0,
    });
    const surface = new THREE.Mesh(surfaceGeom, surfaceMat);
    surface.position.y = 0.04;
    surface.receiveShadow = true;
    scene.add(surface);
  }

  function buildBoard() {
    const CENTER = Math.floor(BOARD_SIZE / 2);
    const cellSize = 0.96;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const prem = PREMIUM_GRID[r][c];
        const isCenter = r === CENTER && c === CENTER;
        const color = isCenter ? 0xfbbf24
          : prem === 'TW' ? 0xfb4a4a
          : prem === 'DW' ? 0xf472b6
          : prem === 'TL' ? 0x3b82f6
          : prem === 'DL' ? 0x93c5fd
          : 0x162230;
        const geom = new THREE.PlaneGeometry(cellSize, cellSize);
        const baseEmissive = prem || isCenter ? 0.18 : 0.04;
        const mat = new THREE.MeshStandardMaterial({
          color, roughness: 0.65, metalness: 0,
          emissive: color, emissiveIntensity: baseEmissive,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(c - 7, 0.09, r - 7);
        mesh.userData = { r, c };
        mesh.receiveShadow = true;
        scene.add(mesh);
        cellMeshes.push(mesh);
        if (prem || isCenter) {
          premiumMeshes.push({
            mesh, baseEmissive,
            phase: (r * 13 + c * 7) % 1000 / 1000 * Math.PI * 2,
          });
        }
      }
    }

    const starShape = new THREE.Shape();
    const pts = 5;
    for (let i = 0; i < pts * 2; i++) {
      const rr = i % 2 === 0 ? 0.28 : 0.12;
      const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) starShape.moveTo(x, y); else starShape.lineTo(x, y);
    }
    starShape.closePath();
    const starGeom = new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffd966, metalness: 0.55, roughness: 0.25,
      emissive: 0xffaa33, emissiveIntensity: 0.4,
    });
    starMesh = new THREE.Mesh(starGeom, starMat);
    starMesh.rotation.x = -Math.PI / 2;
    starMesh.position.set(0, 0.16, 0);
    scene.add(starMesh);
  }

  function buildCursor() {
    cursorMesh = new THREE.Group();
    const ringGeom = new THREE.RingGeometry(0.45, 0.5, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa3e635, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    cursorMesh.add(ring);

    const glowGeom = new THREE.PlaneGeometry(1, 1);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xa3e635, transparent: true, opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.01;
    cursorMesh.add(glow);

    cursorMesh.position.y = 0.11;
    cursorMesh.visible = false;
    scene.add(cursorMesh);
  }

  function buildDust() {
    const count = DUST_COUNT;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 28;
      positions[i * 3 + 1] = 0.5 + Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 28;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const cx = canvas.getContext('2d')!;
    const grad = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,200,0.9)');
    grad.addColorStop(0.4, 'rgba(255,220,150,0.35)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: 0.08, map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.8,
    });
    dustPoints = new THREE.Points(geom, mat);
    scene.add(dustPoints);
  }

  // ─── Textures ──────────────────────────────────────────────────────────
  function createWoodTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#3a2414');
    grad.addColorStop(0.5, '#2a1608');
    grad.addColorStop(1, '#412a18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 240; i++) {
      ctx.globalAlpha = 0.05 + Math.random() * 0.08;
      ctx.strokeStyle = Math.random() < 0.3 ? '#6b4820' : '#1a0d06';
      ctx.lineWidth = 0.3 + Math.random() * 1.4;
      ctx.beginPath();
      const y = Math.random() * size;
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 3);
      }
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createTileTexture(letter: string, value: number, kind: string): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const pending = kind === 'pending';
    const ghostK  = kind === 'ghost';
    const baseColor = pending ? '#fed7aa' : ghostK ? '#fed7aa' : '#f9ebc5';
    const deepColor = pending ? '#d97706' : ghostK ? '#ea580c' : '#c79a56';

    const g = ctx.createRadialGradient(size * 0.35, size * 0.35, size * 0.1, size / 2, size / 2, size / 1.1);
    g.addColorStop(0, baseColor);
    g.addColorStop(0.7, baseColor);
    g.addColorStop(1, deepColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 160; i++) {
      ctx.globalAlpha = 0.03 + Math.random() * 0.08;
      ctx.strokeStyle = pending ? '#7c2d12' : '#6b4820';
      ctx.lineWidth = 0.3 + Math.random() * 1.2;
      ctx.beginPath();
      const y = Math.random() * size;
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 12) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 2.5);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      img.data[i]     = Math.max(0, Math.min(255, img.data[i] + n));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = size * 0.018;
    ctx.beginPath();
    ctx.moveTo(size * 0.05, size * 0.95);
    ctx.lineTo(size * 0.05, size * 0.05);
    ctx.lineTo(size * 0.95, size * 0.05);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = size * 0.022;
    ctx.beginPath();
    ctx.moveTo(size * 0.05, size * 0.95);
    ctx.lineTo(size * 0.95, size * 0.95);
    ctx.lineTo(size * 0.95, size * 0.05);
    ctx.stroke();

    const glyph = letter === '?' ? '·' : letter;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.floor(size * 0.58)}px "Space Grotesk", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(glyph, size / 2 + 2, size / 2 + 4);
    ctx.fillStyle = pending ? '#3f1e00' : '#1e1106';
    ctx.fillText(glyph, size / 2, size / 2);

    if (value > 0) {
      ctx.font = `bold ${Math.floor(size * 0.15)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(30,17,6,0.7)';
      ctx.fillText(String(value), size * 0.92, size * 0.93);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }

  function getTileTexture(letter: string, value: number, kind: string): THREE.CanvasTexture {
    const key = `${letter}-${value}-${kind}`;
    let t = textureCache.get(key);
    if (!t) {
      t = createTileTexture(letter, value, kind);
      textureCache.set(key, t);
    }
    return t;
  }

  // ─── Tile mesh lifecycle ───────────────────────────────────────────────
  function makeTile(letter: string, blank: boolean, r: number, c: number, kind: string): THREE.Mesh {
    const geom = new THREE.BoxGeometry(0.88, 0.22, 0.88);
    const value = blank ? 0 : (LETTER_VALUE[letter] ?? 0);
    const top = new THREE.MeshStandardMaterial({
      map: getTileTexture(letter, value, kind),
      roughness: 0.55,
      metalness: 0,
      transparent: kind === 'ghost',
      opacity: kind === 'ghost' ? 0.55 : 1,
    });
    const sideColor = kind === 'pending' ? 0xb5541a : kind === 'ghost' ? 0xb5541a : 0x8a6837;
    const side = new THREE.MeshStandardMaterial({
      color: sideColor, roughness: 0.7, metalness: 0,
      transparent: kind === 'ghost', opacity: kind === 'ghost' ? 0.55 : 1,
    });
    const bottom = new THREE.MeshStandardMaterial({ color: 0x5a3d1a, roughness: 0.85 });
    const mats: THREE.Material[] = [side, side, top, bottom, side, side];
    const mesh = new THREE.Mesh(geom, mats);
    mesh.position.set(c - 7, 0.22, r - 7);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      r, c, kind, letter, blank,
      spawnAt: performance.now(),
      spawnSpin: (Math.random() - 0.5) * Math.PI * 1.2,
      spawnTilt: (Math.random() - 0.5) * 0.4,
    };
    return mesh;
  }

  function disposeMesh(mesh: THREE.Mesh) {
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) (m as THREE.Material).dispose();
  }

  function replaceTopTexture(mesh: THREE.Mesh, letter: string, blank: boolean, kind: string) {
    const mats = mesh.material as THREE.Material[];
    const top = mats[2] as THREE.MeshStandardMaterial;
    const value = blank ? 0 : (LETTER_VALUE[letter] ?? 0);
    // Keep cached textures reusable — don't dispose the cached one.
    top.map = getTileTexture(letter, value, kind);
    top.needsUpdate = true;
    // Update side color on pending→fixed transitions.
    const sideColor = kind === 'pending' ? 0xb5541a : kind === 'ghost' ? 0xb5541a : 0x8a6837;
    (mats[0] as THREE.MeshStandardMaterial).color.setHex(sideColor);
    (mats[1] as THREE.MeshStandardMaterial).color.setHex(sideColor);
    (mats[4] as THREE.MeshStandardMaterial).color.setHex(sideColor);
    (mats[5] as THREE.MeshStandardMaterial).color.setHex(sideColor);
  }

  function syncTiles() {
    if (!tileGroup) return;
    type Spec = { letter: string; blank: boolean; kind: string };
    const desired = new Map<string, Spec>();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = board[r][c];
        if (cell.letter) desired.set(`${r},${c}`, { letter: cell.letter, blank: cell.blank, kind: 'fixed' });
      }
    }
    for (const p of pending) desired.set(`${p.row},${p.col}`, { letter: p.letter, blank: p.blank, kind: 'pending' });
    for (const g of ghost)   desired.set(`${g.row},${g.col}`, { letter: g.letter, blank: g.blank, kind: 'ghost' });

    // Remove tiles no longer present.
    for (const [key, mesh] of tileMap) {
      if (!desired.has(key)) {
        tileGroup.remove(mesh);
        disposeMesh(mesh);
        tileMap.delete(key);
      }
    }
    // Add or reshape.
    for (const [key, spec] of desired) {
      const existing = tileMap.get(key);
      if (!existing) {
        const [r, c] = key.split(',').map(Number);
        const mesh = makeTile(spec.letter, spec.blank, r, c, spec.kind);
        tileMap.set(key, mesh);
        tileGroup.add(mesh);
      } else if (
        existing.userData.letter !== spec.letter ||
        existing.userData.blank  !== spec.blank  ||
        existing.userData.kind   !== spec.kind
      ) {
        replaceTopTexture(existing, spec.letter, spec.blank, spec.kind);
        existing.userData.letter = spec.letter;
        existing.userData.blank = spec.blank;
        // Kind transition animation marker.
        if (existing.userData.kind !== spec.kind) {
          existing.userData.sealAt = performance.now();
        }
        existing.userData.kind = spec.kind;
      }
    }
  }

  function updateCursor() {
    if (!cursorMesh) return;
    if (!cursor) { cursorMesh.visible = false; return; }
    cursorMesh.visible = true;
    cursorMesh.position.x = cursor.col - 7;
    cursorMesh.position.z = cursor.row - 7;
  }

  // React to prop changes.
  $: if (tileGroup && board) syncTiles();
  $: if (tileGroup && pending) syncTiles();
  $: if (tileGroup && ghost) syncTiles();
  $: if (cursorMesh) updateCursor();

  // ─── Interaction ───────────────────────────────────────────────────────
  function onPointerDown(e: PointerEvent) {
    pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    pointerDown = true;
    markInteract();
  }
  function onPointerUp(e: PointerEvent) {
    pointerDown = false;
    if (!pointerStart) return;
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    const dt = performance.now() - pointerStart.t;
    pointerStart = null;
    if (Math.hypot(dx, dy) > 6 || dt > 400) return;

    // Double-tap / double-click → reset camera (touch-friendly shortcut).
    const now = performance.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) {
      resetCamera();
      lastTap = null;
      return;
    }
    lastTap = { x: e.clientX, y: e.clientY, t: now };

    const rect = renderer.domElement.getBoundingClientRect();
    mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObjects(cellMeshes);
    if (hits.length > 0) {
      const { r, c } = hits[0].object.userData as { r: number; c: number };
      dispatch('cellClick', { r, c });
    }
  }

  let pointerMoveTick = 0;
  function onPointerMove(e: PointerEvent) {
    if (pointerDown) { markInteract(); return; }
    // Throttle raycast hover to every ~third frame.
    pointerMoveTick = (pointerMoveTick + 1) % 3;
    if (pointerMoveTick !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObjects([...tileMap.values()]);
    hoveredKey = hits[0] ? (() => {
      const hit = hits[0].object as THREE.Mesh;
      const { r, c } = hit.userData as { r: number; c: number };
      return `${r},${c}`;
    })() : null;
  }
  function onPointerLeave() { hoveredKey = null; pointerDown = false; }

  // ─── Public methods ────────────────────────────────────────────────────
  export function flyOver(preset: 'default' | 'topdown' | 'sideslide' | 'vertigo' | 'closeup' = 'default'): Promise<void> {
    if (isFlying || !camera || !controls) return Promise.resolve();
    isFlying = true;
    controls.enabled = false;
    markInteract();

    const currentPos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    const currentTgt: [number, number, number] = [controls.target.x, controls.target.y, controls.target.z];

    const presets: Record<string, Array<{ pos: [number, number, number]; look: [number, number, number]; t: number }>> = {
      default: [
        { pos: currentPos, look: currentTgt, t: 0 },
        { pos: [0, 25, 0],    look: [0, 0, 0],  t: 900 },
        { pos: [-9, 1.5, 7],  look: [3, 0, 3],  t: 2300 },
        { pos: [9, 1.2, 2],   look: [-3, 0, -1], t: 3900 },
        { pos: [0, 2.5, -9],  look: [0, 0, 2],  t: 5200 },
        { pos: [DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z], look: [0, 0, 0], t: 6900 },
      ],
      topdown: [
        { pos: currentPos, look: currentTgt, t: 0 },
        { pos: [0, 26, 0.01], look: [0, 0, 0], t: 1600 },
        { pos: [0, 26, 0.01], look: [0, 0, 0], t: 3800 },
        { pos: [DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z], look: [0, 0, 0], t: 5400 },
      ],
      sideslide: [
        { pos: currentPos, look: currentTgt, t: 0 },
        { pos: [-16, 2.5, 0], look: [0, 0.3, 0], t: 1300 },
        { pos: [16, 2.5, 0],  look: [0, 0.3, 0], t: 4200 },
        { pos: [DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z], look: [0, 0, 0], t: 5800 },
      ],
      vertigo: [
        { pos: currentPos, look: currentTgt, t: 0 },
        { pos: [0, 3, 9],   look: [0, 0.5, 0], t: 1000 },
        { pos: [0, 3, 28],  look: [0, 0.5, 0], t: 3200 },
        { pos: [DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z], look: [0, 0, 0], t: 4800 },
      ],
      closeup: [
        { pos: currentPos, look: currentTgt, t: 0 },
        { pos: [0.5, 0.7, 2], look: [0, 0.25, 0], t: 1400 },
        { pos: [-2.2, 0.9, 1.2], look: [-0.5, 0.25, 0.2], t: 3000 },
        { pos: [2.2, 0.9, -0.8], look: [0.5, 0.25, -0.2], t: 4600 },
        { pos: [DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z], look: [0, 0, 0], t: 6200 },
      ],
    };

    const frames = presets[preset];
    const start = performance.now();
    const total = frames[frames.length - 1].t;

    return new Promise(resolve => {
      function step() {
        const elapsed = performance.now() - start;
        if (elapsed >= total) {
          const k = frames[frames.length - 1];
          camera.position.set(...k.pos);
          controls.target.set(...k.look);
          controls.enabled = true;
          isFlying = false;
          resolve();
          return;
        }
        let i = 0;
        while (i < frames.length - 1 && frames[i + 1].t < elapsed) i++;
        const a = frames[i], b = frames[i + 1];
        const u = (elapsed - a.t) / (b.t - a.t);
        const eased = u * u * (3 - 2 * u);
        camera.position.set(
          a.pos[0] + (b.pos[0] - a.pos[0]) * eased,
          a.pos[1] + (b.pos[1] - a.pos[1]) * eased,
          a.pos[2] + (b.pos[2] - a.pos[2]) * eased,
        );
        controls.target.set(
          a.look[0] + (b.look[0] - a.look[0]) * eased,
          a.look[1] + (b.look[1] - a.look[1]) * eased,
          a.look[2] + (b.look[2] - a.look[2]) * eased,
        );
        requestAnimationFrame(step);
      }
      step();
    });
  }

  export function resetCamera() {
    if (!camera || !controls) return;
    camera.position.copy(DEFAULT_CAMERA);
    controls.target.copy(DEFAULT_TARGET);
    markInteract();
  }

  export function shake(strength = 0.4, duration = 420) {
    shakeStrength = strength;
    shakeStart = performance.now();
    markInteract();
  }

  export function celebrateBingo(placements: Placement[]) {
    const now = performance.now();
    bingoPlan = placements.map((p, i) => ({ key: `${p.row},${p.col}`, startAt: now + i * 90 }));
    markInteract();
  }

  // ─── Main loop ─────────────────────────────────────────────────────────
  function animate() {
    animationId = requestAnimationFrame(animate);
    const t = performance.now();
    const dt = 0.016;

    // Spin + pulse the center star.
    if (starMesh) {
      starMesh.rotation.z = t / 1200;
      const s = 1 + Math.sin(t / 500) * 0.08;
      starMesh.scale.set(s, s, 1);
      const starMat = starMesh.material as THREE.MeshStandardMaterial;
      starMat.emissiveIntensity = 0.35 + Math.sin(t / 420) * 0.18;
    }

    // Premium square slow breathing.
    for (const p of premiumMeshes) {
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = p.baseEmissive + Math.sin(t / 900 + p.phase) * p.baseEmissive * 0.55;
    }

    // Cursor pulse.
    if (cursorMesh && cursorMesh.visible) {
      const s = 1 + Math.sin(t / 320) * 0.08;
      cursorMesh.scale.set(s, 1, s);
      cursorMesh.rotation.y = t / 4000;
    }

    // Dust drift.
    if (dustPoints) {
      const geom = dustPoints.geometry;
      const pos = geom.attributes.position as THREE.BufferAttribute;
      const seeds = geom.attributes.seed as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const seed = seeds.getX(i);
        const x = arr[i * 3];
        const y = arr[i * 3 + 1];
        const z = arr[i * 3 + 2];
        arr[i * 3]     = x + Math.sin(t / 1700 + seed) * 0.005;
        arr[i * 3 + 1] = y + 0.006 + Math.sin(t / 900 + seed) * 0.002;
        arr[i * 3 + 2] = z + Math.cos(t / 1500 + seed * 1.3) * 0.005;
        if (arr[i * 3 + 1] > 15) {
          arr[i * 3 + 1] = 0.3 + Math.random() * 2;
          arr[i * 3]     = (Math.random() - 0.5) * 28;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 28;
        }
      }
      pos.needsUpdate = true;
    }

    // Roving accent light.
    scene.children.forEach(obj => {
      if ((obj as any).userData?.isRove) {
        obj.position.x = Math.cos(t / 2300) * 9;
        obj.position.z = Math.sin(t / 2300) * 9;
        obj.position.y = 7 + Math.sin(t / 1700) * 1.5;
      }
    });

    // Tile animations.
    for (const mesh of tileMap.values()) {
      const u = mesh.userData as any;
      let targetY = 0.22;
      let targetRotX = 0, targetRotY = 0, targetRotZ = 0;
      let scale = 1;

      // Spawn: overshoot drop with tilt.
      if (u.spawnAt) {
        const dt = t - u.spawnAt;
        const D = 650;
        if (dt < D) {
          const p = dt / D;
          // Bouncy cubic-bezier-ish: overshoot and settle
          const lift = Math.max(0, (1 - p) * (1 - p) * 2.5);
          const bounce = p > 0.7 ? Math.sin((p - 0.7) / 0.3 * Math.PI) * 0.12 * (1 - p) : 0;
          targetY = 0.22 + lift + bounce;
          targetRotY = u.spawnSpin * (1 - p) * (1 - p);
          targetRotX = u.spawnTilt * (1 - p);
          scale = 1 + (1 - p) * 0.2;
        } else {
          delete u.spawnAt;
        }
      }

      // Seal: pending→fixed flash bump.
      if (u.sealAt) {
        const dt = t - u.sealAt;
        const D = 300;
        if (dt < D) {
          const p = dt / D;
          targetY += Math.sin(p * Math.PI) * 0.18;
          scale *= 1 + Math.sin(p * Math.PI) * 0.08;
        } else {
          delete u.sealAt;
        }
      }

      // Hover lift (on fixed/pending tiles, not during spawn/seal).
      const key = `${u.r},${u.c}`;
      if (hoveredKey === key && !u.spawnAt && !u.sealAt) {
        targetY += 0.18;
        targetRotX = 0.08;
      }

      mesh.position.y = targetY;
      mesh.rotation.set(targetRotX, targetRotY, targetRotZ);
      mesh.scale.set(scale, scale, scale);
    }

    // Bingo cascade: apply leaping hops on top of normal transforms.
    if (bingoPlan.length > 0) {
      let anyActive = false;
      for (const b of bingoPlan) {
        const dt = t - b.startAt;
        const D = 700;
        if (dt < 0) { anyActive = true; continue; }
        if (dt > D) continue;
        anyActive = true;
        const mesh = tileMap.get(b.key);
        if (!mesh) continue;
        const p = dt / D;
        const hop = Math.sin(p * Math.PI) * 1.6;
        const spin = p * Math.PI * 2;
        mesh.position.y = 0.22 + hop;
        mesh.rotation.y = spin;
        mesh.rotation.x = Math.sin(p * Math.PI) * 0.35;
        mesh.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.2);
      }
      if (!anyActive) bingoPlan = [];
    }

    // Camera shake.
    if (shakeStrength > 0) {
      const dt = t - shakeStart;
      const D = 420;
      if (dt < D) {
        const falloff = 1 - dt / D;
        const jx = (Math.random() - 0.5) * shakeStrength * falloff;
        const jy = (Math.random() - 0.5) * shakeStrength * falloff * 0.7;
        const jz = (Math.random() - 0.5) * shakeStrength * falloff;
        camera.position.x += jx;
        camera.position.y += jy;
        camera.position.z += jz;
      } else {
        shakeStrength = 0;
      }
    }

    // Idle auto-orbit after ~8 s of no interaction.
    if (!isFlying && !pointerDown && t - lastInteractAt > 8000) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
    } else {
      controls.autoRotate = false;
    }

    controls?.update();
    renderer?.render(scene, camera);
  }
</script>

<div class="panel p-3 sm:p-4">
  <div bind:this={container} class="three-stage rounded-xl overflow-hidden"></div>
</div>

<style>
  .three-stage {
    width: min(95vmin, 640px);
    height: min(95vmin, 640px);
    background:
      radial-gradient(ellipse at 50% 20%, rgba(163,230,53,0.08), transparent 60%),
      linear-gradient(180deg, #060910 0%, #020306 100%);
  }
  .three-stage :global(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    cursor: grab;
  }
  .three-stage :global(canvas:active) { cursor: grabbing; }
</style>
