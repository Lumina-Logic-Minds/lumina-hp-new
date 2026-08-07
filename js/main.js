import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RGBShiftShader } from "three/addons/shaders/RGBShiftShader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/* すべての .glb をこの1つのローダーで読む。meshopt 圧縮された GLB は
   デコーダーを設定したローダーでないと読めないため、個別に new せず共有する。 */
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

/* =========================================================
   Lumina Logic Minds — STEP 1: TOP section
   Black/teal void · chrome-glass ring+LLM logo · drifting
   particles · aurora light · bloom.
   ========================================================= */

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: false, powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true; // for the diagonal section dissolve

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02060a);
scene.fog = new THREE.FogExp2(0x02070b, 0.034);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 12);

/* 縦長の画面では横方向の視野が狭くなる。FOV は縦基準なので、画面が細いほど
   横に映る範囲だけが縮み、PC 向けに寸法を決めた 3D が左右にはみ出す。
   Work の背骨＋カードと Finale のヒーローカードだけを一律に縮めて収める。
   TOP のロゴや森は現状で収まっているため、カメラ側は触らない。
   CSS の 768px ブレークポイントに合わせる。 */
const narrowMQ = window.matchMedia("(max-width: 768px)");
let isNarrow = narrowMQ.matches;
narrowMQ.addEventListener("change", (e) => { isNarrow = e.matches; });
/* 縮小率は画面比率から連続的に決める。768px のような固定の境界だと、
   820x1180 のような縦長タブレットを取りこぼしてはみ出したままになるため。
   FIT_GAIN は「縦長端末でカードが画面幅の 7〜8 割を占める」ように決めた係数。
   小さくすると余白が増え、大きくすると画面いっぱいに近づく。 */
const DESIGN_ASPECT = 16 / 9;   // 寸法を決めたときの想定画面比
const FIT_GAIN = 2.0;
const fitScale = () =>
  Math.min(1, Math.max(0.4, (camera.aspect / DESIGN_ASPECT) * FIT_GAIN));

/* 会社紹介動画を映すヘックスグリッドは横 16 ユニットあり、そのままでは縦長画面から
   大きくはみ出す。タイルの UV は局所座標で決まるので、メッシュを縮めても映像の
   割り付けは崩れない。ワールド座標で書いている粒子の充填と当たり判定だけ、
   同じ倍率を掛けて合わせる。 */
const HEX_GAIN = 2.35;
const HEX_FIT = Math.min(1, Math.max(0.45, (window.innerWidth / window.innerHeight) / DESIGN_ASPECT * HEX_GAIN));
const VIS_HALF_W = 7.81 * (window.innerWidth / window.innerHeight); // 画面半幅（ワールド単位・実測から）

/* Environment for reflections (chrome/glass) */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------- Lights ---------- */
const keyLight = new THREE.DirectionalLight(0xbfe9ff, 2.2);
keyLight.position.set(-6, 8, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x9ca5ff, 1.6);
rimLight.position.set(7, -2, -4);
scene.add(rimLight);

scene.add(new THREE.AmbientLight(0x223844, 0.6));

/* Front fill so the glass form stays readable (not just backlit) */
const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
fillLight.position.set(0, 1.5, 12);
scene.add(fillLight);

/* Traveling specular highlight that orbits the logo — sweeping glints
   reveal the glass's 3D form as it rotates. */
const specLight = new THREE.PointLight(0xffffff, 6.0, 60, 2);
scene.add(specLight);

/* Three colored lights that slowly cross-fade (teal / periwinkle / warm),
   so the glass is lit dimensionally and its color shifts over time —
   rather than the whole shape glowing one flat colour. */
const tintA = new THREE.PointLight(0x39ffe0, 0, 50, 2); tintA.position.set(-6, 3, 5); scene.add(tintA);
const tintB = new THREE.PointLight(0x9ca5ff, 0, 50, 2); tintB.position.set(6, -1, 4); scene.add(tintB);
const tintC = new THREE.PointLight(0xffb27a, 0, 50, 2); tintC.position.set(0, -5, 6); scene.add(tintC);

/* Backlight behind the logo: lights the back faces so the glass glows from
   within instead of refracting pure black. */
const backLight = new THREE.PointLight(0xbfe3ff, 5, 32, 2);
backLight.position.set(0, 0, -4);
scene.add(backLight);

/* Roaming aurora light that occasionally sweeps the logo */
const auroraLight = new THREE.PointLight(0x6fffe0, 0, 40, 2);
auroraLight.position.set(-8, 4, 6);
scene.add(auroraLight);

/* =========================================================
   Aurora backdrop (flowing additive shader plane)
   ========================================================= */
