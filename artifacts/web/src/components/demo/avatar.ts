/**
 * 3D "how to do it" demo: a rigged human (Quaternius Universal Base Characters, CC0, see
 * public/avatar/LICENSE.txt) moved by the DemoClip joint angles from @kynex/motion.
 *
 * The angles are clinical (hip flexion, knee bend...). Each one is applied as a rotation in the
 * body's own frame (Y up, Z = facing, X = the person's left) on top of a rest pose built from
 * the model's T-pose: standing straight, arms by the sides, feet forward. So the same data can
 * drive any humanoid skeleton.
 *
 * A stand-in until the instructor videos and the final avatar are made.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { samplePose, type DemoClip, type DemoPose, type LocalisedText } from "@kynex/motion";

const D = THREE.MathUtils.degToRad;
const BASE = import.meta.env.BASE_URL;
const BODY_URL = `${BASE}avatar/kynex-male.glb`;
const HAIR_URL = `${BASE}avatar/kynex-male-hair.glb`;

const COLORS = {
  shirt: 0x2f789f,
  shorts: 0x0e3147,
  hair: 0x3a2a20,
  chair: 0xc9b39a,
  chairDark: 0x8f7a64,
  mat: 0x7fb6d6,
};

export interface DemoController {
  setPlaying(v: boolean): void;
  setSpeed(v: number): void;
  /** Rotate the viewpoint (degrees around the figure, 0 = the tracking camera's view). */
  setOrbit(deg: number): void;
  /** Jump to a point in the loop (0..1). */
  setProgress(p: number): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ model loading */

let assets: Promise<[GLTF, GLTF]> | null = null;
function loadAssets() {
  if (!assets) {
    const loader = new GLTFLoader();
    assets = Promise.all([loader.loadAsync(BODY_URL), loader.loadAsync(HAIR_URL)]);
    assets.catch(() => (assets = null)); // allow a retry after a network error
  }
  return assets;
}

/**
 * The free base body wears only briefs: paint a T-shirt and shorts in the shader, by region of
 * the bind (T-) pose. Units are metres, Y up, X = left, Z = front.
 */
