/**
 * A procedural 3D figure (three.js, MIT) animated from DemoClip key poses.
 * No downloaded models or animation files: every shape and motion is generated here,
 * so there are no third-party asset licences to worry about. A rigged character can
 * later replace buildFigure() and read the same DemoPose angles.
 */
import * as THREE from "three";
import { samplePose, type DemoClip, type DemoPose, type DemoSegment, type LocalisedText } from "@kynex/motion";

const D = THREE.MathUtils.degToRad;

const COLORS = {
  skin: 0xe4bfa0,
  shirt: 0x2f789f,
  shorts: 0x0e3147,
  shoe: 0xf4f6f8,
  sole: 0x2a3440,
  hair: 0x2b2420,
  eye: 0x1b1b1b,
  highlight: 0xf2812e,
  chair: 0xc9b39a,
  chairDark: 0x8f7a64,
  mat: 0xb9d6e8,
};

interface Figure {
  body: THREE.Group;
  j: Record<string, THREE.Group>;
  segments: Record<DemoSegment, THREE.Mesh[]>;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

function buildFigure(): Figure {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const mat = (color: number, roughness = 0.65) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.push(m);
    return m;
  };
  const segments: Record<DemoSegment, THREE.Mesh[]> = { head: [], trunk: [], lArm: [], rArm: [], lLeg: [], rLeg: [] };

  const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, seg?: DemoSegment) => {
    geometries.push(geo);
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    if (seg) segments[seg].push(m);
    return m;
  };
  /** Capsule hanging down from its joint, total length `len`. */
  const limb = (r: number, len: number, material: THREE.Material, seg: DemoSegment) => {
    const m = mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 8, 18), material, seg);
    m.position.y = -len / 2;
    return m;
  };
  const group = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // One material per segment so highlighting can tint just that part.
  const segMats = (base: number) => ({
    head: mat(base),
    trunk: mat(base),
    lArm: mat(base),
    rArm: mat(base),
    lLeg: mat(base),
    rLeg: mat(base),
  });
  const skin = segMats(COLORS.skin);
  const shirt = segMats(COLORS.shirt);
  const shorts = segMats(COLORS.shorts);
  const shoe = mat(COLORS.shoe, 0.5);
  const sole = mat(COLORS.sole);
  const hair = mat(COLORS.hair, 0.9);
  const eye = mat(COLORS.eye, 0.3);

  const body = new THREE.Group();
  const j: Record<string, THREE.Group> = {};

  // Pelvis
  const pelvis = mesh(new THREE.CapsuleGeometry(0.12, 0.12, 8, 18), shorts.trunk, "trunk");
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.78);
  body.add(pelvis);

  // Spine → torso, neck, arms
  j.spine = group(body, 0, 0.06, 0);
  const abdomen = mesh(new THREE.CapsuleGeometry(0.12, 0.1, 8, 18), shirt.trunk, "trunk");
  abdomen.position.y = 0.1;
  abdomen.scale.set(1.15, 1, 0.78);
  const chest = mesh(new THREE.CapsuleGeometry(0.14, 0.12, 8, 18), shirt.trunk, "trunk");
  chest.position.y = 0.3;
  chest.scale.set(1.25, 1, 0.8);
  j.spine.add(abdomen, chest);

  j.neck = group(j.spine, 0, 0.47, 0);
  const neck = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 16), skin.head, "head");
  neck.position.y = 0.04;
  const head = mesh(new THREE.SphereGeometry(0.1, 28, 20), skin.head, "head");
  head.position.y = 0.16;
  head.scale.set(0.92, 1.12, 1);
  const hairCap = mesh(new THREE.SphereGeometry(0.106, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.set(0, 0.17, -0.008);
  hairCap.rotation.x = -0.45;
  hairCap.scale.set(0.95, 1.12, 1.04);
  const eyeGeo = new THREE.SphereGeometry(0.012, 10, 8);
  geometries.push(eyeGeo);
  const eyeL = new THREE.Mesh(eyeGeo, eye);
  eyeL.position.set(0.034, 0.175, 0.088);
  const eyeR = new THREE.Mesh(eyeGeo, eye);
  eyeR.position.set(-0.034, 0.175, 0.088);
  const nose = mesh(new THREE.SphereGeometry(0.016, 12, 10), skin.head, "head");
  nose.position.set(0, 0.15, 0.1);
  j.neck.add(neck, head, hairCap, eyeL, eyeR, nose);

  for (const [s, x] of [
    ["l", 0.19],
    ["r", -0.19],
  ] as const) {
    const seg: DemoSegment = s === "l" ? "lArm" : "rArm";
    const sh = group(j.spine, x, 0.42, 0);
    j[`${s}Sh`] = sh;
    const sleeve = mesh(new THREE.CylinderGeometry(0.058, 0.055, 0.12, 16), shirt[seg], seg);
    sleeve.position.y = -0.05;
    const shoulderBall = mesh(new THREE.SphereGeometry(0.058, 16, 12), shirt[seg], seg);
    sh.add(limb(0.048, 0.3, skin[seg], seg), sleeve, shoulderBall);
    const el = group(sh, 0, -0.29, 0);
    j[`${s}El`] = el;
    el.add(limb(0.04, 0.26, skin[seg], seg), mesh(new THREE.SphereGeometry(0.043, 16, 12), skin[seg], seg));
    const hand = mesh(new THREE.SphereGeometry(0.045, 16, 12), skin[seg], seg);
    hand.position.y = -0.29;
    hand.scale.set(0.75, 1.25, 0.5);
    el.add(hand);
  }

  for (const [s, x] of [
    ["l", 0.09],
    ["r", -0.09],
  ] as const) {
    const seg: DemoSegment = s === "l" ? "lLeg" : "rLeg";
    const hip = group(body, x, -0.04, 0);
    j[`${s}Hip`] = hip;
    const shortLeg = mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.18, 18), shorts[seg], seg);
    shortLeg.position.y = -0.07;
    hip.add(limb(0.075, 0.46, skin[seg], seg), shortLeg);
    const knee = group(hip, 0, -0.44, 0);
    j[`${s}Knee`] = knee;
    knee.add(limb(0.055, 0.42, skin[seg], seg), mesh(new THREE.SphereGeometry(0.062, 16, 12), skin[seg], seg));
    const ankle = group(knee, 0, -0.42, 0);
    j[`${s}Ankle`] = ankle;
    ankle.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), skin[seg], seg));
    const foot = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 8, 14), shoe, seg);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.035, 0.055);
    foot.scale.set(1, 1, 0.85);
    const soleM = mesh(new THREE.BoxGeometry(0.085, 0.015, 0.24), sole, seg);
    soleM.position.set(0, -0.072, 0.055);
    ankle.add(foot, soleM);
  }

  return { body, j, segments, materials, geometries };
}