const auroraGeo = new THREE.PlaneGeometry(120, 70, 1, 1);
const auroraMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform float uTime;
    // cheap value noise
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                 mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
    }
    float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;} return v; }
    void main(){
      vec2 uv = vUv;
      float t = uTime*0.05;
      float band = fbm(vec2(uv.x*3.0 + t, uv.y*2.0 - t*0.6));
      band += fbm(vec2(uv.x*6.0 - t*0.5, uv.y*4.0 + t));
      float glow = smoothstep(0.55, 1.4, band);
      // vertical falloff so it reads as drifting light, brighter upper-left
      float fall = smoothstep(0.0, 0.7, uv.y) * smoothstep(1.0, 0.2, uv.x);
      glow *= fall;
      vec3 teal = vec3(0.12, 0.85, 0.78);
      vec3 peri = vec3(0.55, 0.6, 1.0);
      vec3 col = mix(teal, peri, smoothstep(0.2,0.9,band));
      gl_FragColor = vec4(col * glow * 0.5, glow * 0.35);
    }
  `,
});
const aurora = new THREE.Mesh(auroraGeo, auroraMat);
aurora.position.set(0, 2, -22);
scene.add(aurora);

/* =========================================================
   Center logo : Ring (torus) + "LLM" — chrome glass, rotates
   ========================================================= */
const logo = new THREE.Group();
logo.scale.setScalar(0.78); // a touch smaller — later sections use a larger logo
scene.add(logo);

// Clear refracting glass — used for BOTH the ring and the letters so they
// are lit identically. Transmission refracts the background; iridescence gives
// rainbow edges; specular highlights travel across as it rotates.
// iridescent chrome (same look as the spine) for the LLM ring + letters + spiral
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x6c7280,            // darker metal tint (logo only; spine stays brighter)
  metalness: 1.0,
  roughness: 0.45,
  transmission: 0.0,          // opaque metal (not see-through)
  envMapIntensity: 1.25,
  clearcoat: 0.7,
  clearcoatRoughness: 0.3,
  iridescence: 1.0,           // thin-film rainbow sheen
  iridescenceIOR: 1.6,
  iridescenceThicknessRange: [120, 760],
  transparent: false,
});

// Outer ring
const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.16, 48, 220), glassMat);
logo.add(ring);

// Vertical spiral tail — a double helix of glass. Each strand starts ATTACHED to
// the ring at its widest point (its left/right edge, x = ±ring radius, y = 0),
// then spirals downward and the two cross to a point. Rotates with the logo.
const RING_R = 2.0;
class HelixCurve extends THREE.Curve {
  constructor(turns, topR, height, topY, phase) {
    super();
    this.turns = turns; this.topR = topR; this.height = height; this.topY = topY; this.phase = phase;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.phase + t * this.turns * Math.PI * 2;
    const r = this.topR * (1.0 - t); // taper to a crossing point at the bottom
    return target.set(Math.cos(a) * r, this.topY - t * this.height, Math.sin(a) * r);
  }
}
for (let s = 0; s < 2; s++) {
  // phase 0 -> starts at the ring's right edge (+R, 0); phase PI -> left edge (-R, 0)
  const curve = new HelixCurve(0.5, RING_R, 5.5, 0.0, s * Math.PI);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.05, 12, false), glassMat);
  logo.add(tail);
}

// centre of the logo: brain-top.glb (replaces the "LLM" letters), ring + spiral unchanged
const llmGroup = new THREE.Group();
logo.add(llmGroup);
gltfLoader.load("assets/models/brain-top-opt.glb", (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) o.material = glassMat; });
  let box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = 3.4 / (Math.max(size.x, size.y, size.z) || 1); // larger, fills the ring more
  model.scale.setScalar(s);
  model.rotation.y = Math.PI / 2; // rotate horizontally to face the camera
  box = new THREE.Box3().setFromObject(model);
  const c = new THREE.Vector3(); box.getCenter(c);
  model.position.sub(c); // centre it
  llmGroup.add(model);
  console.log("brain-top.glb loaded");
}, undefined, () => console.warn("assets/models/brain-top.glb not found"));

/* Soft luminous halo behind the logo so the clear glass reads as lit-from-behind
   (a faint glow, not a solid colour — keeps the transparent look). */
function makeGlow() {
  const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grd.addColorStop(0.0, "rgba(200,232,255,0.85)");
  grd.addColorStop(0.28, "rgba(150,175,255,0.42)");
  grd.addColorStop(1.0, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow(), blending: THREE.AdditiveBlending,
  depthWrite: false, transparent: true, opacity: 0.8,
}));
glow.scale.set(6.0, 6.0, 1);
glow.position.set(0, 0, -1.3);
scene.add(glow);

/* About-section text drawn in 3D so it sits BEHIND the logo (ring + spiral) and
   scrolls up off-screen as you move into the spine section. */
function makeAboutCanvas() {
  const w = 2048, h = 1024;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  function draw() {
    g.clearRect(0, 0, w, h);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    const tx = 150; let ty = 520; const tf = 132;
    g.lineWidth = 2.5; g.strokeStyle = "rgba(255,255,255,0.85)";
    g.font = `600 ${tf}px 'Chakra Petch', sans-serif`;
    g.strokeText("WHERE AI", tx, ty); ty += tf * 0.98;
    g.strokeText("SHINES BRIGHTEST", tx, ty); ty += tf * 0.62;
    g.font = `500 ${Math.round(tf * 0.46)}px 'Shippori Mincho', serif`;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.fillText("〜AIが最も輝く場所〜", tx, ty);
    g.font = `400 30px 'Space Mono', monospace`;
    g.fillStyle = "rgba(230,238,255,0.82)";
    const cx = w - 760; let cy = 430;
    const lines = ["Established 2025.", "", "We fuse light, logic & intelligence as", "one",
      "in-house team of makers.", "", "Our toolset turns ideas into immersive,",
      "high-performance digital experiences."];
    for (const ln of lines) { g.fillText(ln, cx, cy); cy += 44; }
  }
  draw();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(); tex.needsUpdate = true; });
  return tex;
}
const aboutTextMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(26, 13),
  new THREE.MeshBasicMaterial({ map: makeAboutCanvas(), transparent: true, depthWrite: false })
);
aboutTextMesh.position.set(0, 0, -1.8); // behind the logo
aboutTextMesh.visible = false;
scene.add(aboutTextMesh);

/* =========================================================
   Pre-built FOREST (reference approach)
   The whole forest — trees (trunk + canopy) + ground — is built once as a
   fixed particle structure inside `forest` (a Group). At the TOP it sits low
   and tilted, so only the central tree's canopy peeks in around the logo;
   on scroll the group rotates up from below to reveal the full forest.
   Idle float happens in the vertex shader (GPU) so we can afford many points.
   ========================================================= */
const PARTICLE_COUNT = 24000;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PARTICLE_COUNT * 3);
const pSize = new Float32Array(PARTICLE_COUNT);
const pColor = new Float32Array(PARTICLE_COUNT * 3);
const pPhase = new Float32Array(PARTICLE_COUNT);

const palette = [
  new THREE.Color(0xffffff),
  new THREE.Color(0xbfeaff),
  new THREE.Color(0x9ca5ff),
  new THREE.Color(0xffe7b0),
];

// Tree positions: a tall central tree (seen at TOP near the logo) + a scattered ring
const trees = [{ x: 0, z: 0, h: 8.2, canopy: 2.6 }];
const RING_TREES = 16;
for (let k = 0; k < RING_TREES; k++) {
  const a = Math.random() * Math.PI * 2;
  const rad = 3.5 + Math.random() * 11;
  trees.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, h: 4.5 + Math.random() * 4.5, canopy: 1.4 + Math.random() * 1.4 });
}

function setP(i, x, y, z, size, col) {
  pPos[i*3] = x; pPos[i*3+1] = y; pPos[i*3+2] = z;
  pSize[i] = size;
  pColor[i*3] = col.r; pColor[i*3+1] = col.g; pColor[i*3+2] = col.b;
  pPhase[i] = Math.random() * Math.PI * 2;
}

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const c = palette[(Math.random() * palette.length) | 0];
  if (Math.random() < 0.38) {
    // ---- ground: rolling disc of foliage ----
    const gr = Math.sqrt(Math.random()) * 16;
    const ga = Math.random() * Math.PI * 2;
    const x = Math.cos(ga) * gr;
    const z = Math.sin(ga) * gr;
    const y = Math.sin(gr * 0.4 + ga) * 0.6 + Math.random() * 0.4;
    setP(i, x, y, z, Math.random() < 0.1 ? 1.8 + Math.random() * 1.6 : 0.5 + Math.random() * 1.2, c);
  } else {
    // ---- tree: thin trunk + conical (Christmas-tree) canopy ----
    const tr = Math.random() < 0.28 ? trees[0] : trees[1 + ((Math.random() * RING_TREES) | 0)];
    const which = Math.random();
    let x, y, z;
    if (which < 0.22) {
      // trunk: narrow column (mostly hidden inside the cone base)
      const hh = Math.random();
      const aa = Math.random() * Math.PI * 2;
      const rr = 0.10 + Math.random() * 0.16;
      x = tr.x + Math.cos(aa) * rr;
      z = tr.z + Math.sin(aa) * rr;
      y = hh * tr.h * 0.40;
    } else {
      // canopy: a cone — wide at the base, narrowing to a point, with subtle tiers
      const hh = Math.pow(Math.random(), 0.8); // 0 base .. 1 apex (a touch denser low)
      const tier = 0.55 + 0.45 * Math.abs(Math.sin(hh * Math.PI * 3.0)); // layered tiers
      const coneR = tr.canopy * 1.25 * (1.0 - hh) * tier;
      const aa = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * coneR;
      x = tr.x + Math.cos(aa) * rr;
      z = tr.z + Math.sin(aa) * rr;
      y = tr.h * 0.30 + hh * (tr.h * 0.80);
    }
    setP(i, x, y, z, Math.random() < 0.1 ? 1.7 + Math.random() * 1.3 : 0.5 + Math.random() * 1.1, c);
  }
}
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1));
pGeo.setAttribute("aColor", new THREE.BufferAttribute(pColor, 3));
pGeo.setAttribute("aPhase", new THREE.BufferAttribute(pPhase, 1));

// circular sprite via canvas
function makeSprite() {
  const s = 64;
  const cv = document.createElement("canvas"); cv.width = cv.height = s;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(255,255,255,0.7)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uTex: { value: makeSprite() }, uScale: { value: window.innerHeight },
    uForest: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 },
  },
  vertexShader: /* glsl */`
    attribute float aSize; attribute vec3 aColor; attribute float aPhase;
    varying vec3 vColor; uniform float uScale; uniform float uTime; uniform float uForest;
    void main(){
      vColor = aColor;
      vec3 p = position;
      // gentle in-place idle float (computed on GPU)
      p.x += sin(uTime * 0.5 + aPhase) * 0.07;
      p.y += sin(uTime * 0.4 + aPhase * 1.3) * 0.09;
      p.z += cos(uTime * 0.45 + aPhase) * 0.07;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = aSize * (1.0 + uForest * 0.5) * (uScale / -mv.z) * 0.06;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    varying vec3 vColor; uniform sampler2D uTex; uniform float uForest; uniform float uFade;
    void main(){
      vec4 t = texture2D(uTex, gl_PointCoord);
      vec3 moss = vColor * vec3(0.40, 0.85, 0.30) + vec3(0.04, 0.16, 0.02); // mossy green/yellow
      vec3 col = mix(vColor, moss, uForest);
      gl_FragColor = vec4(col, 1.0) * t * uFade;
    }
  `,
});
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false;
const forest = new THREE.Group();
forest.add(particles);
scene.add(forest);

/* =========================================================
   TOP glitter — motes around/below the logo. On scroll they swirl and
   rise (beat A); then they fade out as the forest takes over.
   ========================================================= */
const GCOUNT = 4500;
const gGeo = new THREE.BufferGeometry();
const gPos = new Float32Array(GCOUNT * 3);
const gData = new Float32Array(GCOUNT * 4); // radius, angle, phase, y0
const gOff = new Float32Array(GCOUNT * 3);  // static scatter offset (x,y,z) — playful spread
const gSize = new Float32Array(GCOUNT);
const gColor = new Float32Array(GCOUNT * 3);
for (let i = 0; i < GCOUNT; i++) {
  let radius, y0;
  if (Math.random() < 0.98) {
    // core: clustered around / below the logo (keeps the logo framed)
    radius = Math.pow(Math.random(), 1.7) * 3.6 + 0.2;
    y0 = -2.0 - Math.pow(Math.random(), 1.3) * 6.0; // mostly below
  } else {
    // just a tiny handful of playful scattered motes — to the sides, only up
    // to about the logo's height (not high above it)
    radius = 2.4 + Math.random() * 4.2;
    y0 = -3.0 + Math.random() * 4.5;               // up to ~logo height (+1.5)
  }
  const angle = Math.random() * Math.PI * 2;
  // very subtle asymmetric scatter incl. front/back depth (not a clean cylinder)
  const ox = (Math.random() - 0.5) * 0.4;
  const oy = (Math.random() - 0.5) * 0.35;
  const oz = (Math.random() - 0.5) * 0.5;
  gData[i*4+0] = radius; gData[i*4+1] = angle;
  gData[i*4+2] = Math.random() * Math.PI * 2; gData[i*4+3] = y0;
  gOff[i*3+0] = ox; gOff[i*3+1] = oy; gOff[i*3+2] = oz;
  gPos[i*3+0] = Math.cos(angle) * radius + ox;
  gPos[i*3+1] = y0 + oy;
  gPos[i*3+2] = Math.sin(angle) * radius + oz;
  gSize[i] = Math.random() < 0.12 ? 2.4 + Math.random() * 1.8 : 0.5 + Math.random() * 1.3;
  const c = palette[(Math.random() * palette.length) | 0];
  gColor[i*3+0] = c.r; gColor[i*3+1] = c.g; gColor[i*3+2] = c.b;
}
gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
gGeo.setAttribute("aSize", new THREE.BufferAttribute(gSize, 1));
gGeo.setAttribute("aColor", new THREE.BufferAttribute(gColor, 3));

// Each glitter mote is assigned a real spot in the forest (sampled from the
// forest's own particles) so it can FLOW IN and merge — not just fade out.
const gHome = new Float32Array(GCOUNT * 3);
for (let i = 0; i < GCOUNT; i++) {
  const idx = (Math.random() * PARTICLE_COUNT) | 0;
  gHome[i*3+0] = pPos[idx*3+0];
  gHome[i*3+1] = pPos[idx*3+1];
  gHome[i*3+2] = pPos[idx*3+2];
}

const gMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTex: { value: makeSprite() }, uScale: { value: window.innerHeight }, uForest: { value: 0 }, uFade: { value: 1 } },
  vertexShader: /* glsl */`
    attribute float aSize; attribute vec3 aColor;
    varying vec3 vColor; uniform float uScale;
    void main(){
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (uScale / -mv.z) * 0.06;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    varying vec3 vColor; uniform sampler2D uTex; uniform float uForest; uniform float uFade;
    void main(){
      vec4 t = texture2D(uTex, gl_PointCoord);
      vec3 moss = vColor * vec3(0.40, 0.85, 0.30) + vec3(0.04, 0.16, 0.02);
      vec3 col = mix(vColor, moss, uForest); // greens up as it joins the forest
      gl_FragColor = vec4(col, 1.0) * t * uFade;
    }
  `,
});
const glitter = new THREE.Points(gGeo, gMat);
glitter.frustumCulled = false;
forest.add(glitter); // child of the forest so it moves with it once merged

/* =========================================================
   Section 4 — WORK : a glass "spine" with project cards orbiting it.
   Built once, hidden until the Work section scrolls in.
   ========================================================= */
const work = new THREE.Group();
work.visible = false;
scene.add(work);

// Diagonal-dissolve clip planes: logo (old) shows on one side of the line,
// spine + cards (new) on the other. Constant 1000 = "keep everything" (inactive).
const clipN = new THREE.Vector3(-1, 0.5, 0).normalize(); // sweeps top-left -> bottom-right
const spinePlane = new THREE.Plane(clipN.clone(), 1000);
const logoPlane  = new THREE.Plane(clipN.clone().negate(), 1000);
// iridescent chrome (not clear glass) — metallic base + thin-film rainbow sheen
const spineMat = glassMat.clone();
spineMat.transmission = 0.0;       // opaque metal (no longer see-through -> not black)
spineMat.transparent = false;
spineMat.metalness = 1.0;
spineMat.roughness = 0.42;         // mid gloss
spineMat.color = new THREE.Color(0xb4bece); // cool silver metal tint
spineMat.iridescence = 1.0;
spineMat.iridescenceIOR = 1.6;
spineMat.iridescenceThicknessRange = [120, 760]; // pink / blue / purple rainbow
spineMat.envMapIntensity = 1.6;    // reflections between the two extremes
spineMat.clearcoat = 0.7;
spineMat.clearcoatRoughness = 0.3;
glassMat.clippingPlanes = [logoPlane];   // logo & ring & tails -> "old" side
spineMat.clippingPlanes = [spinePlane];  // spine -> "new" side

// spine: stacked glass vertebrae along Y (placeholder until spine.glb loads)
const spine = new THREE.Group();
for (let i = 0; i < 15; i++) {
  const y = -5.6 + i * 0.8;
  const vert = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), spineMat);
  vert.scale.set(1.0, 0.52, 1.0);
  vert.position.y = y;
  spine.add(vert);
  const disk = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.07, 12, 28), spineMat);
  disk.rotation.x = Math.PI / 2;
  disk.position.y = y + 0.4;
  spine.add(disk);
}
spine.rotation.y = Math.PI; // face the other way
work.add(spine);

// Load a real spine model if present (assets/models/spine.glb). Until then the
// placeholder above is shown. On success it's swapped in, glassed, and fitted.
gltfLoader.load(
  "assets/models/spine-opt.glb",
  (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) o.material = spineMat; });
    // fit to the spine slot (~11 units tall) and centre at the origin
    let box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = 16 / (size.y || 1); // taller spine = more impact
    model.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3(); box.getCenter(center);
    model.position.sub(center);
    spine.clear();        // remove the placeholder vertebrae
    spine.add(model);
    console.log("spine.glb loaded");
  },
  undefined,
  () => console.warn("assets/models/spine.glb not found — using placeholder spine")
);

// project cards orbiting the spine
function makeCardTexture(title, tag, c1, c2, textOnly) {
  const w = 720, h = 450;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  const maxW = w - 90;
  const TITLE_FONT = "'Shippori Mincho', serif";

  // break only at natural points: after "・" / "、" / "/" / space — never mid-word
  const tokenize = (text) => {
    const tokens = []; let cur = "";
    for (const ch of text) {
      cur += ch;
      if (ch === "・" || ch === "、" || ch === "／" || ch === "/" || ch === " ") { tokens.push(cur); cur = ""; }
    }
    if (cur) tokens.push(cur);
    return tokens;
  };
  const wrapLines = (fs) => {
    g.font = `600 ${fs}px ${TITLE_FONT}`;
    const tokens = tokenize(title);
    const lines = []; let cur = "";
    for (const tk of tokens) {
      if (cur && g.measureText(cur + tk).width > maxW) { lines.push(cur); cur = tk; }
      else cur += tk;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // lighten a "#rrggbb" toward white (f = fraction of the original colour kept)
  const mixWhite = (hex, f) => {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16), gg = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    const mv = (v) => Math.round(v * f + 255 * (1 - f));
    return `rgb(${mv(r)}, ${mv(gg)}, ${mv(b)})`;
  };

  function draw() {
    const r = 40;
    g.clearRect(0, 0, w, h);
    if (!textOnly) {
      g.beginPath();
      g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r);
      g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath();
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, c1); grd.addColorStop(1, c2);
      g.fillStyle = grd; g.fill();
    }
    g.textAlign = "center";
    // when overlaying a video, a drop shadow makes the text read AND look lifted off the card
    if (textOnly) { g.shadowColor = "rgba(0,0,0,0.85)"; g.shadowBlur = 16; g.shadowOffsetY = 7; }

    let fs = 39, lines = wrapLines(fs);
    while (lines.length > 3 && fs > 24) { fs -= 3; lines = wrapLines(fs); }
    g.font = `600 ${fs}px ${TITLE_FONT}`;
    g.fillStyle = "rgba(255,255,255,0.97)";
    if ("letterSpacing" in g) g.letterSpacing = "0.5px";
    const lh = fs * 1.26;
    let ty = h / 2 - (lines.length - 1) * lh / 2 - 16;
    for (const ln of lines) { g.fillText(ln.trim(), w / 2, ty); ty += lh; }

    // category tag: colour with the card's accent (lightened, like the catch copy),
    // but keep the "/" separator white
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    g.font = "26px 'Space Mono', monospace";
    const tagCol = mixWhite(c2, 0.62);
    const parts = tag.split(/(\/)/); // keep the "/" tokens
    let total = 0; for (const pt of parts) total += g.measureText(pt).width;
    g.textAlign = "left";
    let tx = w / 2 - total / 2;
    for (const pt of parts) {
      g.fillStyle = pt === "/" ? "rgba(255,255,255,0.9)" : tagCol;
      g.fillText(pt, tx, ty + 18);
      tx += g.measureText(pt).width;
    }
    g.textAlign = "center";
    g.shadowBlur = 0; g.shadowOffsetY = 0;
  }

  draw();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(); tex.needsUpdate = true; });
  return tex;
}
const projects = [
  {
    t: "AI活用型 Web・アプリケーション開発事業", g: "AI Web & App Development", a: "#13303d", b: "#0e7c7b",
    video: "assets/videos/card1-opt.mp4",
    catch: "AIの力で、ホームページやアプリを「早く・安く・高品質」に",
    lead: "企画から実装、保守まで全工程に生成AIを導入。要件定義の高速化やコード生成を駆使し、従来の手法を凌駕する「短納期・高品質・低コスト」な開発を実現します。",
    body: "「こんなサイトが欲しい」「こんなアプリがあれば便利なのに」そんなアイデアを形にします。企画段階から完成後のメンテナンスまで、すべての工程にAIを活用することで、従来よりも短い期間・低いコストで、クオリティの高いものをお届けできます。",
    more: "web-development.html", // 詳細ページ
  },
  {
    t: "AIシステムインテグレーション・DX推進事業", g: "AI System Integration / DX", a: "#241f4a", b: "#6c5ce7",
    video: "assets/videos/card2-opt.mp4",
    catch: "会社の仕事のやり方を、AIでもっと楽に・賢く",
    lead: "業務課題の抽出からAI導入、定着化までトータルサポート。データ整備や業務フロー再構築にも踏み込み、ビジネスモデルそのものをAI前提へと変革させます。",
    body: "「毎日の事務作業が大変」「紙の書類が多すぎる」そうした日々の業務の悩みを分析し、AIを使って効率化します。ただツールを導入するだけでなく、現場に定着するところまで見据えた仕組みづくりを行います。",
    more: "dx.html", // 詳細ページ
  },
  {
    t: "データコンサルティング・MLソリューション事業", g: "Data Consulting / ML Solutions", a: "#3a1f3d", b: "#c84bd1",
    video: "assets/videos/card3-opt.mp4",
    catch: "会社に眠っているデータから、「売上アップのヒント」を見つけ出す",
    lead: "ビッグデータ解析や特化型ML（機械学習）モデルの構築により、データから利益を創出。需要予測やリスク管理など、経営判断に直結する「データドリブン経営」を支援します。",
    body: "日々の売上記録やお客様の情報など、蓄積されたデータをAIが分析し、「次に何が売れそうか」「どこにリスクがあるか」を予測します。勘や経験だけに頼らず、データに基づいた経営判断ができるようになります。",
    more: "data-ml.html", // 詳細ページ
  },
  {
    t: "AI人材リスキリング・教育事業", g: "AI Reskilling / Education", a: "#2d1b3a", b: "#9ca5ff",
    video: "assets/videos/card5-opt.mp4",
    catch: "「AIを使える人材」を、実践的なカリキュラムで育てる",
    lead: "開発現場のノウハウを元にした実践的なカリキュラムで、即戦力となるAI人材を育成。優秀な修了生の採用エコシステムも構築し、業界全体の人材不足解消に貢献します。",
    body: "実際の開発現場で培ったノウハウをもとに、教科書的な知識だけでなく、すぐに仕事で活かせるスキルが身につくカリキュラムを提供しています。企業の研修や個人のスキルアップなど、目的に合わせた学び方をご用意しています。",
    more: "reskilling.html", // 詳細ページ
  },
];
// GPU事業はWorkの周回カードから外し、Finaleで粒子が形成する「ヒーローカード」になる
const finaleProject = {
  t: "GPUインフラ・コンピューティング事業", g: "GPU Infrastructure / Computing", a: "#0f2a2c", b: "#2bb3a3",
  video: "assets/videos/card4-opt.mp4",
  catch: "AIを動かす「超高性能なコンピュータ環境」を、すぐ使える状態で提供",
  lead: "世界的に不足する高性能GPUサーバー環境を構築し、計算資源を安定提供。環境最適化や保守運用を含めたマネージドサービスを展開し、インフラ面からAI開発を支えます。",
  body: "AIの開発や運用には、普通のパソコンでは到底足りない膨大な計算能力が必要です。世界的に不足しているこの高性能な計算環境を、面倒なセットアップや管理の手間なく、すぐにご利用いただけます。",
  more: "gpu.html", // 詳細ページ
};
const cardGeo = new THREE.PlaneGeometry(4.8, 3.0); // larger cards
const cards = [];
const cardVideos = []; // <video> elements to (re)start on first user gesture
const CARD_ANGLE = 1.05;  // angular offset between successive cards
const CARD_STEP  = 2.0;   // vertical descent between successive cards (staircase)
const CARD_RADIUS = 3.4;

// builds a looping, muted VideoTexture from a file (falls back silently if missing)
function makeCardVideoTexture(src) {
  const v = document.createElement("video");
  v.src = src; v.loop = true; v.muted = true; v.defaultMuted = true;
  v.playsInline = true; v.autoplay = true; v.preload = "auto";
  v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
  v.play().catch(() => {});
  cardVideos.push(v);
  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
}

projects.forEach((p, i) => {
  const videoSrc = p.video;
  // main face: the video (semi-transparent, so the spine still shows through)
  const mat = new THREE.MeshBasicMaterial({
    map: makeCardVideoTexture(videoSrc),
    color: new THREE.Color(0x8a8a8a), // darken the video a touch (overlay) so text reads
    transparent: true, opacity: 0.0, depthWrite: false,
    side: THREE.DoubleSide,
    clippingPlanes: [spinePlane],
  });
  const card = new THREE.Mesh(cardGeo, mat);
  // descending spiral: card 0 front-centre (angle 0, z toward camera), each next
  // one rotated + a step lower -> a staircase down around the spine
  const ang = i * CARD_ANGLE;
  card.position.set(Math.sin(ang) * CARD_RADIUS, -i * CARD_STEP, Math.cos(ang) * CARD_RADIUS);
  card.lookAt(card.position.x * 2, card.position.y, card.position.z * 2); // face outward
  card.userData.project = p;

  // text overlay (title + category) drawn on top of the video, on a clear plane
  const textMat = new THREE.MeshBasicMaterial({
    map: makeCardTexture(p.t, p.g, p.a, p.b, true),
    transparent: true, opacity: 0.0, depthWrite: false,
    side: THREE.DoubleSide,
    clippingPlanes: [spinePlane],
  });
  const textPlane = new THREE.Mesh(cardGeo, textMat);
  textPlane.position.z = 0.18; // float the text slightly out in front of the card
  card.add(textPlane);
  card.userData.textPlane = textPlane;

  cards.push(card);
  work.add(card);
});

// browsers may block autoplay until a gesture — kick the videos on first interaction
["pointerdown", "wheel", "keydown", "touchstart"].forEach((ev) =>
  window.addEventListener(ev, () => cardVideos.forEach((v) => v.play().catch(() => {})), { once: true })
);

/* =========================================================
   Section 5 — FINALE : particles rain down and converge into a brain
   (from brain.glb) with "LLM" letters formed of particles in the centre.
   ========================================================= */
function sampleText(text, count, width, height, zPos) {
  const cw = 640, ch = 320;
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, cw, ch);
  g.fillStyle = "#fff"; g.font = "bold 200px monospace";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, cw / 2, ch / 2);
  const data = g.getImageData(0, 0, cw, ch).data;
  const px = [];
  for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) {
    if (data[(y * cw + x) * 4] > 128) px.push([x, y]);
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = px.length ? px[(Math.random() * px.length) | 0] : [cw / 2, ch / 2];
    out.push([(p[0] / cw - 0.5) * width, -(p[1] / ch - 0.5) * height, zPos + (Math.random() - 0.5) * 0.3]);
  }
  return out;
}

function sampleTextLines(lines, count, width, height, zPos) {
  const cw = 1536, ch = 768; // hi-res sampling -> crisper strokes (the "i" dot/stem gap reads)
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, cw, ch);
  g.fillStyle = "#fff"; g.textBaseline = "middle"; g.textAlign = "left";
  const lineH = ch / lines.length;
  const fs = Math.min(lineH * 0.66, cw / 8); // a touch larger glyphs
  g.font = `bold ${fs}px monospace`;
  const gap = fs * 0.36; // more space between adjacent letters -> easier to tell apart
  lines.forEach((ln, i) => {
    const y = lineH * (i + 0.5);
    const widths = []; let total = 0;
    for (const c of ln) { const w = g.measureText(c).width; widths.push(w); total += w + gap; }
    total -= gap;
    let x = cw / 2 - total / 2;
    for (let c = 0; c < ln.length; c++) {
      g.fillStyle = c === 0 ? "rgb(0,0,255)" : "rgb(255,255,255)"; // tag the first letter blue
      g.fillText(ln[c], x, y); x += widths[c] + gap;
    }
  });
  const data = g.getImageData(0, 0, cw, ch).data;
  const px = [];
  for (let y = 0; y < ch; y += 1) for (let x = 0; x < cw; x += 1) {
    const idx = (y * cw + x) * 4, r = data[idx], b = data[idx + 2];
    if (r > 128 || b > 128) px.push([x, y, (b > 128 && r < 128) ? 1 : 0]); // [x, y, isFirstLetter]
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = px.length ? px[(Math.random() * px.length) | 0] : [cw/2, ch/2, 0];
    out.push([(p[0]/cw - 0.5) * width, -(p[1]/ch - 0.5) * height, zPos + (Math.random()-0.5)*0.3, p[2]]);
  }
  return out;
}

const FINALE_COUNT = 60000;   // lots of particles for the billowing (cumulonimbus) clumps
const N_WORD = 40000;         // form the card + wordmark (denser); the rest are cloud-only
const fnGeo = new THREE.BufferGeometry();
const fnPos = new Float32Array(FINALE_COUNT * 3);
const fnStart = new Float32Array(FINALE_COUNT * 3);
const fnTarget = new Float32Array(FINALE_COUNT * 3);
const fnRoof = new Float32Array(FINALE_COUNT * 3); // up near the roof — particles rain from here
const fnSize = new Float32Array(FINALE_COUNT);
const fnPhase = new Float32Array(FINALE_COUNT);
const fnLLM = new Float32Array(FINALE_COUNT); // 1 = an "LLM" letter particle, 0 = brain
const fnNormal = new Float32Array(FINALE_COUNT * 3); // pseudo-normal for lighting (lit discs)
const fnRand = new Float32Array(FINALE_COUNT);       // per-disc sparkle variation
const fnDark = new Float32Array(FINALE_COUNT);       // 1 = first-letter particle (darkened)
const fnExtra = new Float32Array(FINALE_COUNT);      // 1 = cloud-only particle (fades, no wordmark)

// Big billowing clumps in a TALL column around the spine, so that as it lifts
// there are always clumps in view (incl. behind the last card).
const N_CLUMPS = 26;
const clumpCenters = [];
for (let c = 0; c < N_CLUMPS; c++) {
  const a = Math.random() * Math.PI * 2;
  const r = 0.8 + Math.random() * 2.2;
  const size = 0.9 + Math.random() * 1.8; // bigger -> billowing masses
  clumpCenters.push([Math.cos(a) * r, -14 + Math.random() * 23, Math.sin(a) * r, size]);
}
for (let i = 0; i < FINALE_COUNT; i++) {
  const c = clumpCenters[(Math.random() * N_CLUMPS) | 0];
  const rr = Math.pow(Math.random(), 1.2) * c[3]; // dense core, large billowing spread
  const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1);
  fnStart[i*3+0] = c[0] + Math.sin(v) * Math.cos(u) * rr;
  fnStart[i*3+1] = c[1] + Math.cos(v) * rr * 1.1;
  fnStart[i*3+2] = c[2] + Math.sin(v) * Math.sin(u) * rr;
  // roof position (scattered above — particles rain down from here)
  fnRoof[i*3+0] = (Math.random() - 0.5) * 8;
  fnRoof[i*3+1] = 5 + Math.random() * 6;
  fnRoof[i*3+2] = (Math.random() - 0.5) * 8;
  fnPos[i*3+0] = fnStart[i*3+0]; fnPos[i*3+1] = fnStart[i*3+1]; fnPos[i*3+2] = fnStart[i*3+2];
  fnSize[i] = Math.random() < 0.1 ? 2.2 + Math.random() * 1.6 : 0.7 + Math.random() * 1.2;
  fnPhase[i] = Math.random() * Math.PI * 2;
  fnRand[i] = Math.random();
}
// The first N_WORD particles form the 3-line wordmark (Lumina / Logic / Minds);
// the rest are cloud-only — they disperse upward and fade as the wordmark forms.
/* ワードマークは横幅 10.5 とカード(6.0)より大きく、同じ縮小率では収まらないので
   専用の係数を持つ。生成時に一度だけ確定させ、以降の判定もこの値から導く。 */
const WORD_GAIN = 2.1;
const WORD_SCALE = Math.min(1, Math.max(0.5, (camera.aspect / DESIGN_ASPECT) * WORD_GAIN));
const WORD_W = 10.5 * WORD_SCALE;
const WORD_H = 5.4 * WORD_SCALE;
const WORD_Y = -7.2;                 // 水中でワードマークが座る高さ
const WORD_LINE_GAP = WORD_H / 3;    // 3行ぶんの行間
const wordPts = sampleTextLines(["Lumina", "Logic", "Minds"], N_WORD, WORD_W, WORD_H, 1.1);
for (let i = 0; i < FINALE_COUNT; i++) {
  if (i < N_WORD) {
    const p = wordPts[i];
    // wordmark now forms UNDERWATER (lowered to sit above the hex grid at y -8)
    fnTarget[i*3+0] = p[0]; fnTarget[i*3+1] = p[1] + WORD_Y; fnTarget[i*3+2] = p[2];
    fnLLM[i] = 1.0; fnDark[i] = p[3]; fnExtra[i] = 0;
    const jx = (Math.random() - 0.5) * 0.5, jy = (Math.random() - 0.5) * 0.5;
    const l = Math.hypot(jx, jy, 1);
    fnNormal[i*3+0] = jx / l; fnNormal[i*3+1] = jy / l; fnNormal[i*3+2] = 1 / l;
  } else {
    // cloud-only particle: drifts up and out, then fades (never joins the text)
    fnTarget[i*3+0] = (Math.random() - 0.5) * 24;
    fnTarget[i*3+1] = 3 + Math.random() * 11;
    fnTarget[i*3+2] = (Math.random() - 0.5) * 18;
    fnLLM[i] = 0; fnDark[i] = 0; fnExtra[i] = 1;
    const jx = (Math.random() - 0.5) * 1.2, jy = (Math.random() - 0.5) * 1.2;
    const l = Math.hypot(jx, jy, 1);
    fnNormal[i*3+0] = jx / l; fnNormal[i*3+1] = jy / l; fnNormal[i*3+2] = 1 / l;
  }
}
fnGeo.setAttribute("position", new THREE.BufferAttribute(fnPos, 3));
fnGeo.setAttribute("aSize", new THREE.BufferAttribute(fnSize, 1));
fnGeo.setAttribute("aLLM", new THREE.BufferAttribute(fnLLM, 1));
fnGeo.setAttribute("aNormal", new THREE.BufferAttribute(fnNormal, 3));
fnGeo.setAttribute("aRand", new THREE.BufferAttribute(fnRand, 1));
fnGeo.setAttribute("aExtra", new THREE.BufferAttribute(fnExtra, 1));
fnGeo.setAttribute("aDark", new THREE.BufferAttribute(fnDark, 1));

/* ---- Hidden admin trigger: on the underwater wordmark, click the first letter
   of each line in order — L(Lumina) x5 -> L(Logic) x5 -> M(Minds) x5 — to
   "ascend" to the admin login. The first letter of each line is already tagged
   (aDark), so we can locate each letter's centroid and drop an invisible,
   click-detectable gold glow sprite there. ---- */
const letterHit = [null, null, null]; // [Lumina L, Logic L, Minds M]
{
  const buckets = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // sumX, sumY, count per line
  for (let i = 0; i < N_WORD; i++) {
    if (fnDark[i] !== 1) continue;
    const y = fnTarget[i * 3 + 1];
    const li = y > WORD_Y + WORD_LINE_GAP / 2 ? 0
              : (y > WORD_Y - WORD_LINE_GAP / 2 ? 1 : 2);
    buckets[li][0] += fnTarget[i * 3 + 0];
    buckets[li][1] += y;
    buckets[li][2] += 1;
  }
  for (let l = 0; l < 3; l++) {
    if (buckets[l][2] > 0) {
      letterHit[l] = new THREE.Vector3(buckets[l][0] / buckets[l][2], buckets[l][1] / buckets[l][2], 1.1);
    }
  }
}
const letterSprites = [];
const letterFlash = [0, 0, 0];
for (let l = 0; l < 3; l++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlow(), color: 0xf1c96b, transparent: true, opacity: 0,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  sp.scale.set(1.6 * WORD_SCALE, 1.6 * WORD_SCALE, 1);
  if (letterHit[l]) sp.position.copy(letterHit[l]);
  sp.renderOrder = 6;
  sp.visible = false;
  sp.userData.letter = l;
  scene.add(sp);
  letterSprites.push(sp);
}

/* ---- Ascension v2 FX props (hidden until the hidden trigger fires) ---- */
const ASC_CORE = new THREE.Vector3(0, -7.2, 1.1); // wordmark centre = launch core
const _fwd = new THREE.Vector3();                 // scratch: camera forward

// bright light core -> erupts into a vertical column during warp
const coreSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow(), color: 0xfff0be, transparent: true, opacity: 0,
  depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
}));
coreSprite.position.copy(ASC_CORE); coreSprite.renderOrder = 7; coreSprite.visible = false;
scene.add(coreSprite);

// surface-break god-ray flare (placed in front of the lens)
const flareSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow(), color: 0xeaf6ff, transparent: true, opacity: 0,
  depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
}));
flareSprite.renderOrder = 8; flareSprite.visible = false;
scene.add(flareSprite);

// LLM ring residual that flashes inside the white at the end
function makeRingTex() {
  const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const g = cv.getContext("2d");
  g.strokeStyle = "rgba(241,201,107,1)"; g.lineWidth = 10;
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3;
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.30, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const ringSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeRingTex(), color: 0xffffff, transparent: true, opacity: 0,
  depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
}));
ringSprite.renderOrder = 9; ringSprite.visible = false;
scene.add(ringSprite);

// speed streaks: a tall column of vertical light streaks the camera rushes through
function makeStreakTex() {
  const w = 16, h = 128, cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.5, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(w * 0.4, 0, w * 0.2, h);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const STREAKS = 1100;
const stGeo = new THREE.BufferGeometry();
const stPos = new Float32Array(STREAKS * 3);
const stCol = new Float32Array(STREAKS * 3);
const stPal = [new THREE.Color(0xffffff), new THREE.Color(0xbfeaff), new THREE.Color(0xf1c96b), new THREE.Color(0x9ca5ff)];
for (let i = 0; i < STREAKS; i++) {
  const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 8.5;
  stPos[i * 3] = Math.cos(a) * r;
  stPos[i * 3 + 1] = -12 + Math.random() * 30;
  stPos[i * 3 + 2] = 1.1 + Math.sin(a) * r * 0.5;
  const c = stPal[(Math.random() * stPal.length) | 0];
  stCol[i * 3] = c.r; stCol[i * 3 + 1] = c.g; stCol[i * 3 + 2] = c.b;
}
stGeo.setAttribute("position", new THREE.BufferAttribute(stPos, 3));
stGeo.setAttribute("aColor", new THREE.BufferAttribute(stCol, 3));
const stMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  uniforms: { uTex: { value: makeStreakTex() }, uScale: { value: window.innerHeight }, uWarp: { value: 0 } },
  vertexShader: /* glsl */`
    attribute vec3 aColor; varying vec3 vCol; uniform float uScale; uniform float uWarp;
    void main(){ vCol = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = (4.0 + uWarp * 64.0) * (uScale / -mv.z) * 0.06;
      gl_Position = projectionMatrix * mv; }
  `,
  fragmentShader: /* glsl */`
    varying vec3 vCol; uniform sampler2D uTex; uniform float uWarp;
    void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol, 1.0) * t * uWarp; }
  `,
});
const streaks = new THREE.Points(stGeo, stMat);
streaks.frustumCulled = false; streaks.visible = false; streaks.renderOrder = 6;
scene.add(streaks);

// The erupted particles form a ROCKET (rocket.glb) charging forward through space.
// Sampled from the model surface; its long axis is auto-aligned to the flight axis.
const ENT_R = 3.2;
const shapeRocket = new Float32Array(FINALE_COUNT * 3);
for (let i = 0; i < FINALE_COUNT; i++) { // sphere fallback until the glb is sampled
  const u = fnPhase[i], v = fnRand[i], phi = Math.acos(2 * v - 1);
  shapeRocket[i*3+0] = Math.sin(phi) * Math.cos(u) * ENT_R;
  shapeRocket[i*3+1] = Math.cos(phi) * ENT_R;
  shapeRocket[i*3+2] = Math.sin(phi) * Math.sin(u) * ENT_R;
}
const SHAPES = [shapeRocket];
gltfLoader.load("assets/models/rocket-opt.glb", (gltf) => {
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) return;
  gltf.scene.updateMatrixWorld(true);
  const sampler = new MeshSurfaceSampler(mesh).build();
  const p = new THREE.Vector3(), raw = new Float32Array(FINALE_COUNT * 3), box = new THREE.Box3();
  for (let i = 0; i < FINALE_COUNT; i++) {
    sampler.sample(p); p.applyMatrix4(mesh.matrixWorld);
    raw[i*3] = p.x; raw[i*3+1] = p.y; raw[i*3+2] = p.z; box.expandByPoint(p);
  }
  const size = new THREE.Vector3(); box.getSize(size);
  const c = new THREE.Vector3(); box.getCenter(c);
  const s = 5.0 / (Math.max(size.x, size.y, size.z) || 1); // smaller particle rocket
  // align the longest axis to Z (nose points -Z, the flight direction)
  const axis = (size.x >= size.y && size.x >= size.z) ? 'x' : (size.y >= size.z ? 'y' : 'z');
  for (let i = 0; i < FINALE_COUNT; i++) {
    const px = (raw[i*3+0] - c.x) * s, py = (raw[i*3+1] - c.y) * s, pz = (raw[i*3+2] - c.z) * s;
    let ox, oy, oz;
    if (axis === 'y') { ox = px; oy = pz; oz = -py; }       // Y-long -> Z
    else if (axis === 'x') { ox = pz; oy = py; oz = -px; }  // X-long -> Z
    else { ox = px; oy = py; oz = pz; }                     // already Z-long
    shapeRocket[i*3+0] = ox; shapeRocket[i*3+1] = oy; shapeRocket[i*3+2] = oz * 0.6; // squash the length
  }
  console.log("rocket.glb sampled; size:", size.x.toFixed(1), size.y.toFixed(1), size.z.toFixed(1), "long:", axis);
}, undefined, () => console.warn("rocket.glb not found"));

// The REAL textured rocket.glb model the particles transform into (cross-fade).
const rocketOuter = new THREE.Group();
rocketOuter.visible = false;
scene.add(rocketOuter);
const rocketMats = [];
// Fresnel RIM: glows only on the silhouette edges (a coloured, additive shell over
// the black rocket) so it reads against the dark without turning it white.
const rocketRimMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color(0x4fd8ff) }, // cool cyan edge (not white)
    uPower: { value: 2.6 }, uStrength: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vN; varying vec3 vView;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vN; varying vec3 vView;
    uniform vec3 uColor; uniform float uPower; uniform float uStrength;
    void main(){
      float rim = pow(1.0 - clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0), uPower);
      gl_FragColor = vec4(uColor * rim * uStrength, rim * uStrength);
    }`,
});
// small orientation correction so the nose points dead-straight (-Z). Flip/adjust
// these if the rocket still leans (yaw = left/right, pitch = up/down).
const ROCKET_YAW = -0.32;   // more left-correction
const ROCKET_PITCH = 0.16;  // raise the nose (was pointing slightly down)
gltfLoader.load("assets/models/rocket-opt.glb", (gltf) => {
  const m = gltf.scene;
  const meshes = [];
  m.traverse((o) => { if (o.isMesh) meshes.push(o); });
  meshes.forEach((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat) => {
      if (!mat) return;
      mat.transparent = true; mat.fog = false;
      mat.__op = (mat.opacity == null ? 1 : mat.opacity); // remember base opacity for the fade
      rocketMats.push(mat); mat.needsUpdate = true;
    });
    // overlay a coincident shell that draws the fresnel edge glow
    const shell = new THREE.Mesh(o.geometry, rocketRimMat);
    shell.renderOrder = 3;
    o.add(shell);
  });
  const box = new THREE.Box3().setFromObject(m);
  const size = new THREE.Vector3(); box.getSize(size);
  const c = new THREE.Vector3(); box.getCenter(c);
  const s = 10.0 / (Math.max(size.x, size.y, size.z) || 1);
  m.scale.setScalar(s);
  m.position.set(-c.x * s, -c.y * s, -c.z * s); // centre at origin
  const inner = new THREE.Group(); inner.add(m);
  const axis = (size.x >= size.y && size.x >= size.z) ? 'x' : (size.y >= size.z ? 'y' : 'z');
  if (axis === 'y') inner.rotation.x = -Math.PI / 2;      // nose -> -Z (flight direction)
  else if (axis === 'x') inner.rotation.y = Math.PI / 2;
  rocketOuter.add(inner);
  console.log("rocket.glb model loaded; long:", axis);
}, undefined, () => console.warn("rocket.glb model not found"));