function dressUp(mat: THREE.MeshStandardMaterial) {
  if (mat.userData.kynexDressed) return;
  mat.userData.kynexDressed = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uShirt = { value: new THREE.Color(COLORS.shirt) };
    sh.uniforms.uShorts = { value: new THREE.Color(COLORS.shorts) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nuniform vec3 uShirt;\nuniform vec3 uShorts;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float ax = abs(vBind.x);
          float y = vBind.y;
          bool torso = ax < 0.215 && y > 0.94 && y < 1.58;
          bool neckline = y > 1.43 && ax < 0.075 + (y - 1.43) * 0.6 && vBind.z > -0.02;
          bool sleeve = ax >= 0.215 && ax < 0.37 && y > 1.27 && y < 1.63;
          bool shorts = y > 0.66 && y <= 0.94 && ax < 0.26;
          float shade = 0.75 + 0.25 * dot(diffuseColor.rgb, vec3(0.333));
          if ((torso && !neckline) || sleeve) diffuseColor.rgb = uShirt * shade;
          else if (shorts) diffuseColor.rgb = uShorts * shade;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "kynex-dress";
}

/* ------------------------------------------------------------------ the rig */

interface Rig {
  body: THREE.Group;
  meshes: THREE.Mesh[];
  apply(p: DemoPose): void;
  minY(): number;
  minYOf(g: "feet" | "back" | "seat"): number;
  bonePos(n: string): THREE.Vector3;
}

const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

function buildRig(bodyGltf: GLTF, hairGltf: GLTF): Rig {
  const model = cloneSkinned(bodyGltf.scene);
  const body = new THREE.Group();
  const pivot = new THREE.Group(); // offsets the model so the pelvis sits at the body origin
  body.add(pivot);
  pivot.add(model);
  const bone = (n: string) => {
    const b = model.getObjectByName(n);
    if (!b) throw new Error(`avatar: missing bone ${n}`);
    return b;
  };

  body.updateMatrixWorld(true);
  if (wp(bone("upperarm_l")).x < 0) model.rotation.y = Math.PI; // face +Z, left on +X
  body.updateMatrixWorld(true);
  pivot.position.sub(wp(bone("pelvis")));
  body.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  let skin: THREE.SkinnedMesh | undefined;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    meshes.push(m);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (/superhero/i.test(mat.name)) {
      dressUp(mat);
      skin = m as THREE.SkinnedMesh;
    }
    if (/hair/i.test(mat.name)) mat.color.set(COLORS.hair);
  });
  if (!skin) throw new Error("avatar: body mesh not found");

  // The hair is modelled in the bind pose: attach it to the head bone as it stands.
  const hair = hairGltf.scene.clone(true);
  model.add(hair);
  body.updateMatrixWorld(true);
  hair.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    (m.material as THREE.MeshStandardMaterial).color.set(COLORS.hair);
    meshes.push(m);
  });
  bone("Head").attach(hair);

  // Rest pose: standing straight, arms hanging by the sides, feet forward.
  const aim = (b: string, child: string, dir: THREE.Vector3) => {
    body.updateMatrixWorld(true);
    const B = bone(b);
    const cur = wp(bone(child)).sub(wp(B)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.normalize());
    const world = B.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
    B.quaternion.copy(B.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
  };
  for (const s of ["l", "r"] as const) {
    const out = s === "l" ? 1 : -1;
    aim(`upperarm_${s}`, `lowerarm_${s}`, new THREE.Vector3(0.07 * out, -1, 0));
    aim(`lowerarm_${s}`, `hand_${s}`, new THREE.Vector3(0.05 * out, -1, 0.04));
    aim(`hand_${s}`, `middle_01_${s}`, new THREE.Vector3(0.03 * out, -1, 0.02));
    aim(`thigh_${s}`, `calf_${s}`, new THREE.Vector3(0.02 * out, -1, 0));
    aim(`calf_${s}`, `foot_${s}`, new THREE.Vector3(0, -1, 0));
    aim(`foot_${s}`, `ball_${s}`, new THREE.Vector3(0, -0.45, 1));
  }
  body.updateMatrixWorld(true);

  const DRIVEN = ["spine_01", "spine_02", "spine_03", "neck_01", "Head"];
  for (const s of ["l", "r"]) DRIVEN.push(`clavicle_${s}`, `upperarm_${s}`, `lowerarm_${s}`, `thigh_${s}`, `calf_${s}`, `foot_${s}`);
  const rest = new Map<string, { b: THREE.Object3D; local: THREE.Quaternion; pw: THREE.Quaternion; pwInv: THREE.Quaternion }>();
  for (const n of DRIVEN) {
    const b = bone(n);
    const pw = b.parent!.getWorldQuaternion(new THREE.Quaternion());
    rest.set(n, { b, local: b.quaternion.clone(), pw, pwInv: pw.clone().invert() });
  }

  const e = new THREE.Euler();
  const dq = new THREE.Quaternion();
  const set = (n: string, x: number, y: number, z: number, order: THREE.EulerOrder) => {
    const r = rest.get(n)!;
    dq.setFromEuler(e.set(x, y, z, order));
    // The rotation is in the body frame: carry it into the parent bone's local frame.
    r.b.quaternion.copy(r.pwInv).multiply(dq).multiply(r.pw).multiply(r.local);
  };

  const apply = (p: DemoPose) => {
    const v = (k: keyof DemoPose) => p[k] ?? 0;
    body.rotation.set(D(v("bodyPitch")), 0, 0);
    body.position.z = v("shiftZ") / 100;
    for (const n of ["spine_01", "spine_02", "spine_03"]) set(n, D(v("spineFlex") / 3), D(v("spineRot") / 3), D(-v("spineSide") / 3), "YXZ");
    for (const n of ["neck_01", "Head"]) set(n, D(v("neckFlex") / 2), D(v("neckRot") / 2), D(-v("neckSide") / 2), "YXZ");
    for (const s of ["l", "r"] as const) {
      const sign = s === "l" ? 1 : -1;
      set(`clavicle_${s}`, 0, 0, D(sign * v(`${s}ShElev`) * 3.5), "XYZ");
      set(`upperarm_${s}`, D(-v(`${s}ShFlex`)), D(-sign * v(`${s}ShRot`)), D(sign * v(`${s}ShAbd`)), "ZXY");
      set(`lowerarm_${s}`, D(-v(`${s}Elbow`)), 0, 0, "XYZ");
      set(`thigh_${s}`, D(-v(`${s}HipFlex`)), 0, D(sign * v(`${s}HipAbd`)), "ZXY");
      set(`calf_${s}`, D(v(`${s}Knee`)), 0, 0, "XYZ");
      set(`foot_${s}`, D(v(`${s}Ankle`)), 0, 0, "XYZ");
    }
  };

  // Vertex groups (by bind position) for keeping body parts on the floor or the seat.
  const bind = skin.geometry.attributes.position!;
  const group = (f: (x: number, y: number, z: number) => boolean, step: number) => {
    const idx: number[] = [];
    for (let i = 0; i < bind.count; i += step) if (f(bind.getX(i), bind.getY(i), bind.getZ(i))) idx.push(i);
    return idx;
  };
  const groups = {
    all: group(() => true, 5),
    feet: group((_x, y) => y < 0.12, 2),
    back: group((x, y, z) => y > 1.15 && y < 1.5 && Math.abs(x) < 0.2 && z < 0, 2),
    seat: group((x, y, z) => y > 0.75 && y < 0.98 && Math.abs(x) < 0.22 && z < 0.02, 2),
  };
  const tmp = new THREE.Vector3();
  const minOver = (idx: number[]) => {
    body.updateMatrixWorld(true);
    skin!.skeleton.update();
    let y = Infinity;
    for (const i of idx) {
      skin!.getVertexPosition(i, tmp).applyMatrix4(skin!.matrixWorld);
      if (tmp.y < y) y = tmp.y;
    }
    return y;
  };

  return {
    body,
    meshes,
    apply,
    minY: () => minOver(groups.all),
    minYOf: (g) => minOver(groups[g]),
    bonePos: (n) => {
      body.updateMatrixWorld(true);
      return wp(bone(n));
    },
  };
}