function applyPose(fig: Figure, p: DemoPose) {
  const v = (k: keyof DemoPose) => p[k] ?? 0;
  const { j, body } = fig;
  body.rotation.set(D(v("bodyPitch")), 0, 0);
  body.position.z = v("shiftZ") / 100;
  j.spine!.rotation.set(D(v("spineFlex")), D(v("spineRot")), D(-v("spineSide")), "YXZ");
  j.neck!.rotation.set(D(v("neckFlex")), D(v("neckRot")), D(-v("neckSide")), "YXZ");
  j.neck!.position.z = v("headFwd") / 100;
  for (const s of ["l", "r"] as const) {
    const sign = s === "l" ? 1 : -1;
    const sh = j[`${s}Sh`]!;
    sh.position.y = 0.42 + v(`${s}ShElev`) / 100;
    sh.rotation.set(D(-v(`${s}ShFlex`)), D(-sign * v(`${s}ShRot`)), D(sign * v(`${s}ShAbd`)), "ZXY");
    j[`${s}El`]!.rotation.set(D(-v(`${s}Elbow`)), 0, 0);
    j[`${s}Hip`]!.rotation.set(D(-v(`${s}HipFlex`)), 0, D(sign * v(`${s}HipAbd`)), "ZXY");
    j[`${s}Knee`]!.rotation.set(D(v(`${s}Knee`)), 0, 0);
    j[`${s}Ankle`]!.rotation.set(D(v(`${s}Ankle`)), 0, 0);
  }
}

const box = new THREE.Box3();
/** Pose the figure and drop it so its lowest point touches the floor. */
function poseAndGround(fig: Figure, p: DemoPose, floor: number) {
  fig.body.position.y = 0;
  applyPose(fig, p);
  fig.body.updateMatrixWorld(true);
  box.setFromObject(fig.body, true);
  fig.body.position.y = floor - box.min.y;
  fig.body.updateMatrixWorld(true);
}

export interface DemoController {
  setPlaying(v: boolean): void;
  setSpeed(v: number): void;
  /** Rotate the viewpoint (degrees around the figure, 0 = the tracking camera's view). */
  setOrbit(deg: number): void;
  /** Jump to a point in the loop (0..1). */
  setProgress(p: number): void;
  dispose(): void;
}