// forward-charging anchor — the entity charges into -Z toward the distant planets;
// the camera chases from behind. Accelerates and never stops.
function travelAt(s) {
  const adv = Math.pow(Math.max(s - 0.9, 0), 1.5);
  return {
    x: Math.sin(s * 0.4) * 0.4,       // very gentle drift (keeps the flight looking straight)
    y: -7 + Math.min(adv * 1.4, 9.0), // rise out of the water, then level off
    z: 1 - adv * 4.5,                 // charge forward (into the screen) toward the planets
  };
}

// space.glb — a field we punch through mid-flight
const spaceEnv = new THREE.Group();
spaceEnv.visible = false;
scene.add(spaceEnv);
gltfLoader.load("assets/models/space-opt.glb", (gltf) => {
  const m = gltf.scene;
  // make it render from inside (skybox-style), unaffected by fog, and don't occlude
  m.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat) => {
      if (!mat) return;
      mat.side = THREE.DoubleSide;   // visible from inside
      mat.fog = false;               // fog was hiding the distant field
      mat.depthWrite = false;        // backdrop -> don't occlude the entity
      mat.transparent = true;
      mat.toneMapped = false;        // keep it bright (don't sink into black)
      if (mat.emissive) mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 1.5);
      mat.needsUpdate = true;
    });
  });
  const box = new THREE.Box3().setFromObject(m);
  const sz = new THREE.Vector3(); box.getSize(sz);
  const ctr = new THREE.Vector3(); box.getCenter(ctr);
  const s = 40 / (Math.max(sz.x, sz.y, sz.z) || 1); // a moderate cluster (not full-screen, not tiny)
  m.scale.setScalar(s);
  m.position.set(-ctr.x * s, -ctr.y * s, -ctr.z * s);
  spaceEnv.add(m);
  spaceEnv.position.set(0, 2.5, -45); // starts a bit ahead, rushes toward the lens
  console.log("space.glb loaded; raw size:", sz.x.toFixed(1), sz.y.toFixed(1), sz.z.toFixed(1));
}, undefined, () => console.warn("space.glb not found"));