/* ------------------------------------------------------------------ posing */

/** Lying on the back with both knees bent (bridges): the trunk tilt that keeps the upper back and the feet on the floor. */
function solveSupinePitch(rig: Rig, raw: DemoPose): number {
  let lo = -140;
  let hi = -60;
  for (let it = 0; it < 14; it++) {
    const mid = (lo + hi) / 2;
    rig.apply({ ...raw, bodyPitch: mid });
    if (rig.minYOf("back") - rig.minYOf("feet") > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

const isSupineBent = (p: DemoPose) => (p.bodyPitch ?? 0) < -30 && (p.lKnee ?? 0) > 40 && (p.rKnee ?? 0) > 40;

/** The pose actually shown: the clip's pose, with whole-body corrections this body needs. */
interface Frame {
  pose: DemoPose;
  y: number;
}

function precompute(rig: Rig, clip: DemoClip, floor: number, samples: number): Frame[] {
  const frames: Frame[] = [];
  const solved = new Map<string, number>();
  for (let i = 0; i < samples; i++) {
    let pose = samplePose(clip, i / samples).pose;
    if (isSupineBent(pose)) {
      const key = JSON.stringify(pose);
      let pitch = solved.get(key);
      if (pitch === undefined) solved.set(key, (pitch = solveSupinePitch(rig, pose)));
      // Arms stay flat on the floor: extend the shoulders by the trunk's tilt.
      const tilt = -(pitch + 90);
      pose = { ...pose, bodyPitch: pitch, lShFlex: (pose.lShFlex ?? 0) - tilt, rShFlex: (pose.rShFlex ?? 0) - tilt };
    }
    rig.body.position.y = 0;
    rig.apply(pose);
    frames.push({ pose, y: floor - rig.minY() });
  }
  return frames;
}

/* ------------------------------------------------------------------ the scene */

export async function createDemo(
  host: HTMLElement,
  clip: DemoClip,
  opts: { onCue?: (c: LocalisedText | undefined) => void; reducedMotion?: boolean; preserveDrawingBuffer?: boolean },
): Promise<DemoController> {
  const [bodyGltf, hairGltf] = await loadAssets();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d6e2, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(1.6, 3.5, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2.4, bottom: -2 });
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight(0xdbe9ff, 0.8);
  fill.position.set(-2, 1.5, -1.5);
  scene.add(sun, fill);

  const own: { dispose(): void }[] = [];
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    own.push(geo, material);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const ground = add(new THREE.CircleGeometry(3.2, 64), new THREE.ShadowMaterial({ opacity: 0.18 }), 0, 0, 0, false);
  ground.rotation.x = -Math.PI / 2;

  const rig = buildRig(bodyGltf, hairGltf);
  scene.add(rig.body);
  const floor = clip.prop === "mat" ? 0.015 : 0;
  const SAMPLES = 120;

  // Seated clips: the chair seat goes under the thighs, and the body sits on it.
  let seatTop = 0;
  if (clip.prop === "chair") {
    const p0 = samplePose(clip, 0).pose;
    rig.body.position.y = 0;
    rig.apply(p0);
    rig.body.position.y = floor - rig.minYOf("feet");
    seatTop = rig.minYOf("seat");
  }
  const frames = precompute(rig, clip, floor, SAMPLES);

  const showAt = (p: number) => {
    p = ((p % 1) + 1) % 1;
    const x = p * SAMPLES;
    const i = Math.floor(x) % SAMPLES;
    const a = frames[i]!;
    const b = frames[(i + 1) % SAMPLES]!;
    const t = x - Math.floor(x);
    // Joint angles come straight from the clip (smooth); the whole-body corrections are interpolated.
    const raw = samplePose(clip, p).pose;
    const corr: DemoPose = { ...raw };
    if (a.pose.bodyPitch !== raw.bodyPitch || b.pose.bodyPitch !== raw.bodyPitch) {
      const lerp = (k: keyof DemoPose) => (a.pose[k] ?? 0) + ((b.pose[k] ?? 0) - (a.pose[k] ?? 0)) * t;
      corr.bodyPitch = lerp("bodyPitch");
      corr.lShFlex = lerp("lShFlex");
      corr.rShFlex = lerp("rShFlex");
    }
    rig.apply(corr);
    rig.body.position.y = a.y + (b.y - a.y) * t;
  };

  // Frame the camera around everything the clip does.
  const bounds = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < SAMPLES; i += 6) {
    showAt(i / SAMPLES);
    rig.body.updateMatrixWorld(true);
    for (const m of rig.meshes) {
      const pos = m.geometry.attributes.position!;
      for (let k = 0; k < pos.count; k += 7) bounds.expandByPoint(m.getVertexPosition(k, v).applyMatrix4(m.matrixWorld));
    }
  }

  if (clip.prop === "chair") {
    const hip = (showAt(0), rig.bonePos("pelvis"));
    const seatZ = hip.z + 0.03;
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
    bounds.expandByPoint(new THREE.Vector3(0, seatTop + 0.5, seatZ - 0.26));
  }
  bounds.expandByPoint(new THREE.Vector3(bounds.min.x, 0, bounds.min.z));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (clip.prop === "mat") {
    const mat = add(new THREE.BoxGeometry(0.75, 0.015, Math.max(1.6, size.z + 0.35)), new THREE.MeshStandardMaterial({ color: COLORS.mat, roughness: 0.9 }), center.x, 0.0075, center.z, false);
    mat.receiveShadow = true;
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
    const across = Math.max(size.x, size.z);
    const dist = Math.max(size.y / 2 / Math.tan(vFov / 2), across / 2 / Math.tan(hFov / 2)) * 1.12 + across / 5;
    const az = D(baseAz + orbit);
    const el = D(10);
    const c = center.clone();
    if (clip.prop === "mat") c.y += size.y * 0.12; // lying figures: sit lower in the frame, nearer the middle
    camera.position.set(c.x + dist * Math.sin(az) * Math.cos(el), c.y + dist * Math.sin(el), c.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(c);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  placeCamera();
  const ro = new ResizeObserver(placeCamera);
  ro.observe(host);

  let playing = !opts.reducedMotion;
  let speed = 1;
  let progress = 0;
  let last = performance.now();
  let lastCue: LocalisedText | undefined | null = null;
  let raf = 0;
  const frame = (now: number) => {
    // rAF timestamps can be slightly older than the moment the demo was created.
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (playing) progress = (progress + (dt * speed) / clip.seconds) % 1;
    showAt(progress);
    renderer.render(scene, camera);
    const { cue } = samplePose(clip, progress);
    if (cue !== lastCue) {
      lastCue = cue;
      opts.onCue?.(cue);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setPlaying: (p) => {
      playing = p;
    },
    setSpeed: (s) => {
      speed = s;
    },
    setProgress: (p) => {
      progress = ((p % 1) + 1) % 1;
    },
    setOrbit: (deg) => {
      orbit = deg;
      placeCamera();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const o of own) o.dispose();
      // The model's geometry, materials and textures are shared between demos and stay cached.
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