export function createDemo(
  host: HTMLElement,
  clip: DemoClip,
  opts: { onCue?: (c: LocalisedText | undefined) => void; onProgress?: (p: number) => void; reducedMotion?: boolean },
): DemoController {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8d6e2, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(1.6, 3.5, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -2;
  sun.shadow.camera.right = 2;
  sun.shadow.camera.top = 2;
  sun.shadow.camera.bottom = -2;
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0005;
  scene.add(hemi, sun);

  const extraGeo: THREE.BufferGeometry[] = [];
  const extraMat: THREE.Material[] = [];
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    extraGeo.push(geo);
    extraMat.push(material);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  const ground = add(new THREE.CircleGeometry(3.2, 64), new THREE.ShadowMaterial({ opacity: 0.16 }), 0, 0, 0, false);
  ground.rotation.x = -Math.PI / 2;

  const fig = buildFigure();
  scene.add(fig.body);
  const floor = clip.prop === "mat" ? 0.012 : 0;

  // Props
  if (clip.prop === "chair") {
    poseAndGround(fig, samplePose(clip, 0).pose, floor);
    const hipY = fig.body.position.y;
    const seatTop = hipY - 0.11;
    const seatZ = fig.body.position.z - 0.06;
    const wood = new THREE.MeshStandardMaterial({ color: COLORS.chair, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: COLORS.chairDark, roughness: 0.8 });
    add(new THREE.BoxGeometry(0.48, 0.04, 0.44), wood, 0, seatTop - 0.02, seatZ);
    add(new THREE.BoxGeometry(0.48, 0.46, 0.035), wood, 0, seatTop + 0.25, seatZ - 0.24);
    for (const [x, z] of [
      [0.21, 0.19],
      [-0.21, 0.19],
      [0.21, -0.2],
      [-0.21, -0.2],
    ] as const) {
      add(new THREE.BoxGeometry(0.035, seatTop - 0.04, 0.035), dark, x, (seatTop - 0.04) / 2, seatZ + z);
    }
  }

  // Frame the camera around everything the clip does.
  const bounds = new THREE.Box3();
  for (let i = 0; i <= 24; i++) {
    poseAndGround(fig, samplePose(clip, i / 24).pose, floor);
    bounds.union(box.setFromObject(fig.body, true));
  }
  for (const child of scene.children) if (child instanceof THREE.Mesh && child !== ground) bounds.union(new THREE.Box3().setFromObject(child));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (clip.prop === "mat") {
    add(new THREE.BoxGeometry(0.7, 0.012, Math.max(1.4, size.z + 0.3)), new THREE.MeshStandardMaterial({ color: COLORS.mat, roughness: 0.9 }), center.x, 0.006, center.z, false);
  }
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  // A slight angle on front views makes forward movements (knee lifts, elbow bends) readable.
  const baseAz = clip.view === "front" ? 15 : 90;
  let orbit = 0;

  const placeCamera = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    camera.aspect = w / h;
    const vFov = D(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const across = Math.max(size.x, size.z) * 1.0;
    const dist = Math.max(size.y / 2 / Math.tan(vFov / 2), across / 2 / Math.tan(hFov / 2)) * 1.18 + Math.max(size.x, size.z) / 3;
    const az = D(baseAz + orbit);
    const el = D(6);
    camera.position.set(center.x + dist * Math.sin(az) * Math.cos(el), center.y + dist * Math.sin(el), center.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  placeCamera();
  const ro = new ResizeObserver(placeCamera);
  ro.observe(host);

  // Highlight: pulse the moving segments in the accent colour.
  const highlightMats = new Set<THREE.MeshStandardMaterial>();
  for (const seg of clip.highlight) for (const m of fig.segments[seg]) if (m.material instanceof THREE.MeshStandardMaterial && ![COLORS.shoe, COLORS.sole].includes(m.material.color.getHex())) highlightMats.add(m.material);
  const glow = new THREE.Color(COLORS.highlight);

  let playing = !opts.reducedMotion;
  let speed = 1;
  let progress = 0;
  let last = performance.now();
  let lastCue: LocalisedText | undefined | null = null;
  let raf = 0;

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) progress = (progress + (dt * speed) / clip.seconds) % 1;
    const { pose, cue } = samplePose(clip, progress);
    poseAndGround(fig, pose, floor);
    const pulse = 0.14 + 0.08 * Math.sin(now / 260);
    for (const m of highlightMats) {
      m.emissive.copy(glow);
      m.emissiveIntensity = pulse;
    }
    renderer.render(scene, camera);
    if (cue !== lastCue) {
      lastCue = cue;
      opts.onCue?.(cue);
    }
    opts.onProgress?.(progress);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setPlaying: (v) => {
      playing = v;
    },
    setSpeed: (v) => {
      speed = v;
    },
    setProgress: (p) => {
      progress = p;
    },
    setOrbit: (deg) => {
      orbit = deg;
      placeCamera();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const g of [...fig.geometries, ...extraGeo]) g.dispose();
      for (const m of [...fig.materials, ...extraMat]) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