// planets.glb — the DISTANT destination the entity charges toward and breaks through
const planetsEnv = new THREE.Group();
planetsEnv.visible = false;
scene.add(planetsEnv);
gltfLoader.load("assets/models/planets-opt.glb", (gltf) => {
  const m = gltf.scene;
  m.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat) => {
      if (!mat) return;
      mat.fog = false; mat.toneMapped = false;
      if (mat.emissive) mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 1.4);
      mat.needsUpdate = true;
    });
  });
  const box = new THREE.Box3().setFromObject(m);
  const sz = new THREE.Vector3(); box.getSize(sz);
  const ctr = new THREE.Vector3(); box.getCenter(ctr);
  const s = 55 / (Math.max(sz.x, sz.y, sz.z) || 1); // large field of planets/particles
  m.scale.setScalar(s);
  m.position.set(-ctr.x * s, -ctr.y * s, -ctr.z * s);
  planetsEnv.add(m);
  planetsEnv.position.set(0, 2, -72); // far ahead -> grows as the entity charges in
  console.log("planets-opt.glb loaded; raw size:", sz.x.toFixed(1), sz.y.toFixed(1), sz.z.toFixed(1));
}, undefined, () => console.warn("planets-opt.glb not found"));

/* --- Finale HERO CARD layout ---------------------------------------------
   The wordmark particles first converge into a CARD-shaped point cloud (a
   filled rectangle a little larger than the real card). The actual video card
   then materializes in front, covering the centre, so the particles that fall
   outside the card silhouette read as a glowing "residual frame" around it. */
const FCARD_W = 6.2, FCARD_H = 3.9;                 // real card size (units)
const FCARD_POS = new THREE.Vector3(0, -1.8, 1.0);  // card sits here, facing camera
const fnCard = new Float32Array(FINALE_COUNT * 3);
const fillHalfW = FCARD_W / 2 * fitScale();  // particle fill matches the card exactly (no overhang)
const fillHalfH = FCARD_H / 2 * fitScale();
for (let i = 0; i < FINALE_COUNT; i++) {
  if (i < N_WORD) {
    // word particles fill the card rectangle (slightly BEHIND the card plane)
    fnCard[i*3+0] = FCARD_POS.x + (Math.random() * 2 - 1) * fillHalfW;
    fnCard[i*3+1] = FCARD_POS.y + (Math.random() * 2 - 1) * fillHalfH;
    fnCard[i*3+2] = FCARD_POS.z - 0.45 + (Math.random() - 0.5) * 0.25;
  } else {
    // cloud-only particles keep drifting up/out (same dispersal as before)
    fnCard[i*3+0] = fnTarget[i*3+0];
    fnCard[i*3+1] = fnTarget[i*3+1];
    fnCard[i*3+2] = fnTarget[i*3+2];
  }
}

const fnMat = new THREE.ShaderMaterial({
  transparent: false, depthWrite: true, depthTest: true, blending: THREE.NormalBlending,
  clipping: true,
  clippingPlanes: [spinePlane], // revealed together with the spine in the About->Work wipe
  uniforms: {
    uTex: { value: makeSprite() }, uScale: { value: window.innerHeight },
    uConverge: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 }, uSea: { value: 0 },
    uWord: { value: 0 }, // 1 = the gold "Lumina Logic Minds" wordmark is formed (underwater)
    uRocketDark: { value: 0 }, // 1 = particles darkened to near-black (as they become the rocket)
  },
  vertexShader: /* glsl */`
    #include <clipping_planes_pars_vertex>
    attribute float aSize; attribute float aLLM; attribute vec3 aNormal; attribute float aRand; attribute float aDark; attribute float aExtra;
    varying float vLit; varying float vLLM; varying float vRand; varying float vDark;
    uniform float uScale; uniform float uConverge; uniform float uTime; uniform float uFade; uniform float uWord;
    void main(){
      vLLM = aLLM; vRand = aRand; vDark = aDark;
      // a slowly orbiting "spotlight" direction -> lit side bright, far side dark
      vec3 L = normalize(vec3(cos(uTime * 0.25) * 0.9, 0.55, sin(uTime * 0.25) * 0.7 + 0.5));
      float diff = max(dot(normalize(aNormal), L), 0.0);
      vLit = 0.12 + diff * 0.95;            // ambient + diffuse
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float extraFade = mix(1.0, 1.0 - uConverge, aExtra); // cloud-only particles fade as the text forms
      // slim the discs while the wordmark is formed so fine letter detail reads
      float wordSlim = 1.0 - uWord * 0.45;
      gl_PointSize = aSize * (0.85 + uConverge * 0.25) * wordSlim * uFade * extraFade * (uScale / -mvPosition.z) * 0.06;
      gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
    }
  `,
  fragmentShader: /* glsl */`
    #include <clipping_planes_pars_fragment>
    varying float vLit; varying float vLLM; varying float vRand; varying float vDark;
    uniform sampler2D uTex; uniform float uConverge; uniform float uSea; uniform float uWord; uniform float uRocketDark;
    void main(){
      #include <clipping_planes_fragment>
      vec4 tx = texture2D(uTex, gl_PointCoord);
      if (tx.a < 0.45) discard;              // hard circular disc (occludes -> real 3D form)
      vec3 base = vec3(0.78, 0.82, 0.92);    // silvery sequin (also the card-forming look)
      base = mix(base, vec3(1.0, 0.80, 0.32), vLLM * uWord); // gold (only when the wordmark forms)
      base = mix(base, vec3(0.02, 0.02, 0.03), vDark * uWord); // first letters -> near black
      float sparkle = 0.65 + vRand * 0.7;    // per-disc brightness variation
      vec3 col = base * vLit * sparkle;
      // assimilate into the hex grid's teal as they morph
      col = mix(col, vec3(0.16, 0.5, 0.55) * (0.5 + vRand * 0.6), uSea);
      col = mix(col, vec3(0.03, 0.03, 0.04), uRocketDark); // turn near-black (LLM colour) as they become the rocket
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const finale = new THREE.Points(fnGeo, fnMat);
finale.frustumCulled = false;
finale.visible = false;
scene.add(finale);

/* =========================================================
   Finale HERO CARD — the real GPU project card (transparent video + title)
   that materializes once the particles have formed the card shape. It keeps
   the exact Work-card look and is clickable -> opens the same detail modal.
   ========================================================= */
const finaleCard = new THREE.Group();
finaleCard.visible = false;
finaleCard.position.copy(FCARD_POS);
scene.add(finaleCard);
const fcGeo = new THREE.PlaneGeometry(FCARD_W, FCARD_H);
// dark glassy backing so the video + text stay readable over the bright particles
const fcBackMat = new THREE.MeshBasicMaterial({
  color: 0x05090e, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
});
const fcBack = new THREE.Mesh(fcGeo, fcBackMat);
fcBack.position.z = -0.05;
finaleCard.add(fcBack);
// transparent video face (same treatment as the Work cards)
const fcVideoMat = new THREE.MeshBasicMaterial({
  map: makeCardVideoTexture(finaleProject.video),
  color: new THREE.Color(0x9a9a9a), transparent: true, opacity: 0, depthWrite: false,
  side: THREE.DoubleSide,
});
const fcVideo = new THREE.Mesh(fcGeo, fcVideoMat);
finaleCard.add(fcVideo);
// title + category overlay
const fcTextMat = new THREE.MeshBasicMaterial({
  map: makeCardTexture(finaleProject.t, finaleProject.g, finaleProject.a, finaleProject.b, true),
  transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
});
const fcText = new THREE.Mesh(fcGeo, fcTextMat);
fcText.position.z = 0.06;
finaleCard.add(fcText);
let finaleCardHot = false; // pointer is hovering the hero card (-> clickable)

// Finale ROOM (engine1-opt.glb) — the chamber the brain forms inside. Tunable scale/offset.
const ROOM_SCALE = 40;          // fit largest dimension to this many units
const ROOM_OFFSET = new THREE.Vector3(0, 0, 0); // centred — brain sits in the middle
// tilted clip plane: room is "painted in" from the bottom up, but slightly diagonal
// so flat surfaces (the ceiling) reveal gradually instead of popping in all at once.
const finaleClipN = new THREE.Vector3(0.35, -1, 0).normalize();
const finaleEnterPlane = new THREE.Plane(finaleClipN.clone(), 1000);
const room = new THREE.Group();
room.visible = false;
scene.add(room);
gltfLoader.load("assets/models/engine1-opt.glb", (gltf) => {
  const m = gltf.scene;
  const box = new THREE.Box3().setFromObject(m);
  const ctr = new THREE.Vector3(); box.getCenter(ctr);
  const sz = new THREE.Vector3(); box.getSize(sz);
  const s = ROOM_SCALE / (Math.max(sz.x, sz.y, sz.z) || 1);
  m.scale.setScalar(s);
  m.position.set(-ctr.x * s + ROOM_OFFSET.x, -ctr.y * s + ROOM_OFFSET.y, -ctr.z * s + ROOM_OFFSET.z);
  m.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat) => { if (mat) mat.clippingPlanes = [finaleEnterPlane]; });
  });
  room.add(m);
  console.log("engine1-opt.glb loaded; size:", sz.x.toFixed(1), sz.y.toFixed(1), sz.z.toFixed(1));
}, undefined, () => console.warn("assets/models/engine1-opt.glb not found"));

/* =========================================================
   Section 6 — UNDERWATER : water surface (caustics) overhead, rising bubbles,
   teal fog, and the wordmark particles re-form into a spinning concentric disc.
   ========================================================= */
const sea = new THREE.Group();
sea.visible = false;
scene.add(sea);

// water surface seen from below (animated caustics), as the "ceiling"
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv; uniform float uTime;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
    float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
    void main(){
      vec2 uv = vUv * 7.0;
      float t = uTime * 0.28;
      float c = fbm(uv + vec2(t, t*0.7)) + fbm(uv*1.7 - vec2(t*0.6, t));
      float caustic = pow(max(c - 0.95, 0.0) * 3.2, 2.0);
      // radial fade so it reads as a surface above, brighter overhead
      float fade = smoothstep(1.0, 0.2, length(vUv - 0.5) * 1.6);
      vec3 col = mix(vec3(0.04,0.16,0.22), vec3(0.55,0.9,1.0), caustic);
      gl_FragColor = vec4(col * fade, fade * (0.35 + caustic));
    }
  `,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), waterMat);
water.rotation.x = -Math.PI / 2; // horizontal
water.position.y = -5.2; // just under the room floor -> the floor's underside reads as the surface
sea.add(water);

// rising bubbles
const BUB = 500;
const bubGeo = new THREE.BufferGeometry();
const bubPos = new Float32Array(BUB * 3);
const bubData = new Float32Array(BUB * 2); // rise speed, phase
const bubSize = new Float32Array(BUB);
for (let i = 0; i < BUB; i++) {
  bubPos[i*3+0] = (Math.random() - 0.5) * 30;
  bubPos[i*3+1] = -18 + Math.random() * 13; // below the floor
  bubPos[i*3+2] = (Math.random() - 0.5) * 20 - 2;
  bubData[i*2+0] = 0.4 + Math.random() * 1.2;
  bubData[i*2+1] = Math.random() * Math.PI * 2;
  bubSize[i] = 0.4 + Math.random() * 1.6;
}
bubGeo.setAttribute("position", new THREE.BufferAttribute(bubPos, 3));
bubGeo.setAttribute("aSize", new THREE.BufferAttribute(bubSize, 1));
const bubMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTex: { value: makeSprite() }, uScale: { value: window.innerHeight } },
  vertexShader: /* glsl */`
    attribute float aSize; uniform float uScale;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (uScale / -mv.z) * 0.06;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D uTex;
    void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.7,0.9,1.0), 1.0) * t * 0.5; }
  `,
});
const bubbles = new THREE.Points(bubGeo, bubMat);
bubbles.frustumCulled = false;
sea.add(bubbles);

