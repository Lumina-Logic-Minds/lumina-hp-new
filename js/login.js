import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* =========================================================
   Login background — planets.glb space (the destination the
   rocket flew toward). Slow drift + subtle mouse parallax.
   ========================================================= */
const canvas = document.getElementById("space-bg");
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 4000); // telephoto -> less size falloff
const CAM_BASE_Y = 9.5;   // higher up -> looks down more
const CAM_BASE_Z = -29.0; // opposite side -> the farthest small sphere becomes the nearest
const LOOK_X = -11.0;     // (flipped for the opposite side) push the spheres a bit more LEFT
camera.position.set(0, CAM_BASE_Y, CAM_BASE_Z);

// environment for reflections so PBR/metallic materials show colour (not black)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.AmbientLight(0xbfd0f0, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.3);
key.position.set(6, 8, 7);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fbcff, 0.8);
rim.position.set(-7, -3, -5);
scene.add(rim);

const planets = new THREE.Group();
scene.add(planets);

const loader = new GLTFLoader();
if (loader.setMeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);
loader.load(
  "assets/models/planets-opt.glb",
  (gltf) => {
    const m = gltf.scene;
    const meshes = [];
    m.traverse((o) => {
      if (!o.isMesh) return;
      meshes.push(o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (!mat) return;
        mat.fog = false;
        // a metallic planet reflecting the (near-black) env renders black -> lower
        // metalness so its own albedo colour shows under the scene lights
        if ("metalness" in mat) mat.metalness = 0.15;
        if ("roughness" in mat) mat.roughness = Math.max(mat.roughness || 0.4, 0.55);
        if ("envMapIntensity" in mat) mat.envMapIntensity = 1.3;
        mat.needsUpdate = true;
      });
    });
    const box = new THREE.Box3().setFromObject(m);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const ctr = new THREE.Vector3(); box.getCenter(ctr);
    const s = 46 / (Math.max(sz.x, sz.y, sz.z) || 1);
    m.scale.setScalar(s);
    m.position.set(-ctr.x * s, -ctr.y * s, -ctr.z * s); // centre at origin
    planets.add(m);

    // enlarge ONLY the biggest mesh (the surrounding sphere) so its inner surface
    // is farther from the camera and reads sharper — the small sphere stays put
    let bg = null, bgR = 0;
    meshes.forEach((o) => {
      o.geometry.computeBoundingSphere();
      const r = o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : 0;
      if (r > bgR) { bgR = r; bg = o; }
    });
    if (bg) bg.scale.multiplyScalar(2.5);
    console.log("planets-opt.glb loaded for the login space");
  },
  undefined,
  () => console.warn("planets-opt.glb not found")
);

/* subtle mouse parallax */
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener("pointermove", (e) => {
  pointer.tx = e.clientX / window.innerWidth - 0.5;
  pointer.ty = e.clientY / window.innerHeight - 0.5;
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  planets.rotation.y = t * 0.05;               // slow drift (a bit faster)
  planets.rotation.x = Math.sin(t * 0.02) * 0.05;
  pointer.x += (pointer.tx - pointer.x) * 0.04;
  pointer.y += (pointer.ty - pointer.y) * 0.04;
  camera.position.x = pointer.x * 9;
  camera.position.y = CAM_BASE_Y - pointer.y * 9;
  camera.position.z = CAM_BASE_Z;
  camera.lookAt(LOOK_X, 0, 0);
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
