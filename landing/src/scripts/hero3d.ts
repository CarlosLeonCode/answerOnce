/**
 * The hero's 3D laptop, built procedurally (no external models). In the first pose the screen plays
 * the muted product video; as the camera moves in it crossfades to a CanvasTexture painted by
 * ./screen. Scroll progress comes in through setState(); the render loop (and the video) only run
 * while start() is in effect and the tab is visible.
 */
import {
  NeutralToneMapping,
  CanvasTexture,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  VideoTexture,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { drawScreen, SCREEN_H, SCREEN_W, type ScreenState } from './screen';

export interface HeroState extends ScreenState {
  /** 0..1 — camera travel from the hero pose into the screen. */
  cam: number;
  /** 0..1 — camera pulls back so the whole laptop sits inside the frame. */
  back: number;
}

export interface HeroScene {
  setState(s: HeroState): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

interface Options {
  mobile: boolean;
  /** Muted product video shown on the screen in the first pose. */
  videoSrc?: string;
  /** Bottom of the hero copy, in px from the top of the canvas: the first pose fits below it. */
  frameTop?: () => number;
  onFirstFrame?: () => void;
}

// Laptop dimensions (world units).
const BASE_W = 3.2;
const BASE_D = 2.2;
const BASE_H = 0.085;
const LID_H = 2.12;
const LID_T = 0.05;
const SCR_W = 2.98;
const SCR_H = SCR_W / 1.6;
const LID_TILT = -0.21; // radians back from vertical
const FOV = 30;

/** Give the main thread back between heavy init steps (keeps each task short). */
const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

export async function createHeroScene(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, opts: Options): Promise<HeroScene> {
  const { mobile } = opts;
  const renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  await yieldToMain();
  const pmrem = new PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.9;

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  await yieldToMain();

  // ---------- Materials ----------
  const alu = new MeshStandardMaterial({ color: new Color('#c9ccd3'), metalness: 1, roughness: 0.3 });
  const aluDark = new MeshStandardMaterial({ color: new Color('#b3b6be'), metalness: 1, roughness: 0.4 });
  const deck = new MeshStandardMaterial({ color: new Color('#2a2c32'), metalness: 0.3, roughness: 0.7 });
  const keyMat = new MeshStandardMaterial({ color: new Color('#141519'), metalness: 0.1, roughness: 0.5 });
  const glass = new MeshStandardMaterial({ color: new Color('#050506'), metalness: 0, roughness: 0.14, envMapIntensity: 0.15 });
  const hingeMat = new MeshStandardMaterial({ color: new Color('#8e9199'), metalness: 0.9, roughness: 0.35 });

  // ---------- Screen texture ----------
  const texCanvas = document.createElement('canvas');
  const texScale = mobile ? 0.625 : 1;
  texCanvas.width = Math.round(SCREEN_W * texScale);
  texCanvas.height = Math.round(SCREEN_H * texScale);
  const tctx = texCanvas.getContext('2d')!;
  const screenTex = new CanvasTexture(texCanvas);
  screenTex.colorSpace = SRGBColorSpace;
  screenTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  screenTex.minFilter = LinearMipmapLinearFilter;
  const screenMat = new MeshBasicMaterial({ map: screenTex, toneMapped: false });

  // ---------- Geometry ----------
  const laptop = new Group();
  const float = new Group();
  float.add(laptop);
  scene.add(float);

  const base = new Mesh(new RoundedBoxGeometry(BASE_W, BASE_H, BASE_D, 4, 0.04), alu);
  base.position.y = BASE_H / 2;
  laptop.add(base);
  const top = BASE_H;

  // keyboard well + keys
  const kbW = 2.78;
  const unit = kbW / 14;
  const rows: { h: number; keys: number[] }[] = [
    { h: 0.6, keys: Array(14).fill(1) },
    { h: 1, keys: Array(14).fill(1) },
    { h: 1, keys: [1.5, ...Array(11).fill(1), 1.5] },
    { h: 1, keys: [1.75, ...Array(10).fill(1), 2.25] },
    { h: 1, keys: [2.25, ...Array(10).fill(1), 1.75] },
    { h: 1, keys: [1, 1, 1, 1.25, 5.5, 1.25, 1, 1, 1] },
  ];
  const kbDepth = rows.reduce((a, r) => a + r.h, 0) * unit;
  const kbZ0 = -BASE_D / 2 + 0.16;
  const well = new Mesh(new PlaneGeometry(kbW + 0.08, kbDepth + 0.08), deck);
  well.rotation.x = -Math.PI / 2;
  well.position.set(0, top + 0.0015, kbZ0 + kbDepth / 2);
  laptop.add(well);

  const keyCount = rows.reduce((a, r) => a + r.keys.length, 0);
  const keys = new InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.18), keyMat, keyCount);
  const m = new Matrix4();
  const dummy = new Object3D();
  let k = 0;
  let z = kbZ0;
  for (const r of rows) {
    let x = -kbW / 2;
    const d = r.h * unit;
    for (const w of r.keys) {
      const kw = w * unit;
      dummy.position.set(x + kw / 2, top + 0.011, z + d / 2);
      dummy.scale.set(kw - 0.026, 0.018, d - 0.026);
      dummy.updateMatrix();
      m.copy(dummy.matrix);
      keys.setMatrixAt(k++, m);
      x += kw;
    }
    z += d;
  }
  laptop.add(keys);

  const pad = new Mesh(new RoundedBoxGeometry(1.3, 0.004, 0.78, 2, 0.002), aluDark);
  pad.position.set(0, top + 0.001, z + 0.12 + 0.39);
  laptop.add(pad);

  // hinge
  const hinge = new Mesh(new CylinderGeometry(0.045, 0.045, 2.5, 24), hingeMat);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, top + 0.01, -BASE_D / 2 + 0.03);
  laptop.add(hinge);

  // lid (pivots at the hinge)
  const lid = new Group();
  lid.position.set(0, top + 0.012, -BASE_D / 2 + 0.03);
  lid.rotation.x = LID_TILT;
  laptop.add(lid);

  const shell = new Mesh(new RoundedBoxGeometry(BASE_W, LID_H, LID_T, 4, 0.024), alu);
  shell.position.set(0, LID_H / 2, -LID_T / 2);
  lid.add(shell);
  const bezel = new Mesh(new PlaneGeometry(BASE_W - 0.05, LID_H - 0.05), glass);
  bezel.position.set(0, LID_H / 2, 0.0015);
  lid.add(bezel);
  const screenY = LID_H / 2 + 0.035;
  const screen = new Mesh(new PlaneGeometry(SCR_W, SCR_H), screenMat);
  screen.position.set(0, screenY, 0.003);
  lid.add(screen);

  // Product video, in front of the painted screen; its opacity crossfades between the two.
  const videoMat = new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0 });
  const videoScreen = new Mesh(new PlaneGeometry(SCR_W, SCR_H), videoMat);
  videoScreen.position.set(0, screenY, 0.008);
  videoScreen.visible = false;
  lid.add(videoScreen);
  let video: HTMLVideoElement | null = null;
  let videoTex: VideoTexture | null = null;
  let videoReady = false;
  let videoBlocked = false;
  if (opts.videoSrc) {
    video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.src = opts.videoSrc;
    video.addEventListener('loadeddata', () => (videoReady = true), { once: true });
    video.addEventListener('error', () => (videoBlocked = true), { once: true });
    videoTex = new VideoTexture(video);
    videoTex.colorSpace = SRGBColorSpace;
    // The video is 16:9 and the screen 16:10: crop the sides so it covers the screen.
    videoTex.repeat.x = SCR_W / SCR_H / (16 / 9);
    videoTex.offset.x = (1 - videoTex.repeat.x) / 2;
    videoMat.map = videoTex;
  }

  // Soft contact shadow on an invisible "floor" below the floating laptop.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 512;
  const sctx = shadowCanvas.getContext('2d')!;
  // Shapes stay well inside the canvas so the blur fully decays before the plane's edges.
  sctx.filter = 'blur(34px)';
  sctx.fillStyle = 'rgba(20,20,40,0.22)';
  sctx.beginPath();
  sctx.roundRect(256 - 150, 262 - 105, 300, 210, 50);
  sctx.fill();
  sctx.filter = 'blur(14px)';
  sctx.fillStyle = 'rgba(14,14,30,0.5)';
  sctx.beginPath();
  sctx.roundRect(256 - 128, 262 - 86, 256, 172, 22);
  sctx.fill();
  const shadowTex = new CanvasTexture(shadowCanvas);
  const shadowMat = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false });
  const shadow = new Mesh(new PlaneGeometry(6.4, 6.4), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  const shadowRoot = new Group();
  shadowRoot.position.set(0, -0.28, 0.35);
  shadowRoot.add(shadow);
  scene.add(shadowRoot);

  // ---------- Lights (studio setup for a light page) ----------
  const key = new DirectionalLight('#ffffff', 2.2);
  key.position.set(-3, 7, 6);
  scene.add(key);
  const fill = new DirectionalLight('#ffffff', 1.1);
  fill.position.set(6, 3, 4);
  scene.add(fill);
  const rim = new DirectionalLight('#ffffff', 1.4);
  rim.position.set(0, 4, -7);
  scene.add(rim);

  // Center the laptop around its visual middle.
  laptop.position.set(0, 0, 0.35);
  await yieldToMain();

  // ---------- Camera poses ----------
  const tanHalf = Math.tan(MathUtils.degToRad(FOV / 2));
  let width = 1;
  let height = 1;
  const poseA = { pos: new Vector3(), target: new Vector3(), shift: 0 };
  const poseB = { pos: new Vector3(), target: new Vector3(), shift: 0 };
  const poseC = { pos: new Vector3(), target: new Vector3(), shift: 0 };
  const ROT_A = mobile ? -0.12 : -0.2;

  function computePoses() {
    const aspect = width / height;
    // All poses are computed with the laptop at rest.
    laptop.rotation.set(0, 0, 0);
    float.position.set(0, 0, 0);
    float.rotation.set(0, 0, 0);
    float.updateMatrixWorld(true);
    const box = new Box3().setFromObject(laptop);
    const size = box.getSize(new Vector3());
    const mid = box.getCenter(new Vector3());
    const projected = (elev: number) => size.y * Math.cos(elev) + size.z * Math.sin(elev);

    // A: nearly face-on, filling the band between the hero copy and the bottom edge (the screen
    // plays the video here). A tall copy (phones) leaves a minimum band, so the laptop starts
    // below the fold and rises as the camera moves in; it never covers the copy.
    const top = (opts.frameTop?.() ?? 0) + 16;
    const bottom = height * 0.94;
    const band = Math.max(bottom - top, height * 0.3);
    const elevA = MathUtils.degToRad(10);
    const wA = aspect < 1 ? 0.9 : 0.72;
    const dA = Math.max((size.x * 1.08) / (wA * 2 * tanHalf * aspect), (projected(elevA) * 1.12) / ((band / height) * 2 * tanHalf));
    poseA.target.copy(mid);
    poseA.pos.set(mid.x, mid.y + Math.sin(elevA) * dA, mid.z + Math.cos(elevA) * dA);
    poseA.shift = 1 - (2 * (top + band / 2)) / height; // NDC: moves the laptop to the band's middle

    // B: straight onto the screen.
    const sc = new Vector3();
    screen.getWorldPosition(sc);
    const normal = new Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new Quaternion()));
    const wB = aspect < 1 ? 0.97 : 0.8;
    const hB = aspect < 1 ? 0.6 : 0.7;
    const dB = Math.max(SCR_W / (wB * 2 * tanHalf * aspect), SCR_H / (hB * 2 * tanHalf));
    poseB.target.copy(sc);
    poseB.pos.copy(sc).addScaledVector(normal, dB);
    poseB.shift = aspect < 1 ? 0.2 : 0.07;

    // C: pulled back, face-on, the whole laptop inside the frame (above the caption).
    const elevC = MathUtils.degToRad(16);
    const projH = projected(elevC);
    const wC = aspect < 1 ? 0.8 : 0.46;
    const hC = aspect < 1 ? 0.34 : 0.54;
    const dC = Math.max(size.x / (wC * 2 * tanHalf * aspect), projH / (hC * 2 * tanHalf));
    poseC.target.copy(mid);
    poseC.pos.set(mid.x, mid.y + Math.sin(elevC) * dC, mid.z + Math.cos(elevC) * dC);
    poseC.shift = aspect < 1 ? 0.2 : 0.16;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    computePoses();
    dirty = true;
  }

  // ---------- State ----------
  const state: HeroState = { cam: 0, back: 0, fill: 0, panel: 0 };
  let drawn = { fill: -1, panel: -1 };
  let dirty = true;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function paintScreen() {
    if (Math.abs(drawn.fill - state.fill) < 0.0005 && Math.abs(drawn.panel - state.panel) < 0.0005) return;
    tctx.setTransform(texScale, 0, 0, texScale, 0, 0);
    drawScreen(tctx, state);
    screenTex.needsUpdate = true;
    drawn = { fill: state.fill, panel: state.panel };
  }

  const tmpPos = new Vector3();
  const tmpTarget = new Vector3();
  const clock = { last: performance.now(), t: 0 };

  function frame(now: number) {
    const dt = Math.min(0.05, (now - clock.last) / 1000);
    clock.last = now;
    clock.t += dt;
    const e = state.cam;
    const b = state.back;
    const free = Math.max(1 - MathUtils.smoothstep(e, 0, 0.85), b * 0.6);

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);

    float.position.y = Math.sin(clock.t * 0.9) * 0.07 * free;
    float.rotation.z = Math.sin(clock.t * 0.6) * 0.012 * free;
    laptop.rotation.y = MathUtils.lerp(ROT_A, 0, e) + pointer.x * 0.16 * free;
    laptop.rotation.x = pointer.y * 0.06 * free;
    shadowRoot.rotation.y = laptop.rotation.y;
    shadowMat.opacity = (1 - float.position.y * 2.5) * Math.max(1 - MathUtils.smoothstep(e, 0.2, 0.7), b * 0.75);

    tmpPos.lerpVectors(poseA.pos, poseB.pos, e).lerp(poseC.pos, b);
    tmpTarget.lerpVectors(poseA.target, poseB.target, e).lerp(poseC.target, b);
    camera.position.copy(tmpPos);
    camera.lookAt(tmpTarget);
    const shift = MathUtils.lerp(MathUtils.lerp(poseA.shift, poseB.shift, e), poseC.shift, b);
    camera.setViewOffset(width, height, 0, (shift * height) / 2, width, height);

    // Video while the camera is near the first pose; fades in once it has a frame.
    const showVideo = videoReady && !videoBlocked ? 1 - MathUtils.smoothstep(e, 0.04, 0.3) : 0;
    videoMat.opacity += (showVideo - videoMat.opacity) * Math.min(1, dt * 6);
    if (showVideo === 0 && videoMat.opacity < 0.01) videoMat.opacity = 0;
    videoScreen.visible = videoMat.opacity > 0;
    syncVideo(running && e < 0.3);

    paintScreen();
    renderer.render(scene, camera);
    if (dirty) {
      dirty = false;
      if (opts.onFirstFrame) {
        const cb = opts.onFirstFrame;
        opts.onFirstFrame = undefined;
        cb();
      }
    }
  }

  function syncVideo(play: boolean) {
    if (!video || videoBlocked) return;
    if (play && video.paused) video.play().catch(() => (videoBlocked = true));
    else if (!play && !video.paused) video.pause();
  }

  // ---------- Loop control ----------
  let running = false;
  let wanted = false;
  let raf = 0;
  const loop = (now: number) => {
    frame(now);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    const should = wanted && document.visibilityState === 'visible';
    if (should && !running) {
      running = true;
      clock.last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
      syncVideo(false);
    }
  };

  const onPointer = (ev: PointerEvent) => {
    if (ev.pointerType !== 'mouse') return;
    pointer.tx = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (ev.clientY / window.innerHeight) * 2 - 1;
  };
  resize();
  paintScreen();
  await yieldToMain();
  // Compile shaders without blocking (uses KHR_parallel_shader_compile where available).
  await renderer.compileAsync(scene, camera);
  await yieldToMain();

  const ro = new ResizeObserver(() => {
    resize();
    if (!running) frame(performance.now());
  });
  ro.observe(canvas);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', sync);
  // Repaint once the web font is ready (the canvas text uses Inter).
  // It can also change the height of the hero copy, which the first pose depends on.
  document.fonts?.load(`500 26px "Inter Variable"`).then(() => {
    computePoses();
    drawn = { fill: -1, panel: -1 };
    if (!running) frame(performance.now());
  });

  return {
    setState(s) {
      state.cam = s.cam;
      state.back = s.back;
      state.fill = s.fill;
      state.panel = s.panel;
      if (!running) frame(performance.now());
    },
    start() {
      wanted = true;
      sync();
    },
    stop() {
      wanted = false;
      sync();
    },
    dispose() {
      wanted = false;
      sync();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', sync);
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      videoTex?.dispose();
      const mats = new Set<Material>();
      const texs = new Set<Texture>([screenTex, shadowTex, envTex]);
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => mats.add(mm));
      });
      mats.forEach((mm) => mm.dispose());
      texs.forEach((t) => t.dispose());
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