/* ---- Hexagon tile grid (the centrepiece): a rectangle of hex tiles that show
   a texture and ripple like a flag where the cursor passes over them. ---- */
function makeHexTex() {
  const w = 1024, h = 512;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "#16314a"); grd.addColorStop(0.5, "#3a6f6a"); grd.addColorStop(1, "#2a1f44");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${(180+Math.random()*75)|0},${(200+Math.random()*55)|0},255,${Math.random()*0.4})`;
    g.beginPath(); g.arc(Math.random()*w, Math.random()*h, Math.random()*3+1, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const HEX_COLS = 22, HEX_ROWS = 10, HEX_R = 0.42;
const hexGeo = new THREE.CircleGeometry(HEX_R, 6);
hexGeo.rotateZ(Math.PI / 6); // pointy-top
const hexW = Math.sqrt(3) * HEX_R, hexH = 2 * HEX_R, vSpace = hexH * 0.75;
const gridW = HEX_COLS * hexW, gridH = HEX_ROWS * vSpace;
/* シェーダーは vUv.x = 0.48 あたりから右を暗くしており、そこが会社概要を載せる帯になる。
   グリッドの右端を画面の右端に合わせると、その暗部がちょうど画面右側に来る。
   PC では計算結果が正になるので 0 で頭打ちにし、位置を動かさない。 */
/* 縦長画面での微調整。右端合わせだけだと左に寄りすぎ・高く見えるため少しだけ戻す。
   PC は HEX_FIT が 1 なので、どちらの補正も 0 になり位置は変わらない。 */
const HEX_NUDGE_X = HEX_FIT < 1 ? 0.4 : 0;
const HEX_NUDGE_Y = HEX_FIT < 1 ? -0.9 : 0;
const HEX_CX = Math.min(0, VIS_HALF_W - gridW * HEX_FIT / 2) + HEX_NUDGE_X;
const HEX_CY = -8 + HEX_NUDGE_Y;   // グリッドの中心の高さ（既定は -8）
const hexCount = HEX_COLS * HEX_ROWS;
const hexMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {
    // uCell = 1 / grid size. The tile samples the texture by its true vertex
    // position (see vertex shader), so all tiles form ONE continuous, upright image.
    uTex: { value: makeHexTex() }, uCell: { value: new THREE.Vector2(1 / gridW, 1 / gridH) },
    uCursor: { value: new THREE.Vector3(999, 999, 0) }, uTime: { value: 0 },
    uHover: { value: 0 }, uReveal: { value: 0 }, uSplit: { value: 0 },
  },
  vertexShader: /* glsl */`
    attribute vec2 aCenter; attribute vec2 aUVoff;
    varying vec2 vUv;
    uniform vec2 uCell; uniform vec3 uCursor; uniform float uTime; uniform float uHover; uniform float uReveal;
    void main(){
      // map by the true (rotated) vertex position, not the un-rotated circle uv,
      // so the video stays upright; * (1/grid) makes tiles form one continuous image.
      vUv = aUVoff + position.xy * uCell * 1.03; // 1.03 = tiny bleed hides hairline seams
      vec3 pos = position;
      // gentle ambient wave across the whole grid (flag in the wind)
      float amb = sin(aCenter.x * 0.9 + uTime * 1.3) + sin(aCenter.y * 0.7 - uTime * 1.0)
                + sin((aCenter.x + aCenter.y) * 0.5 + uTime * 0.7);
      pos.z += amb * 0.12 * uReveal;
      // cursor ripple
      float d = distance(aCenter, uCursor.xy);
      float fall = smoothstep(2.4, 0.0, d);          // closer to cursor -> more push
      float wave = sin(uTime * 5.0 - d * 4.0);        // flag-like wobble
      pos.z += fall * (0.55 + wave * 0.4) * uHover;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv; uniform sampler2D uTex; uniform float uReveal; uniform float uSplit;
    void main(){
      // Map the whole video into only the LEFT part of the grid (VID_W of the
      // width) instead of stretching it across the full grid -> less magnification
      // = sharper. The remaining right strip shows no video (kept dark for text).
      const float VID_W = 0.6; // video occupies the left 60% (6 of 10)
      vec2 sUv = vec2(vUv.x / VID_W, vUv.y);
      float inVid = step(sUv.x, 1.0); // 1 inside the video area, 0 to the right
      vec4 c = texture2D(uTex, clamp(sUv, 0.001, 0.999));
      // The tiles show an sRGB video in a raw shader, and the composer applies
      // ACES tone-mapping downstream (which desaturates). Decode sRGB -> linear
      // so the output looks correct, then lift saturation + contrast so the
      // clip reads vividly instead of washed-out grey. (tune SAT / CONTRAST / EXPOSURE)
      vec3 col = pow(c.rgb, vec3(2.2));                  // sRGB -> linear
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); // luminance
      const float SAT = 1.55, CONTRAST = 1.12, EXPOSURE = 1.25;
      col = mix(vec3(l), col, SAT);                      // saturation boost
      col = (col - 0.5) * CONTRAST + 0.5;                // contrast
      col = clamp(col * EXPOSURE, 0.0, 1.0);             // brightness
      col *= inVid;                                      // no video outside the left region
      // "split" layout: darken only the RIGHT side of the grid (inside the tiles,
      // never the background) along a diagonal, so profile text reads over the video.
      // vUv spans 0..1 across the grid (0 = left, 1 = right; y: 0 = bottom, 1 = top).
      float edge = vUv.x - (0.48 + 0.12 * (vUv.y - 0.5)); // diagonal boundary
      float shade = smoothstep(-0.02, 0.06, edge) * uSplit;
      col = mix(col, col * 0.04, shade);                 // fade right side toward dark
      gl_FragColor = vec4(col, uReveal);
    }
  `,
});
const hexMesh = new THREE.InstancedMesh(hexGeo, hexMat, hexCount);
const hexCenter = new Float32Array(hexCount * 2);
const hexUVoff = new Float32Array(hexCount * 2);
const _hexDum = new THREE.Object3D();
let _hi = 0;
for (let row = 0; row < HEX_ROWS; row++) {
  for (let col = 0; col < HEX_COLS; col++) {
    const x = (col - (HEX_COLS - 1) / 2) * hexW + (row % 2) * hexW / 2;
    const y = (row - (HEX_ROWS - 1) / 2) * vSpace;
    _hexDum.position.set(x, y, 0); _hexDum.updateMatrix();
    hexMesh.setMatrixAt(_hi, _hexDum.matrix);
    hexCenter[_hi*2] = x; hexCenter[_hi*2+1] = y;
    hexUVoff[_hi*2] = x / gridW + 0.5; hexUVoff[_hi*2+1] = y / gridH + 0.5;
    _hi++;
  }
}
hexGeo.setAttribute("aCenter", new THREE.InstancedBufferAttribute(hexCenter, 2));
hexGeo.setAttribute("aUVoff", new THREE.InstancedBufferAttribute(hexUVoff, 2));
hexMesh.instanceMatrix.needsUpdate = true;
hexMesh.position.set(HEX_CX, HEX_CY, 0);
hexMesh.scale.setScalar(HEX_FIT);
hexMesh.frustumCulled = false;
hexMesh.visible = false;
sea.add(hexMesh);

// The hex screen plays TWO company videos back-to-back on a loop (1 -> 2 -> 1 ...),
// swapping the shared tile texture when each clip ends. Each clip is muted +
// non-looping; the "ended" handler advances to the next. The dot-pattern canvas
// texture (makeHexTex) stays as the pre-play fallback.
function makeSeqVideoTex(src) {
  const v = document.createElement("video");
  v.src = src; v.loop = false; v.muted = true; v.defaultMuted = true;
  v.playsInline = true; v.preload = "auto";
  v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return { v, tex };
}
const companyClips = [
  makeSeqVideoTex("assets/videos/company-1-opt.mp4"),
  makeSeqVideoTex("assets/videos/company-2-opt.mp4"),
];
let companyIdx = 0;
function playCompanyClip(i) {
  companyIdx = i;
  const clip = companyClips[i];
  hexMat.uniforms.uTex.value = clip.tex; // show this clip across the whole grid
  clip.v.currentTime = 0;
  clip.v.play().catch(() => {});
}
companyClips.forEach((clip, i) => {
  clip.v.addEventListener("ended", () => playCompanyClip((i + 1) % companyClips.length));
});
// the "split" layout darkens the right of the grid in-shader (confined to the
// tiles) — enable it only when <body class="company-split">
hexMat.uniforms.uSplit.value = document.body.classList.contains("company-split") ? 1 : 0;
playCompanyClip(0); // start the sequence (muted autoplay); gesture kick below as a fallback
// browsers may block autoplay until a gesture — kick the current clip on first interaction
["pointerdown", "wheel", "keydown", "touchstart"].forEach((ev) =>
  window.addEventListener(ev, () => companyClips[companyIdx].v.play().catch(() => {}), { once: true })
);

const _hexPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0 world, for cursor raycast
const _hexHit = new THREE.Vector3();

// the wordmark particles MORPH to fill the grid rectangle (just behind the tiles),
// so the hex grid looks like it forms out of them.
const fnDisc = new Float32Array(FINALE_COUNT * 3);
for (let i = 0; i < FINALE_COUNT; i++) {
  fnDisc[i*3+0] = (Math.random() - 0.5) * gridW * HEX_FIT + HEX_CX;
  fnDisc[i*3+1] = (Math.random() - 0.5) * gridH * HEX_FIT + HEX_CY; // grid is centred at HEX_CY
  fnDisc[i*3+2] = -0.3 + (Math.random() - 0.5) * 0.2;  // just behind the hex tiles
}

/* =========================================================
   Interaction : mouse parallax + scroll-driven rotation
   ========================================================= */
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
const pointerNDC = new THREE.Vector2();
/* 画面座標を3D空間の判定用座標に変換する。window ではなく canvas の実寸を基準に
   するのは、モバイルではアドレスバーの開閉で window.innerHeight が変動し、
   描画サイズとの間にずれが生じてタップ位置が合わなくなるため。 */
function setPointerFrom(e) {
  const r = canvas.getBoundingClientRect();
  const nx = (e.clientX - r.left) / r.width;
  const ny = (e.clientY - r.top) / r.height;
  pointer.tx = (nx - 0.5) * 2;
  pointer.ty = (ny - 0.5) * 2;
  pointerNDC.x = nx * 2 - 1;
  pointerNDC.y = -(ny * 2 - 1);
}
window.addEventListener("pointermove", setPointerFrom);
// raycasting for clickable project cards (page navigation wired up later)
const raycaster = new THREE.Raycaster();
let hoveredCard = null;
// ---- service card detail modal ----
const modalEl = document.getElementById("cardModal");
const mCat = modalEl.querySelector(".cardmodal__cat");
const mTitle = modalEl.querySelector(".cardmodal__title");
const mCatch = modalEl.querySelector(".cardmodal__catch");
const mLead = modalEl.querySelector(".cardmodal__lead");
const mBody = modalEl.querySelector(".cardmodal__body");
const mMore = modalEl.querySelector(".cardmodal__more");
let modalOpen = false;
function openCardModal(p) {
  modalEl.style.setProperty("--accent", p.b);
  mCat.textContent = p.g;
  mTitle.textContent = p.t;
  mCatch.textContent = p.catch || "";
  mLead.textContent = p.lead || "";
  mBody.textContent = p.body || "";
  if (p.more) { mMore.href = p.more; mMore.classList.add("is-shown"); }
  else mMore.classList.remove("is-shown");
  modalEl.querySelector(".cardmodal__panel").scrollTop = 0;
  modalEl.classList.add("is-open");
  modalEl.setAttribute("aria-hidden", "false");
  modalOpen = true;
  document.body.style.cursor = "";
}
function closeCardModal() {
  modalEl.classList.remove("is-open");
  modalEl.setAttribute("aria-hidden", "true");
  modalOpen = false;
}
modalEl.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeCardModal));
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalOpen) closeCardModal(); });
/* カードを開く判定。click ではなく pointerdown/up の組で見ている。
   カードは DOM 要素ではなく canvas 内の3Dオブジェクトなので、タップ時に click が
   届かないことがある。また hoveredCard（ホバー状態）は「乗せてから押す」マウスでしか
   埋まらず、タップでは常に空になる。押した位置と離した位置を自前で見ることで、
   マウスとタップの両方で同じように動く。 */
let tapX = 0, tapY = 0, tapTracking = false;
const TAP_SLOP = 12; // これ以上動いたらスクロール操作とみなし、タップとして扱わない

window.addEventListener("pointerdown", (e) => {
  tapX = e.clientX; tapY = e.clientY; tapTracking = true;
});

window.addEventListener("pointerup", (e) => {
  if (!tapTracking) return;
  tapTracking = false;
  if (Math.hypot(e.clientX - tapX, e.clientY - tapY) > TAP_SLOP) return; // ドラッグ
  if (modalOpen || unlocking || launching) return;
  if (e.target.closest && e.target.closest(".cardmodal, .nav, .chat")) return;

  setPointerFrom(e);
  raycaster.setFromCamera(pointerNDC, camera);

  if (work.visible) {
    const hit = raycaster.intersectObjects(cards, false)[0];
    if (hit && hit.object.userData.project) { openCardModal(hit.object.userData.project); return; }
  }
  if (finaleCard.visible && raycaster.intersectObject(fcVideo, false).length) {
    openCardModal(finaleProject);
  }
});

// bottom-left navigator links open the same service modal as the Work cards
// (list order matches the `projects` array 1:1)
document.querySelectorAll(".chat__list a").forEach((a, i) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (projects[i]) openCardModal(projects[i]);
  });
});

// Returning from a sub-page (e.g. reskilling.html) lands back where it left off.
// Keys match the ?back=... value each sub-page links with; values are positions on
// the same 0..SCROLL_MAX timeline the top-right nav jumps to.
let RETURN_TO = null;
try {
  RETURN_TO = sessionStorage.getItem("llm:back");
  sessionStorage.removeItem("llm:back"); // 一度使ったら消す（次のリロードは先頭から）
} catch (e) {}
if (!RETURN_TO) RETURN_TO = new URLSearchParams(location.search).get("back"); // 旧リンク用
const RETURN_SCROLL = {
  top:        0,      // reskilling.html のロゴ
  about:      1.55,
  work:       2.25,
  // 各事業カードが正面に来る位置（2.25 から 0.35 刻み。projects の並び順と対応）
  "web-development": 2.25,
  dx: 2.60,
  "data-ml": 2.95,
  reskilling: 3.30,   // リスキリングのカードが正面に来る位置
  // GPUは周回カードではなくFinaleのヒーローカード。4.25 では粒子がカードを形作った
  // 直後で本体がまだ半分ほどしか出ていないため、完全に現れて動画が回っている位置に置く。
  // （出現 4.08→4.40 で完了、退場は 4.95 から始まる）
  gpu: 4.65,
  company:    7.25,
  // contact / privacy-policy / tokusho のリンクは「← トップへ戻る」表記なので、
  // 文脈上の近い位置ではなく表示どおり先頭に戻す（ラベルと挙動を一致させる）
  contact:    0,
  legal:      0,
};
let scroll = 0, targetScroll = 0;
if (RETURN_TO) {
  if (RETURN_SCROLL[RETURN_TO] != null) scroll = targetScroll = RETURN_SCROLL[RETURN_TO]; // else start at top
  history.replaceState({}, "", location.pathname); // clear ?back= so a later reload starts at top
}
// ---- Hidden-trigger + "ascension" (surface into the admin login) state ----
let unlocking = false, unlockStart = 0, unlockStage = 0, unlockCount = 0;
const unlockCam = new THREE.Vector3();
const whiteoutEl = document.createElement("div"); // surface-break flash into the login page
whiteoutEl.id = "whiteout";
document.body.appendChild(whiteoutEl);
function startUnlock() {
  if (unlocking) return;
  unlocking = true;
  unlockStart = clock.elapsedTime;
  unlockCam.copy(camera.position);
  letterFlash[0] = letterFlash[1] = letterFlash[2] = 1.6; // three letters blaze
}

/* ---- COMPANY launch: the same rocket flight, but it lands on the company
   section instead of leaving for the login page. -------------------------
   隠しコマンド版（unlocking）とは別のフラグで動かす。共通部分を関数に
   切り出すと既存の演出まで壊しかねないため、描画側は `launching` の分岐を
   足すだけにして、管理画面への経路のコードパスは一切変えていない。

   ワードマークの粒子は使わない。COMPANY はどのスクロール位置からでも押せる
   ので、粒子（scroll > 1.88 にしか居ない）を前提にすると成立しないため。
   代わりにナビの COMPANY 自体が光の線になって中央へ収束し、そこからロケット
   が組み上がる。 */
let launching = false, launchStart = 0;
// 着地（暗転しきって会社概要へ切り替わった）以降かどうか。sea の表示判定が
// launching ブロックより前に走るため、フラグとして持っておく必要がある。
let launchLanded = false;
const launchCam = new THREE.Vector3();
const LAUNCH_END = 5.6;            // 全体の尺（秒）
const LAUNCH_LAND = 7.25;          // 着地点＝会社概要
// ナビの COMPANY から飛ぶ光の筋。DOM ではなく canvas 上に描くので、
// 3D の暗転やブルームと同じ画面の中で完結する。
const trailEl = document.createElement("div");
trailEl.id = "navtrail";
document.body.appendChild(trailEl);
function startLaunch(fromEl) {
  if (launching || unlocking) return;
  launching = true;
  launchLanded = false;
  launchStart = clock.elapsedTime;
  launchCam.copy(camera.position);
  // 押されたピルの位置から光が走り出す。画面中央（ロケットの生成点）へ向かう。
  const r = fromEl.getBoundingClientRect();
  trailEl.style.setProperty("--x", (r.left + r.width / 2).toFixed(1) + "px");
  trailEl.style.setProperty("--y", (r.top + r.height / 2).toFixed(1) + "px");
  // 2回目以降のために確実に頭出しする。クラスを外して即座に付け直すだけでは
  // ブラウザが同一フレームの変更をまとめてしまい、アニメーションが再生されない。
  trailEl.classList.remove("is-firing");
  void trailEl.offsetWidth; // 強制的にレイアウトを確定させ、再生をリセットする
  trailEl.classList.add("is-firing");
}
// click the first letters L / L / M (x5 each, in order) on the formed wordmark
window.addEventListener("click", (e) => {
  if (modalOpen || unlocking) return;
  if (!(scroll > 5.82 && scroll < 6.25)) return; // only while the gold wordmark is formed
  setPointerFrom(e); // canvas 基準（モバイルでの縦ずれを防ぐ）
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(letterSprites, false);
  if (!hits.length) return;
  const l = hits[0].object.userData.letter;
  if (l === unlockStage) {
    unlockCount++;
    letterFlash[l] = 1.0;
    if (unlockCount >= 5) {
      unlockStage++; unlockCount = 0;
      if (unlockStage >= 3) startUnlock();
    }
  } else {
    unlockStage = 0; unlockCount = 0;
    letterFlash[l] = 0.35; // acknowledge the (wrong) click, then reset
  }
});

const SCROLL_MAX = 7.4; // whole experience spans 0..SCROLL_MAX (multiple sections)
const EASE_IDLE = 0.06; // normal wheel/touch feel
const EASE_JUMP = 0.13; // while a nav jump is in flight (~0.6s end to end)
let scrollEase = EASE_IDLE;
window.addEventListener("wheel", (e) => {
  if (modalOpen || unlocking || launching) return; // freeze while a modal is open / in flight
  targetScroll += e.deltaY * 0.00035; // slower: more scroll distance = more time to watch
  targetScroll = Math.max(0, Math.min(SCROLL_MAX, targetScroll));
  scrollEase = EASE_IDLE; // manual input cancels a nav jump's boosted easing
}, { passive: true });
// touch scroll
let touchY = null;
window.addEventListener("touchstart", (e)=>{ touchY = e.touches[0].clientY; }, {passive:true});
window.addEventListener("touchmove", (e)=>{
  if (modalOpen || unlocking || launching) return;
  if (touchY !== null){ targetScroll += (touchY - e.touches[0].clientY) * 0.0010; touchY = e.touches[0].clientY;
    targetScroll = Math.max(0, Math.min(SCROLL_MAX, targetScroll)); scrollEase = EASE_IDLE; }
}, {passive:true});

/* ---- Top-right nav ------------------------------------------------------
   Each link moves `targetScroll`, so the existing easing plays the jump and
   the sections in between flow past fast-forward instead of cutting. `at` is
   the landing spot; from/to is the range that lights the link up. The ranges
   are contiguous so exactly one item is always active: Finale (the GPU hero
   card) counts as Work since it is project content, and the underwater
   wordmark reads as the run-up to Company. */
const NAV_SECTIONS = [
  // Top の着地点は 0 ではなく 1.68。0 はロゴだけで読ませる文章が無いため、
  // About の文章が出ている位置を「トップ」として見せる。
  // About の項目を外したぶん、点灯範囲は Top が 1.88 まで引き継ぐ。
  // ※ 実際に使われるのは index.html の data-scroll。at はそれと同じ値の控え。
  { id: "top",     at: 1.68, from: 0.00, to: 1.88 },
  { id: "work",    at: 2.25, from: 1.88, to: 5.50 },
  { id: "company", at: 7.25, from: 5.50, to: SCROLL_MAX + 0.01 },
];
// Matched by attribute rather than by position, so the markup can be reordered
// or duplicated without this block needing to know about it.
const navLinks = [...document.querySelectorAll("a[data-scroll][data-sec]")];
// COMPANY はロケット演出を挟んで着地する。押すたびに毎回再生する。
navLinks.forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // don't let the card raycaster see this click
    if (modalOpen || unlocking || launching) return;
    if (a.dataset.sec === "company") {
      startLaunch(a);
      return; // scroll は演出の終盤で着地点へ差し替える
    }
    targetScroll = Math.max(0, Math.min(SCROLL_MAX, parseFloat(a.dataset.scroll)));
    scrollEase = EASE_JUMP;
  });
});
let navActiveId = "";
function updateNavActive() {
  let id = "";
  for (const s of NAV_SECTIONS) {
    if (scroll >= s.from && scroll < s.to) { id = s.id; break; }
  }
  if (id === navActiveId) return; // only touch the DOM when it actually changes
  navActiveId = id;
  navLinks.forEach((a) => a.classList.toggle("is-active", a.dataset.sec === id));
}

/* =========================================================
   Post-processing : bloom
   ========================================================= */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.45,  // strength (toned down — less glare)
  0.6,   // radius
  0.9    // threshold (only the brightest bits bloom)
);
composer.addPass(bloom);
// chromatic aberration (RGB split) — 0 normally, ramped during the ascension
const rgbPass = new ShaderPass(RGBShiftShader);
rgbPass.uniforms.amount.value = 0.0;
composer.addPass(rgbPass);
composer.addPass(new OutputPass());

/* =========================================================
   Resize
   ========================================================= */
window.addEventListener("resize", () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
  pMat.uniforms.uScale.value = h;
  gMat.uniforms.uScale.value = h;
  fnMat.uniforms.uScale.value = h;
  stMat.uniforms.uScale.value = h;
});

/* =========================================================
   Animation loop
   ========================================================= */
const clock = new THREE.Clock();
const _v = new THREE.Vector3();   // scratch vector for glitter->forest merge
const _inv = new THREE.Matrix4(); // forest inverse matrix (world -> forest-local)
const aboutEl = document.getElementById("about");
const aboutTitleEl = aboutEl.querySelector(".about__title");
const aboutCopyEl = aboutEl.querySelector(".about__copy");
const chatEl = document.getElementById("chat");
const vlineEl = document.getElementById("vline");
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // smooth scroll + pointer
  scroll += (targetScroll - scroll) * scrollEase;
  if (scrollEase !== EASE_IDLE && Math.abs(targetScroll - scroll) < 0.01) scrollEase = EASE_IDLE;
  updateNavActive();
  pointer.x += (pointer.tx - pointer.x) * 0.05;
  pointer.y += (pointer.ty - pointer.y) * 0.05;

  // Section 2 timeline (staged, overlapping so the motion flows continuously):
  //  Beat A — glitter swirls around the logo and rises.
  //  Beat B — glitter FLOWS INTO the forest while the forest rises from below.
  //  Beat C — the angle tilts over to reveal the ground + whole forest.
  const riseT     = smoothstep(0.0,  0.34, scroll); // glitter swirl + rise
  const mergeT    = smoothstep(0.34, 0.66, scroll); // glitter flows into the forest
  const forestRev = smoothstep(0.30, 0.72, scroll); // forest rises from below (overlaps merge)
  const tiltT     = smoothstep(0.62, 0.92, scroll); // angle change / full reveal
  const logoSink  = smoothstep(0.42, 0.82, scroll);
  const greenT    = smoothstep(0.34, 0.78, scroll);

  // Section 3 (About): forest fades out, big logo returns to centre, text wipes in
  const aboutT     = smoothstep(1.05, 1.50, scroll);
  const forestFade = 1.0 - smoothstep(1.00, 1.35, scroll);
  // Section 4 (Work): About exits, the spine + project cards scroll in
  const aboutExit  = smoothstep(1.88, 2.05, scroll);
  const workT      = smoothstep(1.98, 2.20, scroll);
  const logoExit   = smoothstep(1.84, 2.00, scroll); // logo leaves just as the band covers centre
  // Section 5 (Finale): particles rain down and converge into the GPU hero card
  const finaleT    = smoothstep(3.30, 3.70, scroll);
  const roofT      = smoothstep(3.30, 3.58, scroll); // clumps gather up to the roof
  const convergeT  = smoothstep(3.58, 4.20, scroll); // then rain down -> form the card shape
  const cardShowT  = smoothstep(4.08, 4.40, scroll); // real video card materializes in front (slightly earlier than default)
  const cardHoldOut= smoothstep(4.95, 5.35, scroll); // card fades out as we sink toward the sea
  const wordT      = smoothstep(5.25, 5.85, scroll); // particles morph -> "Lumina Logic Minds" (underwater)

  // --- Forest transform first (glitter merges into its local space) ---
  forest.rotation.y = t * 0.03 + forestRev * 1.3;
  forest.rotation.x = -0.12 - tiltT * 0.06; // keep the ground roughly horizontal
  forest.position.y = -16.0 + forestRev * 13.0 + tiltT * 1.0;
  forest.updateMatrixWorld(true);
  pMat.uniforms.uTime.value = t;
  pMat.uniforms.uForest.value = greenT;
  pMat.uniforms.uFade.value = forestFade;

  // --- Glitter: swirl + rise near the logo (world), then flow into the forest ---
  _inv.copy(forest.matrixWorld).invert();
  const swirl = riseT * Math.PI * 2.2;
  const lift  = riseT * 7.5;
  const gidle = 1.0 - riseT * 0.7;
  const gpos = gGeo.attributes.position.array;
  for (let i = 0; i < GCOUNT; i++) {
    const r = gData[i*4+0], a0 = gData[i*4+1], ph = gData[i*4+2], y0 = gData[i*4+3];
    const ang = a0 + t * 0.03 + swirl;
    // hover (world) position near the logo, with the static scatter offset baked in
    const wx = Math.cos(ang) * r + gOff[i*3+0] + Math.sin(t*0.5 + ph) * 0.06 * gidle;
    const wy = y0 + lift + gOff[i*3+1] + Math.sin(t*0.4 + ph*1.3) * 0.09 * gidle;
    const wz = Math.sin(ang) * r + gOff[i*3+2] + Math.cos(t*0.45 + ph) * 0.06 * gidle;
    // convert to forest-local, then lerp toward this mote's forest home
    _v.set(wx, wy, wz).applyMatrix4(_inv);
    const hx = gHome[i*3+0], hy = gHome[i*3+1], hz = gHome[i*3+2];
    gpos[i*3+0] = _v.x + (hx - _v.x) * mergeT;
    gpos[i*3+1] = _v.y + (hy - _v.y) * mergeT;
    gpos[i*3+2] = _v.z + (hz - _v.z) * mergeT;
  }
  gGeo.attributes.position.needsUpdate = true;
  gMat.uniforms.uForest.value = greenT;
  gMat.uniforms.uFade.value = forestFade;

  // logo: idle spin + scroll spin + mouse tilt; sinks as the forest comes up
  logo.rotation.y = t * 0.25 + scroll * Math.PI * 2 + pointer.x * 0.35;
  logo.rotation.x = Math.sin(t * 0.4) * 0.06 + pointer.y * 0.2;
  logo.position.y = Math.sin(t * 0.6) * 0.12 - logoSink * 2.4;
  logo.position.z = -logoSink * 1.2;

  // Section 3: bring the logo back to centre and enlarge it for the About section
  logo.position.y = THREE.MathUtils.lerp(logo.position.y, Math.sin(t * 0.6) * 0.12, aboutT);
  logo.position.z = THREE.MathUtils.lerp(logo.position.z, 0.0, aboutT);
  logo.scale.setScalar(THREE.MathUtils.lerp(0.78, 1.3, aboutT)); // stays About-size; clipped away in the dissolve
  logo.visible = scroll < 2.25;
  glow.position.y = logo.position.y; // halo follows the logo
  glow.visible = scroll < 2.0;
  // About text (DOM): diagonal reveal, then just scrolls bottom -> top off the screen
  aboutTextMesh.visible = false;
  aboutEl.style.setProperty("--rev", aboutT.toFixed(3));
  // split speeds: left (title) much slower, right (copy) unchanged
  const copyShift = smoothstep(1.15, isNarrow ? 3.2 : 2.65, scroll); // a bit slower (slower still when stacked)
  const titleShift = smoothstep(1.15, 3.5, scroll); // a touch slower
  aboutCopyEl.style.transform = `translateY(${(30 - copyShift * 150).toFixed(1)}vh)`;
  aboutTitleEl.style.transform = `translateY(${(30 - titleShift * 150).toFixed(1)}vh)`;
  aboutEl.style.clipPath = scroll >= 2.5 ? "polygon(0 0,0 0,0 0,0 0)" : ""; // CSS --rev controls reveal

  // --- Section 4 (Work): spine + cards scroll in and orbit ---
  work.visible = scroll > 1.88 && scroll < 3.65;
  if (work.visible) {
    const WORK_SCALE = 1.25 * fitScale();
    // As the Finale arrives, the spine + cards shrink and keep spinning away
    const exitF = smoothstep(3.30, 3.62, scroll); // last card arrives front -> immediately spins away (no pause)
    work.scale.setScalar(WORK_SCALE * (1 - exitF));
    // During the wipe (1.88-2.25) the spine + cards rotate/rise INTO place; they
    // arrive with the top card front (p=0) exactly when the wipe finishes.
    const entranceT = smoothstep(1.88, 2.25, scroll);
    const workProg = Math.max(0, Math.min(1, (scroll - 2.25) / 1.05));
    const p = workProg * (cards.length - 1);
    work.rotation.y = -(p * CARD_ANGLE + exitF * 3.5) + (1 - entranceT) * 1.4; // enter from lower-right
    work.position.y = p * CARD_STEP * WORK_SCALE - (1 - entranceT) * 2.5;

    // hover (raycast): elegant hover + pointer cursor on the cards
    let hovered = -1;
    if (workT > 0.5 && !modalOpen) { // no hover reaction while a modal is open
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(cards, false);
      if (hits.length) hovered = cards.indexOf(hits[0].object);
    }
    hoveredCard = hovered >= 0 ? cards[hovered] : null;
    document.body.style.cursor = (hovered >= 0 && !modalOpen) ? "pointer" : "";
    for (let i = 0; i < cards.length; i++) {
      const tScale = i === hovered ? 1.12 : 1.0;
      cards[i].scale.x += (tScale - cards[i].scale.x) * 0.15;
      cards[i].scale.y += (tScale - cards[i].scale.y) * 0.15;
      cards[i].scale.z += (tScale - cards[i].scale.z) * 0.15;
      cards[i].material.opacity = (i === hovered ? 0.98 : 0.85) * (1 - exitF);
      if (cards[i].userData.textPlane) {
        cards[i].userData.textPlane.material.opacity = (i === hovered ? 1.0 : 0.95) * (1 - exitF);
      }
    }
  } else {
    document.body.style.cursor = "";
    hoveredCard = null;
  }
  chatEl.classList.toggle("is-in", workT > 0.45 && scroll < 3.35);

  // Work -> Finale: the room is "painted in" from the bottom up; the bright line
  // rides the exact reveal edge (a horizontal clip plane sweeping up in world Y).
  room.visible = scroll > 3.28 && scroll < 5.6; // the chamber holds through the card, then we sink past its floor
  if (scroll > 3.28 && scroll < 4.35) {
    const wt = smoothstep(3.30, 4.28, scroll); // even slower paint-up — watch the room generate
    const thr = THREE.MathUtils.lerp(-8.5, 9.0, wt);
    finaleEnterPlane.constant = thr;
    // bright line riding the (tilted) reveal edge, so it matches the diagonal sweep
    camera.updateMatrixWorld();
    const yAt = (x) => -(finaleClipN.x * x + thr) / finaleClipN.y;
    const A = new THREE.Vector3(-22, yAt(-22), 0).project(camera);
    const B = new THREE.Vector3( 22, yAt( 22), 0).project(camera);
    const ax = (A.x * 0.5 + 0.5) * window.innerWidth, ay = (1 - (A.y * 0.5 + 0.5)) * window.innerHeight;
    const bx = (B.x * 0.5 + 0.5) * window.innerWidth, by = (1 - (B.y * 0.5 + 0.5)) * window.innerHeight;
    vlineEl.style.opacity = "1";
    vlineEl.style.width = Math.hypot(bx - ax, by - ay) + "px";
    vlineEl.style.left = ax + "px";
    vlineEl.style.top = ay + "px";
    vlineEl.style.transform = `rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
  } else {
    finaleEnterPlane.constant = 1000; // room stays solid — we sink through its floor
    vlineEl.style.opacity = "0";
  }

  // --- Finale particles: orbit the spine, gather to the roof, then morph through
  //     three forms: (1) the GPU card shape, (2) the "Lumina Logic Minds" wordmark
  //     (underwater), (3) the hex-grid backing. ---
  // hero particles。COMPANY のロケット演出中は粒子を使わないので出さない。
  finale.visible = ((scroll > 1.88 && scroll < 7.25) || unlocking) && !launching;
  if (finale.visible && unlocking) {
    // ASCENSION: the wordmark particles assemble DIRECTLY into the rocket shape (no
    // intermediate blob), then hand off to the real rocket.glb which charges on.
    const arr = fnGeo.attributes.position.array;
    const ue = clock.elapsedTime - unlockStart;
    const tr = travelAt(ue);                     // forward-moving anchor
    const formShape = smoothstep(0.8, 1.8, ue); // glow lingers, then quickly assemble the rocket silhouette
    const SA = SHAPES[0];                         // the rocket surface points
    for (let i = 0; i < FINALE_COUNT; i++) {
      const ph = fnPhase[i];
      // no roll -> the rocket keeps a fixed straight orientation (nose forward)
      const mx = SA[i*3+0] + Math.sin(ue * 1.6 + ph) * 0.06;     // subtle float
      const my = SA[i*3+1] + Math.sin(ue * 1.4 + ph * 1.3) * 0.06;
      const tx = tr.x + mx, ty = tr.y + my, tz = tr.z + SA[i*3+2];
      arr[i*3+0] = fnTarget[i*3+0] + (tx - fnTarget[i*3+0]) * formShape;
      arr[i*3+1] = fnTarget[i*3+1] + (ty - fnTarget[i*3+1]) * formShape;
      arr[i*3+2] = fnTarget[i*3+2] + (tz - fnTarget[i*3+2]) * formShape;
    }
    fnGeo.attributes.position.needsUpdate = true;
    fnMat.uniforms.uWord.value = 0.0;
    fnMat.uniforms.uSea.value = 0.0;
    fnMat.uniforms.uConverge.value = 1.0;
    fnMat.uniforms.uTime.value = t;
    fnMat.uniforms.uRocketDark.value = smoothstep(1.4, 1.9, ue); // particles turn near-black as the rocket forms
    fnMat.uniforms.uFade.value = 1.0 - smoothstep(1.7, 2.7, ue);  // slower hand-off to the real rocket
  } else if (finale.visible) {
    const arr = fnGeo.attributes.position.array;
    const wob = 0.3 + Math.max(convergeT, wordT) * 0.7;
    const discT = smoothstep(6.20, 6.80, scroll);      // wordmark -> hex backing
    // follow the spine + cards: rotate with the staircase and lift upward (incl. the wipe entrance)
    const entranceT2 = smoothstep(1.88, 2.25, scroll);
    const wprog = Math.max(0, Math.min(1, (scroll - 2.25) / 1.05));
    const workLift = wprog * (cards.length - 1) * CARD_STEP * 1.25 * fitScale() - (1 - entranceT2) * 2.5;
    const spin = -wprog * (cards.length - 1) * CARD_ANGLE + (1 - entranceT2) * 1.4;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    for (let i = 0; i < FINALE_COUNT; i++) {
      const ph = fnPhase[i];
      // 1) clump near the spine (orbiting + rising with it) during Work
      const ox = fnStart[i*3], oy = fnStart[i*3+1], oz = fnStart[i*3+2];
      let x = (ox * cs - oz * sn) + Math.sin(t*0.6 + ph) * 0.1;
      let y = oy + workLift + Math.cos(t*0.5 + ph) * 0.1;
      let z = (ox * sn + oz * cs) + Math.sin(t*0.55 + ph) * 0.1;
      // 2) gather up to the roof
      x += (fnRoof[i*3]   - x) * roofT;
      y += (fnRoof[i*3+1] - y) * roofT;
      z += (fnRoof[i*3+2] - z) * roofT;
      // 3) rain down + converge into the CARD shape
      const cx = fnCard[i*3]   + Math.sin(t*0.6 + ph) * 0.08 * wob;
      const cy = fnCard[i*3+1] + Math.cos(t*0.5 + ph) * 0.08 * wob;
      const cz = fnCard[i*3+2] + Math.sin(t*0.55 + ph) * 0.08 * wob;
      let px = x + (cx - x) * convergeT;
      let py = y + (cy - y) * convergeT;
      let pz = z + (cz - z) * convergeT;
      // 4) underwater: morph the card cloud -> the "Lumina Logic Minds" wordmark
      if (wordT > 0.0) {
        const wx = fnTarget[i*3]   + Math.sin(t*0.6 + ph) * 0.08 * wob;
        const wy = fnTarget[i*3+1] + Math.cos(t*0.5 + ph) * 0.08 * wob;
        const wz = fnTarget[i*3+2] + Math.sin(t*0.55 + ph) * 0.08 * wob;
        px += (wx - px) * wordT;
        py += (wy - py) * wordT;
        pz += (wz - pz) * wordT;
      }
      // 5) then re-form into the spinning hex-grid backing disc
      if (discT > 0.0) {
        px += (fnDisc[i*3]   - px) * discT;
        py += (fnDisc[i*3+1] - py) * discT;
        pz += (fnDisc[i*3+2] - pz) * discT;
      }
      arr[i*3+0] = px; arr[i*3+1] = py; arr[i*3+2] = pz;
    }
    fnGeo.attributes.position.needsUpdate = true;
    fnMat.uniforms.uConverge.value = Math.max(convergeT, wordT, discT); // cloud dispersal + disc sizing
    fnMat.uniforms.uWord.value = wordT;                         // gold only while the wordmark is formed
    fnMat.uniforms.uTime.value = t;
    fnMat.uniforms.uSea.value = discT;                          // shift to teal as they morph
    fnMat.uniforms.uFade.value = 1.0 - smoothstep(7.0, 7.3, scroll); // vanish once the tiles form
  }

  // --- Finale HERO CARD: video + text materialize in front of the particle shape ---
  finaleCard.visible = scroll > 4.0 && scroll < 5.5;
  if (finaleCard.visible) {
    const op = cardShowT * (1 - cardHoldOut);
    fcBackMat.opacity  = 0.82 * op;
    fcVideoMat.opacity = 0.96 * op;
    fcTextMat.opacity  = op;
    finaleCard.rotation.y = pointer.x * 0.16; // subtle cursor parallax tilt
    finaleCard.rotation.x = -pointer.y * 0.10;
    finaleCardHot = false;
    if (op > 0.6 && !modalOpen) {
      raycaster.setFromCamera(pointerNDC, camera);
      if (raycaster.intersectObject(fcVideo, false).length) {
        finaleCardHot = true;
        document.body.style.cursor = "pointer";
      }
    }
    // hover: gently enlarge the card (same feel as the Work cards)
    const tScl = (finaleCardHot ? 1.07 : 1.0) * fitScale();
    const sc = finaleCard.scale.x + (tScl - finaleCard.scale.x) * 0.15;
    finaleCard.scale.setScalar(sc);
  } else {
    finaleCardHot = false;
    finaleCard.scale.setScalar(fitScale()); // reset so it re-enters at normal size
  }

  // --- Section 6 (Underwater): sea environment + teal fog ---
  const seaT = smoothstep(5.05, 5.55, scroll);
  // COMPANY のロケット演出中、飛行のあいだは水中の景色を出さない。2回目以降は
  // すでに会社概要（scroll 7.25）から発進するため、そのままだと宇宙の背後に
  // 水面とヘックスグリッドが residual で映り込む。着地後は通常どおり表示する。
  sea.visible = scroll > 5.0 && !(launching && !launchLanded);
  if (sea.visible) {
    waterMat.uniforms.uTime.value = t;
    const bpos = bubGeo.attributes.position.array;
    const bubBoost = unlocking ? 7 : 1; // bubbles rush upward as we ascend
    const ue = unlocking ? clock.elapsedTime - unlockStart : 0;
    for (let i = 0; i < BUB; i++) {
      if (unlocking && ue < 1.0) { // charge: implode toward the core
        bpos[i*3+0] += (ASC_CORE.x - bpos[i*3+0]) * 0.09;
        bpos[i*3+1] += (ASC_CORE.y - bpos[i*3+1]) * 0.09;
        bpos[i*3+2] += (ASC_CORE.z - bpos[i*3+2]) * 0.09;
        continue;
      }
      bpos[i*3+1] += bubData[i*2] * dt * 1.3 * bubBoost;
      bpos[i*3+0] += Math.sin(t * 0.6 + bubData[i*2+1]) * 0.012;
      if (bpos[i*3+1] > -5.2) bpos[i*3+1] = -18;
    }
    bubGeo.attributes.position.needsUpdate = true;

    // hex grid: fade in + cursor ripple (flag-like)
    hexMesh.visible = true;
    hexMat.uniforms.uTime.value = t;
    // tiles appear after particles gather。COMPANY のロケット演出中は着地時に
    // scroll を 7.25 へ飛ばすため、ここで計算すると 1.0 になってタイルが一瞬で
    // 出てしまう。演出側（launching ブロック）が立ち上がりを持つので譲る。
    if (!launching) hexMat.uniforms.uReveal.value = smoothstep(6.70, 7.20, scroll);
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = raycaster.ray.intersectPlane(_hexPlane, _hexHit);
    let inGrid = 0;
    if (hit) {
      hexMat.uniforms.uCursor.value.set(hit.x, hit.y + 8, 0); // grid is at y -8
      inGrid = (Math.abs(hit.x - HEX_CX) < gridW * HEX_FIT / 2 + 1 && Math.abs(hit.y - HEX_CY) < gridH * HEX_FIT / 2 + 1) ? 1 : 0;
    }
    hexMat.uniforms.uHover.value += (inGrid - hexMat.uniforms.uHover.value) * 0.12;
    // (no pointer cursor over the hex grid — keep the default arrow; ripple stays)
  } else {
    hexMesh.visible = false;
  }
  // blend fog + background to a teal underwater tone
  scene.fog.color.setRGB(
    THREE.MathUtils.lerp(0.008, 0.04, seaT),
    THREE.MathUtils.lerp(0.027, 0.17, seaT),
    THREE.MathUtils.lerp(0.043, 0.21, seaT));
  scene.background.setRGB(
    THREE.MathUtils.lerp(0.008, 0.02, seaT),
    THREE.MathUtils.lerp(0.024, 0.09, seaT),
    THREE.MathUtils.lerp(0.040, 0.12, seaT));
  scene.fog.density = THREE.MathUtils.lerp(0.034, 0.05, seaT);
  document.getElementById("seatext").classList.toggle("is-in", scroll > 6.2); // after the wordmark, with the tiles
  // company profile appears/disappears WITH the video (hex tiles reveal at 6.70),
  // so scrolling back up hides it together with the screen (not with LET'S BUILD)
  document.getElementById("company").classList.toggle("is-in", scroll > 6.7);

  // Diagonal dissolve: sweep the clip line so the logo (old) and spine+cards
  // (new) split along it — left of the line = About, right = Work.
  if (scroll > 1.88 && scroll < 2.5) {
    const wt = smoothstep(1.9, 2.45, scroll); // slower line sweep
    const c = THREE.MathUtils.lerp(-13, 13, wt); // wider so the spine fully covers
    logoPlane.constant = -c;
    spinePlane.constant = c;
    // Clip the About text along the same diagonal as the spine wipe -> painted over
    camera.updateMatrixWorld();
    const yAt = (x) => -(clipN.x * x + c) / clipN.y;
    const A = new THREE.Vector3(-25, yAt(-25), 0).project(camera);
    const B = new THREE.Vector3( 25, yAt( 25), 0).project(camera);
    const ax = (A.x * 0.5 + 0.5) * 100, ay = (1 - (A.y * 0.5 + 0.5)) * 100;
    const bx = (B.x * 0.5 + 0.5) * 100, by = (1 - (B.y * 0.5 + 0.5)) * 100;
    const xAtY = (y) => ax + (bx - ax) * (y - ay) / ((by - ay) || 1e-6);
    aboutEl.style.clipPath = `polygon(${xAtY(0)}% 0, 100% 0, 100% 100%, ${xAtY(100)}% 100%)`;
  } else {
    logoPlane.constant = 1000;  // inactive: keep everything
    spinePlane.constant = 1000;
  }

  // aurora flow + periodic light sweep
  auroraMat.uniforms.uTime.value = t;
  const sweep = (Math.sin(t * 0.5) * 0.5 + 0.5);
  auroraLight.intensity = Math.pow(sweep, 3) * 5.0;
  auroraLight.position.x = -8 + Math.sin(t * 0.3) * 10;

  // Sweeping specular highlight orbits the logo -> glints travel across the
  // glass, revealing its 3D form (dimensional, not a flat colored glow).
  const orb = t * 0.8;
  specLight.position.set(Math.cos(orb) * 5.0, Math.sin(orb * 0.7) * 3.0, 6.0 + Math.sin(orb) * 2.0);
  specLight.intensity = 1.8 + (0.5 + 0.5 * Math.sin(t * 1.3)) * 1.6; // softer glints
  // Colored lights keep a steady base + cross-fade out of phase -> the glass is
  // always lit/coloured (never sinks into black), hue shifts slowly over time.
  tintA.intensity = 1.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * 0.45));
  tintB.intensity = 1.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * 0.45 + 2.1));
  tintC.intensity = 1.2 + 1.2 * (0.5 + 0.5 * Math.sin(t * 0.45 + 4.2));

  // camera: forest = elevated 3/4 look-down; About = front view; Work = pulled back
  const camYf = -pointer.y * 0.5 + tiltT * 8.5;
  const camZf = 12 + tiltT * 1.5;
  const lookYf = -tiltT * 4.0;
  let camYTarget = THREE.MathUtils.lerp(camYf, -pointer.y * 0.5, aboutT);
  let camZTarget = THREE.MathUtils.lerp(camZf, 14.0, aboutT);
  let lookYTarget = THREE.MathUtils.lerp(lookYf, 0.0, aboutT);
  const wp = Math.max(0, Math.min(1, (scroll - 2.25) / 1.05));
  camYTarget = THREE.MathUtils.lerp(camYTarget, -pointer.y * 0.5 + 0.5, workT);
  camZTarget = THREE.MathUtils.lerp(camZTarget, 13.5, workT); // constant distance (no zoom)
  lookYTarget = THREE.MathUtils.lerp(lookYTarget, 0.0, workT);
  // Finale: frame the hero card head-on with only a gentle orbital drift
  camYTarget = THREE.MathUtils.lerp(camYTarget, -pointer.y * 0.5 - 3.0, finaleT);
  lookYTarget = THREE.MathUtils.lerp(lookYTarget, -1.7, finaleT);
  const panProg = Math.max(0, Math.min(1, (scroll - 3.5) / (4.7 - 3.5)));
  const orbitAng = (panProg - 0.5) * 0.5; // ~ -14deg .. +14deg — subtle, keeps the card readable
  const orbitR = 11.5;
  let camXTarget = pointer.x * 0.8;
  camXTarget = THREE.MathUtils.lerp(camXTarget, Math.sin(orbitAng) * orbitR + pointer.x * 0.4, finaleT);
  camZTarget = THREE.MathUtils.lerp(camZTarget, Math.cos(orbitAng) * orbitR, finaleT);
  // Underwater: recentre and pull back to see the disc with the surface above
  camXTarget = THREE.MathUtils.lerp(camXTarget, pointer.x * 0.6, seaT);
  camYTarget = THREE.MathUtils.lerp(camYTarget, -pointer.y * 0.5 - 8.0, seaT); // sink through the floor, level out at the grid
  // dip in closer to the particles mid-sink (passing through the floor), then settle
  camZTarget = THREE.MathUtils.lerp(camZTarget, 13.0, seaT) - Math.sin(seaT * Math.PI) * 6.5;
  lookYTarget = THREE.MathUtils.lerp(lookYTarget, -7.3, seaT); // frontal on the hex grid, surface above
  camera.position.x += (camXTarget - camera.position.x) * 0.04;
  camera.position.y += (camYTarget - camera.position.y) * 0.04;
  camera.position.z += (camZTarget - camera.position.z) * 0.04;
  camera.lookAt(0, lookYTarget, 0);

  // --- Hidden-trigger letter glows (interactive only while the wordmark is formed) ---
  const lettersActive = scroll > 5.8 && scroll < 6.3 && !unlocking;
  for (let l = 0; l < 3; l++) {
    letterFlash[l] *= unlocking ? 0.93 : 0.94;                       // glow lingers a bit longer
    if (unlocking) letterSprites[l].position.lerp(ASC_CORE, 0.16);  // slide into the core, don't linger
    letterSprites[l].visible = lettersActive || letterFlash[l] > 0.01;
    letterSprites[l].material.opacity = Math.min(1, letterFlash[l]) * 0.95;
    const s = 1.6 * (1 + letterFlash[l] * 1.6); // bigger blast when ignited
    letterSprites[l].scale.set(s, s, 1);
  }

  // --- Ascension (~7s): particles assemble into the rocket -> it charges through
  //     space, breaks the planets, fades to black -> login ---
  if (unlocking) {
    const e = clock.elapsedTime - unlockStart;
    const surge  = smoothstep(0.3, 1.4, e) * (1.0 - smoothstep(2.4, 3.4, e));  // gentle excitement while assembling
    const introK = smoothstep(0.2, 1.4, e);                                    // blend sea camera -> chase cam
    const materialize = smoothstep(1.7, 2.7, e);                               // particles -> real rocket (+0.5s)
    const breakT = smoothstep(5.9, 6.5, e) * (1.0 - smoothstep(6.5, 7.2, e));  // planets break-through flash
    const fade   = smoothstep(6.7, 7.45, e);                                   // gradual fade to BLACK

    // CHASE CAM: sit behind the rocket, then LET IT PULL AHEAD — the camera falls
    // back so the rocket flies off into the distance and shrinks.
    const tr = travelAt(e);
    const lag = smoothstep(2.6, 7.0, e) * 95.0; // camera falls further behind -> rocket ends up smaller
    camera.position.x = THREE.MathUtils.lerp(unlockCam.x, tr.x, introK);
    camera.position.y = THREE.MathUtils.lerp(unlockCam.y, tr.y + 2.5, introK);
    camera.position.z = THREE.MathUtils.lerp(unlockCam.z, tr.z + 12.0 + lag, introK);
    camera.lookAt(tr.x, tr.y, tr.z);                                            // keep the rocket centred (in frame)
    camera.rotateZ(surge * 0.2);
    const shake = surge * 0.05 + breakT * 0.2;
    camera.position.x += Math.sin(e * 55.0) * shake;
    camera.position.y += Math.cos(e * 61.0) * shake;
    camera.fov = 42 + surge * 18;
    camera.updateProjectionMatrix();

    // restrained post FX (bloom spike on assemble + planets break-through)
    const asm = smoothstep(1.6, 1.9, e) * (1.0 - smoothstep(2.0, 2.5, e));
    bloom.strength = 0.45 + asm * 0.18 + surge * 0.2 + breakT * 0.45;
    bloom.radius = 0.6;
    rgbPass.uniforms.amount.value = surge * 0.002 + breakT * 0.003;

    // deep dark space (the rocket + space/planets are the bright subjects)
    scene.fog.color.setRGB(0.02, 0.06, 0.11);
    scene.fog.density = 0.02;
    scene.background.setRGB(0.01, 0.03, 0.06);

    // brief assemble flash where the rocket forms
    coreSprite.visible = asm > 0.01;
    coreSprite.position.set(tr.x, tr.y, tr.z);
    coreSprite.material.opacity = asm * 0.18;
    coreSprite.scale.setScalar(3.2);
    flareSprite.visible = false;
    ringSprite.visible = false;
    streaks.visible = false;
    stMat.uniforms.uWarp.value = 0.0;
    // condensed particle cluster that rushes TOWARD the camera (opposite the rocket),
    // growing as it nears and whooshing past the lens
    spaceEnv.visible = e > 1.6 && e < 7.4;
    spaceEnv.position.set(0, 2.5, THREE.MathUtils.lerp(-45, 32, smoothstep(1.8, 6.9, e)));
    planetsEnv.visible = e > 2.0;             // distant destination the rocket charges toward

    // the REAL rocket materializes (cross-fade from the particles) and charges on
    rocketOuter.visible = materialize > 0.01;
    rocketOuter.position.set(tr.x, tr.y, tr.z);
    // straighten the nose (yaw/pitch correction) + a very gentle roll for life
    rocketOuter.rotation.set(ROCKET_PITCH, ROCKET_YAW, e * 0.15);
    // rim + exhaust start OFF (normal black rocket right after it forms) and
    // strengthen as it recedes into the distance
    const recede = smoothstep(3.2, 6.7, e);
    rocketRimMat.uniforms.uStrength.value = (1 - fade) * recede * 2.2;
    const rop = materialize * (1 - fade);
    for (let k = 0; k < rocketMats.length; k++) rocketMats[k].opacity = rocketMats[k].__op * rop;

    // gradual fade to BLACK -> seamless hand-off to the (dark) login page
    whiteoutEl.style.opacity = fade.toFixed(3);

    if (e >= 7.5) { unlocking = false; window.location.href = "login.html"; }
  }

  /* --- COMPANY launch (~5.6s): the same flight, but it lands on the company
     section instead of leaving the page. Timings are compressed because this
     is in-site navigation, not a farewell. ---------------------------------
     0.0-0.9  ナビから走った光が中央へ収束（CSS の #navtrail）
     0.9-1.8  収束点でロケットが組み上がる
     1.8-3.7  宇宙を進む / すれ違う星の粒 / 惑星が近づく
     3.7-4.4  惑星を突き破るフラッシュ（到達 e≒3.95 が山）
     4.4-5.0  暗転（この裏で scroll を会社概要へ差し替える）
     5.0-5.6  ヘックスグリッドが立ち上がって明転 */
  if (launching) {
    const e = clock.elapsedTime - launchStart;
    const gather   = smoothstep(0.0, 0.9, e);   // 光が中央へ集まる
    const form     = smoothstep(0.9, 1.8, e);   // ロケット実体化
    // 貫通フラッシュは「ロケットが実際に惑星（z=-72）へ届く瞬間」に合わせる。
    // 下の ft の係数 2.1 だと到達は e≒3.95。ここを動かすなら両方あわせること。
    const breakT   = smoothstep(3.70, 3.95, e) * (1.0 - smoothstep(3.95, 4.40, e));
    const dark     = smoothstep(4.4, 5.0, e);   // 暗転
    const back     = smoothstep(5.0, 5.6, e);   // 明転（会社概要）
    const landed   = e >= 5.0;
    launchLanded = landed; // sea の表示判定（このブロックより前）が参照する

    // 暗転しきった時点で着地させる。明転したときには会社概要が出来上がっている。
    if (landed) { scroll = targetScroll = LAUNCH_LAND; }

    if (!landed) {
      // --- 飛行中はロケットだけを見せる（既存の travelAt を時間軸だけ詰めて流用）
      // 管理画面版の travelAt をそのまま使い、時間軸だけ 2.1 倍に詰める。
      // この係数で惑星（z=-72）への到達が e≒3.95 になり、上の breakT と合う。
      const ft = Math.max(0, e - 0.9) * 2.1 + 0.9;
      const tr = travelAt(ft);
      const lag = smoothstep(1.8, 4.4, e) * 78.0;
      camera.position.x = THREE.MathUtils.lerp(launchCam.x, tr.x, gather);
      camera.position.y = THREE.MathUtils.lerp(launchCam.y, tr.y + 2.5, gather);
      camera.position.z = THREE.MathUtils.lerp(launchCam.z, tr.z + 12.0 + lag, gather);
      camera.lookAt(tr.x, tr.y, tr.z);
      const shake = form * (1 - smoothstep(2.4, 3.2, e)) * 0.05 + breakT * 0.2;
      camera.position.x += Math.sin(e * 55.0) * shake;
      camera.position.y += Math.cos(e * 61.0) * shake;
      camera.fov = 42 + gather * 16 * (1 - smoothstep(2.6, 3.6, e));
      camera.updateProjectionMatrix();

      bloom.strength = 0.45 + gather * 0.2 + breakT * 0.45;
      rgbPass.uniforms.amount.value = gather * 0.002 + breakT * 0.003;
      scene.fog.color.setRGB(0.02, 0.06, 0.11);
      scene.fog.density = 0.02;
      scene.background.setRGB(0.01, 0.03, 0.06);

      // 収束点の閃光 -> ロケットが生まれる
      const asm = smoothstep(0.75, 0.95, e) * (1.0 - smoothstep(1.1, 1.6, e));
      coreSprite.visible = asm > 0.01;
      coreSprite.position.set(tr.x, tr.y, tr.z);
      coreSprite.material.opacity = asm * 0.22;
      coreSprite.scale.setScalar(3.2);

      // すれ違う星の粒。カメラ(z≒0)を e≒2.8 で通過し、貫通フラッシュ(3.95)の
      // 前に抜けきる。飛行中の速度感はここが担う。
      spaceEnv.visible = e > 0.8;
      spaceEnv.position.set(0, 2.5, THREE.MathUtils.lerp(-45, 32, smoothstep(1.0, 4.4, e)));
      planetsEnv.visible = e > 1.2;

      rocketOuter.visible = form > 0.01;
      rocketOuter.position.set(tr.x, tr.y, tr.z);
      rocketOuter.rotation.set(ROCKET_PITCH, ROCKET_YAW, e * 0.15);
      const recede = smoothstep(1.9, 4.2, e);
      rocketRimMat.uniforms.uStrength.value = recede * 2.2;
      for (let k = 0; k < rocketMats.length; k++) rocketMats[k].opacity = rocketMats[k].__op * form;
    } else {
      // --- 着地: 宇宙の小道具を全部畳んで、通常の会社概要の絵に戻す
      spaceEnv.visible = false; planetsEnv.visible = false;
      rocketOuter.visible = false; coreSprite.visible = false;
      camera.fov = 42; camera.updateProjectionMatrix();
      bloom.strength = 0.45;
      rgbPass.uniforms.amount.value = 0;
      // 暗転の裏でカメラを会社概要の定位置へ「瞬間移動」させる。通常の追従は
      // 毎フレーム 4% ずつしか寄らないので、宇宙の彼方から戻すと明転後も数秒
      // 流れ続けてしまう。ここで嵌めておけば、明けた瞬間から静止して見える。
      camera.position.set(pointer.x * 0.6, -8.0, 13.0);
      camera.lookAt(0, -7.3, 0);
    }

    // 暗転 -> 明転。惑星を突き破った先がヘックスグリッドだった、という繋ぎ。
    whiteoutEl.style.opacity = (landed ? 1 - back : dark).toFixed(3);
    if (landed) hexMat.uniforms.uReveal.value = back; // タイルが立ち上がる

    if (e >= LAUNCH_END) {
      launching = false;
      launchLanded = false;
      whiteoutEl.style.opacity = 0;
      trailEl.classList.remove("is-firing");
    }
  }

  composer.render();
}
animate();

// Browser Back restores this page from the back-forward cache: the JS state is
// thawed rather than re-run, so whatever was on screen when we left comes back.
window.addEventListener("pageshow", (ev) => {
  if (!ev.persisted) return;

  // The service pages are opened from inside the card modal, so coming back
  // would otherwise restore the page with that modal still covering the scene.
  if (modalOpen) closeCardModal();
  hoveredCard = null;
  document.body.style.cursor = "";

  // COMPANY のロケット演出の途中で離脱して戻ってきた場合。演出は時計基準で
  // 進むため、放置すると凍った画面のまま復帰する。着地点に置いて畳んでおく。
  if (launching) {
    launching = false;
    launchLanded = false;
    trailEl.classList.remove("is-firing");
    whiteoutEl.style.opacity = 0;
    camera.fov = 42; camera.updateProjectionMatrix();
    bloom.strength = 0.45; bloom.radius = 0.6;
    rgbPass.uniforms.amount.value = 0;
    coreSprite.visible = false;
    spaceEnv.visible = false; planetsEnv.visible = false; rocketOuter.visible = false;
    scroll = targetScroll = LAUNCH_LAND;
  }

  // Everything below is only for returning from login.html via the hidden
  // ascension: the page was frozen mid-whiteout and would thaw on that frame.
  // Guarding on `unlocking` matters — without it every Back, including one from
  // a service page, was yanked to the underwater wordmark at 5.95. Leaving
  // `scroll` alone lands the visitor exactly where they were, which is the card
  // they opened.
  if (!unlocking) return;

  unlocking = false; unlockStage = 0; unlockCount = 0;
  whiteoutEl.style.opacity = 0;
  camera.fov = 42; camera.updateProjectionMatrix();
  bloom.strength = 0.45; bloom.radius = 0.6;
  rgbPass.uniforms.amount.value = 0;
  streaks.visible = false; coreSprite.visible = false; flareSprite.visible = false;
  spaceEnv.visible = false; planetsEnv.visible = false; rocketOuter.visible = false;
  scroll = targetScroll = 5.95; // back on the wordmark section, no whiteout
});

/* =========================================================
   Fake loader (until we wire real asset loading)
   ========================================================= */
const loaderEl = document.getElementById("loader");
const countEl = document.getElementById("loaderCount");
const barEl = document.getElementById("loaderBar");
function showChrome() {
  document.getElementById("nav").classList.add("is-in");
}

if (document.documentElement.classList.contains("skip-intro")) {
  // reload / back-forward / return-from-subpage: no loader, jump straight in
  loaderEl.classList.add("is-done");
  showChrome();
} else {
  let prog = 0;
  const tick = setInterval(() => {
    prog += Math.random() * 14;
    if (prog >= 100) { prog = 100; clearInterval(tick); reveal(); }
    countEl.textContent = Math.floor(prog);
    barEl.style.width = prog + "%";
  }, 180);
  function reveal() {
    setTimeout(() => { loaderEl.classList.add("is-done"); showChrome(); }, 400);
  }
}
