// NovaForge Engine v0.5.0
// Loader fix: use dynamic imports + import map so Three.js addon modules resolve correctly.
// If the CDN/module import fails, NovaForge now starts a self-contained fallback editor instead of leaving buttons dead.

async function loadNovaForge() {
  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
    const { TransformControls } = await import("three/addons/controls/TransformControls.js");
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    startRealThreeEditor(THREE, OrbitControls, TransformControls, FBXLoader, GLTFLoader, OBJLoader);
  } catch (error) {
    console.error("NovaForge Three.js module load failed. Starting fallback editor.", error);
    startFallbackEditor(error);
  }
}

function startRealThreeEditor(THREE, OrbitControls, TransformControls, FBXLoader, GLTFLoader, OBJLoader) {

const $ = (id) => document.getElementById(id);
const viewport = $("viewport");
const statusText = $("statusText");
const objectCount = $("objectCount");
const hierarchyEl = $("hierarchy");
const assetListEl = $("assetList");
const inspector = $("inspector");
const inspectorEmpty = $("inspectorEmpty");
const clipListEl = $("clipList");
const keyframeListEl = $("keyframeList");
const loadingOverlay = $("loadingOverlay");
const loadingText = $("loadingText");

const state = {
  sceneObjects: [],
  assets: [],
  selected: null,
  mixers: [],
  playMode: false,
  snapEnabled: false,
  gridVisible: true,
  wireframe: false,
  animationKeyframes: {},
  activeCreatedMixer: null,
  clock: new THREE.Clock(),
  projectName: "NovaForgeProject",
  keys: new Set(),
  score: 0,
  gravity: -22,
  playSnapshot: new Map(),
  cameraMode: "followPlayer",
  cameraFollowDistance: 7,
  cameraFollowHeight: 4,
  cameraSmoothing: 0.12,
  playerObject: null
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f1f);
scene.fog = new THREE.Fog(0x0a0f1f, 45, 160);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(8, 6, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.target.set(0, 1, 0);

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode("translate");
transform.setSize(0.85);
scene.add(transform);
transform.addEventListener("dragging-changed", (event) => {
  orbit.enabled = !event.value;
  updateInspectorFromSelection();
  renderHierarchy();
});
transform.addEventListener("objectChange", () => {
  updateInspectorFromSelection();
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const grid = new THREE.GridHelper(80, 80, 0x4f8cff, 0x233455);
grid.name = "Editor Grid";
scene.add(grid);

const hemiLight = new THREE.HemisphereLight(0xcde5ff, 0x13151f, 1.2);
hemiLight.name = "World Ambient Light";
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffffff, 2.8);
sun.name = "Directional Sun";
sun.position.set(6, 10, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
scene.add(sun);

const loaders = {
  fbx: new FBXLoader(),
  gltf: new GLTFLoader(),
  obj: new OBJLoader()
};

function setStatus(message) {
  statusText.textContent = message;
}

function showLoading(message) {
  loadingText.textContent = message;
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function uid(prefix = "nf") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createStandardMaterial(color = 0x4f8cff) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 });
}

function defaultPhysicsForType(type = "object") {
  const isPlayer = type === "player";
  const isStatic = ["terrain", "plane", "platform"].includes(type);
  return {
    enabled: isPlayer || isStatic,
    bodyType: isPlayer ? "character" : isStatic ? "static" : "none",
    useGravity: isPlayer,
    velocity: { x: 0, y: 0, z: 0 },
    grounded: false,
    speed: isPlayer ? 7 : 0,
    jump: isPlayer ? 9 : 0,
    mass: 1,
    colliderPadding: 0.06
  };
}

function ensureGameplayData(object, type = "object") {
  object.userData.physics = { ...defaultPhysicsForType(type), ...(object.userData.physics || {}) };
  object.userData.scripts = Array.isArray(object.userData.scripts) ? object.userData.scripts : [];
  if (type === "player" && !object.userData.scripts.some((script) => script.preset === "playerInput")) {
    object.userData.scripts.push({ name: "Player Input", preset: "playerInput" });
  }
  object.userData.cameraFollowTarget = object.userData.cameraFollowTarget ?? type === "player";
  if (type === "player") state.playerObject = object;
}

function markEditable(object, type = "object") {
  object.userData.novaId = object.userData.novaId || uid(type);
  object.userData.novaType = type;
  object.userData.editable = true;
  ensureGameplayData(object, type);
  object.traverse((child) => {
    child.userData.rootId = object.userData.novaId;
    child.userData.editableChild = true;
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((mat) => { mat.side = THREE.DoubleSide; });
        else child.material.side = THREE.DoubleSide;
      }
    }
  });
  state.sceneObjects.push(object);
  renderHierarchy();
  updateObjectCount();
  return object;
}

function addObject(type) {
  let object;
  const material = createStandardMaterial();

  if (type === "cube") {
    object = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), material);
    object.name = `Cube ${state.sceneObjects.length + 1}`;
    object.position.set(0, 0.8, 0);
  }

  if (type === "sphere") {
    object = new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 24), material);
    object.name = `Sphere ${state.sceneObjects.length + 1}`;
    object.position.set(0, 0.9, 0);
  }

  if (type === "plane") {
    object = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), createStandardMaterial(0x376d5a));
    object.name = `Plane ${state.sceneObjects.length + 1}`;
    object.rotation.x = -Math.PI / 2;
    object.receiveShadow = true;
  }

  if (type === "terrain") {
    const geometry = new THREE.PlaneGeometry(14, 14, 32, 32);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const height = Math.sin(x * 1.1) * Math.cos(y * 0.9) * 0.38 + Math.random() * 0.08;
      positions.setZ(i, height);
    }
    geometry.computeVertexNormals();
    object = new THREE.Mesh(geometry, createStandardMaterial(0x3d8f63));
    object.name = `Terrain ${state.sceneObjects.length + 1}`;
    object.rotation.x = -Math.PI / 2;
    object.receiveShadow = true;
  }

  if (type === "platform") {
    object = new THREE.Mesh(new THREE.BoxGeometry(4, 0.45, 4), createStandardMaterial(0x5ed0ff));
    object.name = `Platform ${state.sceneObjects.length + 1}`;
    object.position.set(2, 1.1, 0);
    object.receiveShadow = true;
    object.castShadow = true;
  }

  if (type === "player") {
    object = new THREE.Group();
    object.name = `Player ${state.sceneObjects.length + 1}`;
    object.position.set(0, 1.05, 0);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.05, 8, 16), createStandardMaterial(0x2ed47a));
    body.name = "Character Body";
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 12), createStandardMaterial(0xffd166));
    head.name = "Character Head";
    head.position.y = 1.42;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.42, -0.36);
    object.add(body, head, nose);
  }

  if (type === "light") {
    object = new THREE.PointLight(0x9fd7ff, 40, 20, 1.8);
    object.name = `Point Light ${state.sceneObjects.length + 1}`;
    object.position.set(2, 4, 2);
    const helperGeometry = new THREE.SphereGeometry(0.18, 16, 8);
    const helperMaterial = new THREE.MeshBasicMaterial({ color: 0x9fd7ff });
    const helper = new THREE.Mesh(helperGeometry, helperMaterial);
    helper.name = "Light Icon";
    object.add(helper);
  }

  if (type === "camera") {
    object = new THREE.Group();
    object.name = `Camera Marker ${state.sceneObjects.length + 1}`;
    object.position.set(0, 2.2, 4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.35), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    const lens = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.4;
    object.add(body, lens);
  }

  if (!object) return;
  scene.add(object);
  markEditable(object, type);
  selectObject(object);
  setStatus(`Added ${object.name}.`);
}

function getRootEditable(object) {
  if (!object) return null;
  let current = object;
  while (current && current.parent) {
    if (current.userData?.editable) return current;
    if (current.userData?.rootId) {
      const root = state.sceneObjects.find((item) => item.userData.novaId === current.userData.rootId);
      if (root) return root;
    }
    current = current.parent;
  }
  return object.userData?.editable ? object : null;
}

function selectObject(object) {
  const root = getRootEditable(object);
  if (!root) {
    deselectObject();
    return;
  }
  state.selected = root;
  transform.attach(root);
  renderHierarchy();
  updateInspectorFromSelection();
  updateClipList();
  setStatus(`Selected ${root.name}.`);
}

function deselectObject() {
  state.selected = null;
  transform.detach();
  renderHierarchy();
  updateInspectorFromSelection();
  updateClipList();
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const selectable = [];
  state.sceneObjects.forEach((object) => {
    object.traverse((child) => {
      if (child.isMesh || child.isLight || child.isGroup) selectable.push(child);
    });
  });
  const hits = raycaster.intersectObjects(selectable, true);
  if (hits.length > 0) selectObject(hits[0].object);
}

function updateObjectCount() {
  objectCount.textContent = `${state.sceneObjects.length} object${state.sceneObjects.length === 1 ? "" : "s"}`;
}

function renderHierarchy() {
  hierarchyEl.innerHTML = "";
  if (state.sceneObjects.length === 0) {
    hierarchyEl.className = "scroll-list empty";
    hierarchyEl.textContent = "No objects yet.";
    return;
  }
  hierarchyEl.className = "scroll-list";
  state.sceneObjects.forEach((object) => {
    const item = document.createElement("div");
    item.className = `item ${state.selected === object ? "active" : ""}`;
    item.innerHTML = `<span>${escapeHtml(object.name || "Unnamed")}</span><small>${escapeHtml(object.userData.novaType || object.type)}</small>`;
    item.addEventListener("click", () => selectObject(object));
    hierarchyEl.appendChild(item);
  });
}

function renderAssetList() {
  assetListEl.innerHTML = "";
  if (state.assets.length === 0) {
    assetListEl.className = "scroll-list empty";
    assetListEl.textContent = "No imported assets yet.";
    return;
  }
  assetListEl.className = "scroll-list";
  state.assets.forEach((asset) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<span>${escapeHtml(asset.name)}</span><small>${escapeHtml(asset.kind)}</small>`;
    item.title = "Click to select/add loaded asset";
    item.addEventListener("click", () => {
      if (asset.objectId) {
        const object = state.sceneObjects.find((obj) => obj.userData.novaId === asset.objectId);
        if (object) selectObject(object);
      }
    });
    assetListEl.appendChild(item);
  });
}

function updateInspectorFromSelection() {
  const object = state.selected;
  if (!object) {
    inspector.classList.add("hidden");
    inspectorEmpty.classList.remove("hidden");
    return;
  }
  inspector.classList.remove("hidden");
  inspectorEmpty.classList.add("hidden");
  $("objName").value = object.name || "";
  $("objType").value = object.userData.novaType || object.type || "Object";
  $("posX").value = round(object.position.x);
  $("posY").value = round(object.position.y);
  $("posZ").value = round(object.position.z);
  $("rotX").value = round(THREE.MathUtils.radToDeg(object.rotation.x));
  $("rotY").value = round(THREE.MathUtils.radToDeg(object.rotation.y));
  $("rotZ").value = round(THREE.MathUtils.radToDeg(object.rotation.z));
  $("scaleX").value = round(object.scale.x);
  $("scaleY").value = round(object.scale.y);
  $("scaleZ").value = round(object.scale.z);
  $("visibleToggle").checked = object.visible;
  $("castShadowToggle").checked = getFirstMesh(object)?.castShadow ?? false;
  const physics = object.userData.physics || defaultPhysicsForType(object.userData.novaType);
  if ($("physicsEnabled")) $("physicsEnabled").checked = !!physics.enabled;
  if ($("physicsBodyType")) $("physicsBodyType").value = physics.bodyType || "none";
  if ($("physicsGravity")) $("physicsGravity").checked = !!physics.useGravity;
  if ($("physicsSpeed")) $("physicsSpeed").value = physics.speed ?? 0;
  if ($("physicsJump")) $("physicsJump").value = physics.jump ?? 0;
  if ($("cameraTargetToggle")) $("cameraTargetToggle").checked = !!object.userData.cameraFollowTarget;
  renderScriptList();
  const firstMaterial = getFirstMaterial(object);
  if (firstMaterial?.color) $("matColor").value = `#${firstMaterial.color.getHexString()}`;
  $("opacity").value = firstMaterial?.opacity ?? 1;
  renderKeyframeList();
}

function applyInspectorToSelection() {
  const object = state.selected;
  if (!object) return;
  object.name = $("objName").value || object.name;
  object.position.set(num("posX"), num("posY"), num("posZ"));
  object.rotation.set(
    THREE.MathUtils.degToRad(num("rotX")),
    THREE.MathUtils.degToRad(num("rotY")),
    THREE.MathUtils.degToRad(num("rotZ"))
  );
  object.scale.set(Math.max(0.001, num("scaleX")), Math.max(0.001, num("scaleY")), Math.max(0.001, num("scaleZ")));
  object.visible = $("visibleToggle").checked;
  object.userData.physics = object.userData.physics || defaultPhysicsForType(object.userData.novaType);
  if ($("physicsEnabled")) object.userData.physics.enabled = $("physicsEnabled").checked;
  if ($("physicsBodyType")) object.userData.physics.bodyType = $("physicsBodyType").value;
  if ($("physicsGravity")) object.userData.physics.useGravity = $("physicsGravity").checked;
  if ($("physicsSpeed")) object.userData.physics.speed = num("physicsSpeed");
  if ($("physicsJump")) object.userData.physics.jump = num("physicsJump");
  if ($("cameraTargetToggle")) object.userData.cameraFollowTarget = $("cameraTargetToggle").checked;
  if (object.userData.physics.bodyType === "character") state.playerObject = object;
  const color = new THREE.Color($("matColor").value);
  const opacity = parseFloat($("opacity").value);
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = $("castShadowToggle").checked;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        if (mat.color) mat.color.copy(color);
        mat.opacity = opacity;
        mat.transparent = opacity < 1;
        mat.needsUpdate = true;
      });
    }
  });
  renderHierarchy();
}

function getFirstMesh(object) {
  let found = null;
  object?.traverse((child) => {
    if (!found && child.isMesh) found = child;
  });
  return found;
}

function getFirstMaterial(object) {
  const mesh = getFirstMesh(object);
  if (!mesh?.material) return null;
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

function num(id) {
  const value = parseFloat($(id).value);
  return Number.isFinite(value) ? value : 0;
}

function round(value) {
  return Number.parseFloat(value).toFixed(3).replace(/\.000$/, "");
}

function duplicateSelected() {
  if (!state.selected) return;
  const source = state.selected;
  const clone = source.clone(true);
  clone.name = `${source.name} Copy`;
  clone.userData = { ...source.userData, novaId: uid(source.userData.novaType || "object") };
  clone.position.x += 1;
  clone.position.z += 1;
  scene.add(clone);
  markEditable(clone, source.userData.novaType || "object");
  selectObject(clone);
  setStatus(`Duplicated ${source.name}.`);
}

function deleteSelected() {
  if (!state.selected) return;
  const object = state.selected;
  transform.detach();
  scene.remove(object);
  state.sceneObjects = state.sceneObjects.filter((item) => item !== object);
  state.assets.forEach((asset) => {
    if (asset.objectId === object.userData.novaId) asset.objectId = null;
  });
  state.selected = null;
  renderHierarchy();
  renderAssetList();
  updateObjectCount();
  updateInspectorFromSelection();
  setStatus(`Deleted ${object.name}.`);
}

async function importModels(files) {
  for (const file of files) {
    await importModel(file);
  }
}

function importModel(file) {
  return new Promise((resolve) => {
    const ext = file.name.split(".").pop().toLowerCase();
    const url = URL.createObjectURL(file);
    showLoading(`Importing ${file.name}...`);
    const onLoaded = (object, clips = []) => {
      object.name = file.name.replace(/\.[^/.]+$/, "");
      normalizeImportedObject(object);
      object.userData.sourceFile = file.name;
      object.userData.animationClips = clips;
      scene.add(object);
      markEditable(object, ext === "fbx" ? "fbx-model" : `${ext}-model`);
      state.assets.push({ id: uid("asset"), name: file.name, kind: ext.toUpperCase(), objectId: object.userData.novaId, clips: clips.map((clip) => clip.name) });
      renderAssetList();
      selectObject(object);
      URL.revokeObjectURL(url);
      hideLoading();
      setStatus(`Imported ${file.name}${clips.length ? ` with ${clips.length} animation clip(s)` : ""}.`);
      resolve();
    };
    const onError = (error) => {
      console.error(error);
      URL.revokeObjectURL(url);
      hideLoading();
      setStatus(`Import failed for ${file.name}. Use GLB for best browser support.`);
      createImportPlaceholder(file.name, ext);
      resolve();
    };

    if (ext === "fbx") {
      loaders.fbx.load(url, (fbx) => onLoaded(fbx, fbx.animations || []), undefined, onError);
      return;
    }
    if (ext === "glb" || ext === "gltf") {
      loaders.gltf.load(url, (gltf) => onLoaded(gltf.scene, gltf.animations || []), undefined, onError);
      return;
    }
    if (ext === "obj") {
      loaders.obj.load(url, (obj) => onLoaded(obj, []), undefined, onError);
      return;
    }
    hideLoading();
    setStatus(`Unsupported file type: ${file.name}.`);
    resolve();
  });
}

function importAnimationFiles(files) {
  if (!state.selected) {
    setStatus("Select a model first, then import animation files.");
    return;
  }
  Array.from(files).forEach((file) => importAnimationFile(file, state.selected));
}

function importAnimationFile(file, target) {
  const ext = file.name.split(".").pop().toLowerCase();
  const url = URL.createObjectURL(file);
  showLoading(`Importing animation ${file.name}...`);
  const addClips = (clips) => {
    target.userData.animationClips = [...(target.userData.animationClips || []), ...clips];
    state.assets.push({ id: uid("anim"), name: file.name, kind: `Animation ${ext.toUpperCase()}`, objectId: target.userData.novaId, clips: clips.map((clip) => clip.name) });
    URL.revokeObjectURL(url);
    hideLoading();
    updateClipList();
    renderAssetList();
    setStatus(`Imported ${clips.length} animation clip(s) into ${target.name}.`);
  };
  const onError = (error) => {
    console.error(error);
    URL.revokeObjectURL(url);
    hideLoading();
    setStatus(`Animation import failed for ${file.name}. Try GLB/GLTF animation export from Blender.`);
  };
  if (ext === "fbx") loaders.fbx.load(url, (fbx) => addClips(fbx.animations || []), undefined, onError);
  else if (ext === "glb" || ext === "gltf") loaders.gltf.load(url, (gltf) => addClips(gltf.animations || []), undefined, onError);
  else {
    hideLoading();
    setStatus("Unsupported animation format. Use FBX, GLB, or GLTF.");
  }
}

function normalizeImportedObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis > 0) {
    const scale = 3 / maxAxis;
    object.scale.multiplyScalar(scale);
  }
  object.position.sub(center.multiplyScalar(object.scale.x));
  object.position.y += 1.5;
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.material) child.material = createStandardMaterial(0x9d6cff);
    }
  });
}

function createImportPlaceholder(name, ext) {
  const group = new THREE.Group();
  group.name = `${name} Placeholder`;
  group.userData.sourceFile = name;
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xff5470, wireframe: true }));
  const label = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  label.position.y = 1.25;
  group.add(box, label);
  group.position.set(0, 1.1, 0);
  scene.add(group);
  markEditable(group, `${ext}-placeholder`);
  state.assets.push({ id: uid("asset"), name, kind: `${ext.toUpperCase()} placeholder`, objectId: group.userData.novaId, clips: [] });
  renderAssetList();
  selectObject(group);
}

function updateClipList() {
  clipListEl.innerHTML = "";
  const clips = state.selected?.userData?.animationClips || [];
  const created = state.selected?.userData?.createdClips || [];
  const allClips = [...clips, ...created];
  if (!state.selected || allClips.length === 0) {
    clipListEl.className = "scroll-list compact empty";
    clipListEl.textContent = state.selected ? "No imported clips on this object." : "Select an imported animated model.";
    return;
  }
  clipListEl.className = "scroll-list compact";
  allClips.forEach((clip, index) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<span>${escapeHtml(clip.name || `Clip ${index + 1}`)}</span><small>${round(clip.duration || 0)}s</small>`;
    item.addEventListener("click", () => playClip(state.selected, clip));
    clipListEl.appendChild(item);
  });
}

function stopAllAnimations() {
  state.mixers.forEach((entry) => {
    entry.actions?.forEach((action) => action.stop());
  });
  state.mixers = [];
  if (state.activeCreatedMixer) {
    state.activeCreatedMixer.stopAllAction();
    state.activeCreatedMixer = null;
  }
  setStatus("Stopped animations.");
}

function playClip(object, clip) {
  if (!object || !clip) return;
  stopAllAnimations();
  const mixer = new THREE.AnimationMixer(object);
  const action = mixer.clipAction(clip);
  action.reset();
  action.play();
  state.mixers.push({ mixer, object, actions: [action] });
  setStatus(`Playing ${clip.name || "animation"} on ${object.name}.`);
}

function captureKeyframe() {
  const object = state.selected;
  if (!object) {
    setStatus("Select an object before capturing a keyframe.");
    return;
  }
  const animationName = $("animationName").value.trim() || "NewAnimation";
  const key = object.userData.novaId;
  state.animationKeyframes[key] = state.animationKeyframes[key] || {};
  state.animationKeyframes[key][animationName] = state.animationKeyframes[key][animationName] || [];
  const time = Math.max(0, parseFloat($("keyTime").value) || 0);
  const frame = {
    time,
    position: object.position.toArray(),
    rotation: object.quaternion.toArray(),
    scale: object.scale.toArray()
  };
  const frames = state.animationKeyframes[key][animationName];
  const existingIndex = frames.findIndex((item) => Math.abs(item.time - time) < 0.0001);
  if (existingIndex >= 0) frames[existingIndex] = frame;
  else frames.push(frame);
  frames.sort((a, b) => a.time - b.time);
  $("keyTime").value = round(time + 0.5);
  renderKeyframeList();
  setStatus(`Captured keyframe at ${time}s for ${object.name}.`);
}

function renderKeyframeList() {
  keyframeListEl.innerHTML = "";
  const object = state.selected;
  if (!object) {
    keyframeListEl.className = "scroll-list compact empty";
    keyframeListEl.textContent = "Select an object to create animations.";
    return;
  }
  const animationName = $("animationName").value.trim() || "NewAnimation";
  const frames = state.animationKeyframes[object.userData.novaId]?.[animationName] || [];
  if (frames.length === 0) {
    keyframeListEl.className = "scroll-list compact empty";
    keyframeListEl.textContent = "No keyframes captured.";
    return;
  }
  keyframeListEl.className = "scroll-list compact";
  frames.forEach((frame, index) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<span>Keyframe ${index + 1}</span><small>${round(frame.time)}s</small>`;
    item.addEventListener("click", () => {
      object.position.fromArray(frame.position);
      object.quaternion.fromArray(frame.rotation);
      object.scale.fromArray(frame.scale);
      updateInspectorFromSelection();
      setStatus(`Jumped to keyframe ${index + 1}.`);
    });
    keyframeListEl.appendChild(item);
  });
}

function createClipFromKeyframes(object) {
  const animationName = $("animationName").value.trim() || "NewAnimation";
  const frames = state.animationKeyframes[object.userData.novaId]?.[animationName] || [];
  if (frames.length < 2) {
    setStatus("Capture at least two keyframes before playing a created animation.");
    return null;
  }
  const duration = Math.max(parseFloat($("animDuration").value) || 0, frames[frames.length - 1].time || 1);
  const times = frames.map((frame) => frame.time);
  const positions = frames.flatMap((frame) => frame.position);
  const rotations = frames.flatMap((frame) => frame.rotation);
  const scales = frames.flatMap((frame) => frame.scale);
  const tracks = [
    new THREE.VectorKeyframeTrack(".position", times, positions),
    new THREE.QuaternionKeyframeTrack(".quaternion", times, rotations),
    new THREE.VectorKeyframeTrack(".scale", times, scales)
  ];
  const clip = new THREE.AnimationClip(animationName, duration, tracks);
  object.userData.createdClips = object.userData.createdClips || [];
  const existingIndex = object.userData.createdClips.findIndex((item) => item.name === animationName);
  if (existingIndex >= 0) object.userData.createdClips[existingIndex] = clip;
  else object.userData.createdClips.push(clip);
  updateClipList();
  return clip;
}

function playCreatedAnimation() {
  const object = state.selected;
  if (!object) {
    setStatus("Select an object to play a created animation.");
    return;
  }
  const clip = createClipFromKeyframes(object);
  if (clip) playClip(object, clip);
}

function clearKeyframes() {
  const object = state.selected;
  if (!object) return;
  const animationName = $("animationName").value.trim() || "NewAnimation";
  if (state.animationKeyframes[object.userData.novaId]) {
    state.animationKeyframes[object.userData.novaId][animationName] = [];
  }
  renderKeyframeList();
  setStatus(`Cleared keyframes for ${animationName}.`);
}

function renderScriptList() {
  const list = $("scriptList");
  if (!list) return;
  const object = state.selected;
  if (!object) {
    list.className = "scroll-list compact empty";
    list.textContent = "Select an object to add scripts.";
    return;
  }
  const scripts = object.userData.scripts || [];
  if (scripts.length === 0) {
    list.className = "scroll-list compact empty";
    list.textContent = "No scripts attached.";
    return;
  }
  list.className = "scroll-list compact";
  list.innerHTML = scripts.map((script, index) => `<div class="script-chip"><span>${escapeHtml(script.name || script.preset)}</span><button data-remove-script="${index}">Remove</button></div>`).join("");
  list.querySelectorAll("[data-remove-script]").forEach((button) => {
    button.addEventListener("click", () => {
      object.userData.scripts.splice(Number(button.dataset.removeScript), 1);
      renderScriptList();
      setStatus(`Removed script from ${object.name}.`);
    });
  });
}

function addScriptToSelected() {
  const object = state.selected;
  if (!object) {
    setStatus("Select an object before adding a script.");
    return;
  }
  const preset = $("scriptPreset")?.value || "rotator";
  const names = { rotator: "Rotator", bob: "Hover Bob", patrol: "Side Patrol", collectable: "Collectable", playerInput: "Player Input" };
  object.userData.scripts = object.userData.scripts || [];
  if (!object.userData.scripts.some((script) => script.preset === preset)) {
    object.userData.scripts.push({ name: names[preset] || preset, preset });
  }
  if (preset === "playerInput") {
    object.userData.physics = { ...defaultPhysicsForType("player"), ...(object.userData.physics || {}), enabled: true, bodyType: "character", useGravity: true };
    object.userData.cameraFollowTarget = true;
    state.playerObject = object;
    updateInspectorFromSelection();
  }
  renderScriptList();
  setStatus(`Added ${names[preset] || preset} script to ${object.name}.`);
}

function focusSelected() {
  if (!state.selected) return;
  const box = new THREE.Box3().setFromObject(state.selected);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const distance = Math.max(size.length() * 1.5, 4);
  const direction = new THREE.Vector3().subVectors(camera.position, orbit.target).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  orbit.target.copy(center);
  orbit.update();
}

function setCameraView(view) {
  const target = state.selected ? new THREE.Box3().setFromObject(state.selected).getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 1, 0);
  const distance = 12;
  if (view === "perspective") camera.position.set(target.x + 8, target.y + 6, target.z + 8);
  if (view === "top") camera.position.set(target.x, target.y + distance, target.z + 0.001);
  if (view === "front") camera.position.set(target.x, target.y + 2, target.z + distance);
  if (view === "right") camera.position.set(target.x + distance, target.y + 2, target.z);
  orbit.target.copy(target);
  camera.lookAt(target);
  orbit.update();
  document.querySelectorAll("[data-camera]").forEach((button) => button.classList.toggle("active", button.dataset.camera === view));
}

function toggleWireframe() {
  state.wireframe = !state.wireframe;
  state.sceneObjects.forEach((object) => {
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => { mat.wireframe = state.wireframe; });
      }
    });
  });
  $("wireToggleBtn").textContent = state.wireframe ? "Wire On" : "Wire Off";
  $("wireToggleBtn").classList.toggle("active", state.wireframe);
}

function setTool(mode) {
  const transformMode = mode === "move" ? "translate" : mode;
  if (["translate", "rotate", "scale"].includes(transformMode)) transform.setMode(transformMode);
  document.querySelectorAll("#selectToolBtn,#moveToolBtn,#rotateToolBtn,#scaleToolBtn").forEach((button) => button.classList.remove("active"));
  if (mode === "select") $("selectToolBtn").classList.add("active");
  if (mode === "move") $("moveToolBtn").classList.add("active");
  if (mode === "rotate") $("rotateToolBtn").classList.add("active");
  if (mode === "scale") $("scaleToolBtn").classList.add("active");
}

function toggleSnap() {
  state.snapEnabled = !state.snapEnabled;
  transform.setTranslationSnap(state.snapEnabled ? 0.5 : null);
  transform.setRotationSnap(state.snapEnabled ? THREE.MathUtils.degToRad(15) : null);
  transform.setScaleSnap(state.snapEnabled ? 0.1 : null);
  $("snapToggleBtn").textContent = state.snapEnabled ? "Snap On" : "Snap Off";
  $("snapToggleBtn").classList.toggle("active", state.snapEnabled);
}

function getPlayablePlayer() {
  if (state.playerObject && state.sceneObjects.includes(state.playerObject)) return state.playerObject;
  const character = state.sceneObjects.find((object) => object.userData.physics?.bodyType === "character");
  if (character) {
    state.playerObject = character;
    return character;
  }
  const scripted = state.sceneObjects.find((object) => object.userData.scripts?.some((script) => script.preset === "playerInput"));
  if (scripted) {
    state.playerObject = scripted;
    return scripted;
  }
  return null;
}

function getWorldBox(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || box.isEmpty()) {
    const size = new THREE.Vector3(1, 1, 1).multiply(object.scale);
    box.setFromCenterAndSize(object.position, size);
  }
  return box;
}

function horizontalOverlap(a, b) {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.z <= b.max.z && a.max.z >= b.min.z;
}

function staticColliders() {
  return state.sceneObjects.filter((object) => object.visible && object.userData.physics?.enabled && object.userData.physics?.bodyType === "static");
}

function resolveGround(object, oldY) {
  const physics = object.userData.physics;
  let box = getWorldBox(object);
  physics.grounded = false;
  const oldBottom = box.min.y - (object.position.y - oldY);
  for (const ground of staticColliders()) {
    if (ground === object) continue;
    const groundBox = getWorldBox(ground);
    if (!horizontalOverlap(box, groundBox)) continue;
    const top = groundBox.max.y;
    const fallingOntoTop = oldBottom >= top - 0.35 && box.min.y <= top + 0.08 && (physics.velocity?.y || 0) <= 0;
    if (fallingOntoTop) {
      object.position.y += top - box.min.y;
      physics.velocity.y = 0;
      physics.grounded = true;
      box = getWorldBox(object);
    }
  }
  if (box.min.y < 0) {
    object.position.y += -box.min.y;
    physics.velocity.y = 0;
    physics.grounded = true;
  }
}

function resolveHorizontalCollision(object, oldX, oldZ) {
  const box = getWorldBox(object);
  for (const ground of staticColliders()) {
    if (ground === object) continue;
    const groundBox = getWorldBox(ground);
    const standingOnTop = Math.abs(box.min.y - groundBox.max.y) < 0.12;
    if (!standingOnTop && box.intersectsBox(groundBox)) {
      object.position.x = oldX;
      object.position.z = oldZ;
      return;
    }
  }
}

function updateCharacterController(object, dt) {
  const physics = object.userData.physics || defaultPhysicsForType("player");
  object.userData.physics = physics;
  physics.velocity = physics.velocity || { x: 0, y: 0, z: 0 };
  const speed = Number(physics.speed || 7);
  const jump = Number(physics.jump || 9);
  const move = new THREE.Vector3();
  if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) move.z -= 1;
  if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) move.z += 1;
  if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) move.x -= 1;
  if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) move.x += 1;

  const oldX = object.position.x;
  const oldY = object.position.y;
  const oldZ = object.position.z;
  if (move.lengthSq() > 0) {
    move.normalize();
    object.position.x += move.x * speed * dt;
    object.position.z += move.z * speed * dt;
    object.lookAt(object.position.x + move.x, object.position.y, object.position.z + move.z);
    resolveHorizontalCollision(object, oldX, oldZ);
  }

  if ((state.keys.has("Space") || state.keys.has("KeyJ")) && physics.grounded) {
    physics.velocity.y = jump;
    physics.grounded = false;
  }
  if (physics.useGravity !== false) physics.velocity.y += state.gravity * dt;
  object.position.y += physics.velocity.y * dt;
  resolveGround(object, oldY);
}

function updateDynamicBody(object, dt) {
  const physics = object.userData.physics;
  if (!physics?.enabled || physics.bodyType !== "dynamic") return;
  physics.velocity = physics.velocity || { x: 0, y: 0, z: 0 };
  const oldY = object.position.y;
  if (physics.useGravity !== false) physics.velocity.y += state.gravity * dt;
  object.position.y += physics.velocity.y * dt;
  resolveGround(object, oldY);
}

function updateScriptComponents(dt, player) {
  state.sceneObjects.forEach((object) => {
    for (const script of object.userData.scripts || []) {
      if (script.preset === "rotator") object.rotation.y += dt * 1.6;
      if (script.preset === "bob") object.position.y += Math.sin(performance.now() / 220) * 0.0025;
      if (script.preset === "patrol") object.position.x += Math.sin(performance.now() / 700) * 0.012;
      if (script.preset === "collectable" && player && object.visible) {
        const distance = object.position.distanceTo(player.position);
        if (distance < 1.15) {
          object.visible = false;
          state.score += 1;
          if ($("scoreText")) $("scoreText").textContent = `Score: ${state.score}`;
          setStatus(`Collected ${object.name}. Score ${state.score}.`);
        }
      }
    }
  });
}

function updateGame(dt) {
  const player = getPlayablePlayer();
  state.sceneObjects.forEach((object) => updateDynamicBody(object, dt));
  if (player) updateCharacterController(player, dt);
  updateScriptComponents(dt, player);
}

function getCameraTarget() {
  if (state.cameraMode === "followSelected" && state.selected) return state.selected;
  if (state.cameraMode === "followPlayer" || state.cameraMode === "firstPerson") return getPlayablePlayer();
  return state.sceneObjects.find((object) => object.userData.cameraFollowTarget) || getPlayablePlayer();
}

function updateCameraFollow(dt) {
  if (!state.playMode || state.cameraMode === "free") return;
  const target = getCameraTarget();
  if (!target) return;
  const targetPos = new THREE.Vector3();
  target.getWorldPosition(targetPos);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(target.quaternion).normalize();
  if (state.cameraMode === "firstPerson") {
    const eye = targetPos.clone().add(new THREE.Vector3(0, 1.55, 0));
    camera.position.lerp(eye, 0.4);
    orbit.target.copy(eye.clone().add(forward.multiplyScalar(8)));
    camera.lookAt(orbit.target);
    return;
  }
  const distance = Number($("cameraFollowDistance")?.value || state.cameraFollowDistance || 7);
  const height = Number($("cameraFollowHeight")?.value || state.cameraFollowHeight || 4);
  state.cameraFollowDistance = distance;
  state.cameraFollowHeight = height;
  const desired = targetPos.clone().add(new THREE.Vector3(0, height, 0)).add(forward.clone().multiplyScalar(-distance));
  const lookAt = targetPos.clone().add(new THREE.Vector3(0, 1.15, 0));
  const lerpAmount = Math.min(1, Math.max(0.05, state.cameraSmoothing + dt * 2));
  camera.position.lerp(desired, lerpAmount);
  orbit.target.lerp(lookAt, lerpAmount);
  camera.lookAt(orbit.target);
}

function setCameraMode(mode) {
  state.cameraMode = mode;
  const map = {
    free: "cameraFreeBtn",
    followPlayer: "cameraFollowPlayerBtn",
    followSelected: "cameraFollowSelectedBtn",
    firstPerson: "cameraFirstPersonBtn"
  };
  Object.values(map).forEach((id) => $(id)?.classList.remove("active"));
  $(map[mode])?.classList.add("active");
  setStatus(`Camera mode set to ${mode.replace(/([A-Z])/g, " $1").toLowerCase()}.`);
}

function snapshotPlayState() {
  state.playSnapshot.clear();
  state.sceneObjects.forEach((object) => {
    state.playSnapshot.set(object.userData.novaId, {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      visible: object.visible,
      physics: JSON.parse(JSON.stringify(object.userData.physics || {}))
    });
  });
}

function restorePlayState() {
  state.sceneObjects.forEach((object) => {
    const saved = state.playSnapshot.get(object.userData.novaId);
    if (!saved) return;
    object.position.copy(saved.position);
    object.rotation.copy(saved.rotation);
    object.scale.copy(saved.scale);
    object.visible = saved.visible;
    object.userData.physics = saved.physics;
  });
  state.playSnapshot.clear();
}

function setPlayMode(enabled) {
  if (enabled === state.playMode) return;
  state.playMode = enabled;
  $("playBtn").classList.toggle("active", enabled);
  $("gameHud")?.classList.toggle("hidden", !enabled);
  transform.enabled = !enabled;
  if (enabled) {
    const player = getPlayablePlayer();
    if (!player) {
      addObject("player");
      setStatus("Added a Player because none existed. Play mode started.");
    }
    snapshotPlayState();
    state.score = 0;
    if ($("scoreText")) $("scoreText").textContent = "Score: 0";
    if (state.cameraMode !== "free") orbit.enabled = false;
    transform.detach();
    setStatus("Play mode started. Move the character with WASD/Arrow Keys and jump with Space/J.");
  } else {
    restorePlayState();
    orbit.enabled = true;
    stopAllAnimations();
    if (state.selected) transform.attach(state.selected);
    updateInspectorFromSelection();
    setStatus("Stopped play mode. Scene reset to edit position.");
  }
}

function createSceneFromPrompt() {
  const prompt = $("aiPrompt").value.toLowerCase();
  let created = 0;
  if (prompt.includes("forest") || prompt.includes("terrain")) {
    addObject("terrain"); created += 1;
    for (let i = 0; i < 8; i += 1) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 10), createStandardMaterial(0x7a4a2a));
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 16), createStandardMaterial(0x2ed47a));
      const tree = new THREE.Group();
      tree.name = `AI Tree ${i + 1}`;
      trunk.position.y = 0.9;
      leaves.position.y = 2.2;
      tree.add(trunk, leaves);
      tree.position.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
      scene.add(tree);
      markEditable(tree, "ai-tree");
      created += 1;
    }
  }
  if (prompt.includes("light") || prompt.includes("sun")) { addObject("light"); created += 1; }
  if (prompt.includes("cube") || prompt.includes("block")) {
    const count = parseInt(prompt.match(/\d+/)?.[0] || "3", 10);
    for (let i = 0; i < Math.min(count, 12); i += 1) {
      addObject("cube");
      state.selected.position.set(i * 1.8 - 2, 0.8, 0);
      created += 1;
    }
  }
  if (created === 0) {
    addObject("terrain"); addObject("cube"); addObject("light");
    created = 3;
  }
  $("aiOutput").textContent = `Generated ${created} scene object(s). Next improvement: connect this panel to a real LLM API so Nova AI can create scripts, materials, and full playable templates.`;
}

function serializeObject(object) {
  const firstMat = getFirstMaterial(object);
  const type = object.userData.novaType || "object";
  return {
    id: object.userData.novaId,
    name: object.name,
    type,
    sourceFile: object.userData.sourceFile || null,
    position: object.position.toArray(),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: object.scale.toArray(),
    visible: object.visible,
    gameplay: {
      physics: object.userData.physics || null,
      scripts: object.userData.scripts || [],
      cameraFollowTarget: !!object.userData.cameraFollowTarget
    },
    material: firstMat?.color ? {
      color: `#${firstMat.color.getHexString()}`,
      opacity: firstMat.opacity ?? 1,
      wireframe: firstMat.wireframe ?? false
    } : null
  };
}

function saveScene() {
  const data = {
    engine: "NovaForge Engine",
    version: "0.3.0-real-editor",
    savedAt: new Date().toISOString(),
    note: "Imported FBX/GLB/OBJ files are referenced by filename. Reimport assets when reopening on another computer.",
    objects: state.sceneObjects.map(serializeObject),
    assets: state.assets,
    animations: state.animationKeyframes
  };
  downloadJson(`${state.projectName}.novaforge`, data);
  setStatus("Saved scene file.");
}

function loadSceneFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      clearSceneObjects();
      state.assets = data.assets || [];
      state.animationKeyframes = data.animations || {};
      (data.objects || []).forEach((item) => recreateSerializedObject(item));
      renderAssetList();
      renderHierarchy();
      updateObjectCount();
      deselectObject();
      setStatus(`Loaded ${file.name}. Reimport source model files if placeholders appear.`);
    } catch (error) {
      console.error(error);
      setStatus("Scene load failed. Make sure it is a valid .novaforge JSON file.");
    }
  };
  reader.readAsText(file);
}

function recreateSerializedObject(item) {
  let object;
  const color = item.material?.color ? new THREE.Color(item.material.color) : new THREE.Color(0x4f8cff);
  const mat = createStandardMaterial(color);
  if (item.type?.includes("cube")) object = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat);
  else if (item.type?.includes("sphere")) object = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 16), mat);
  else if (item.type?.includes("plane")) object = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat);
  else if (item.type?.includes("terrain")) object = new THREE.Mesh(new THREE.PlaneGeometry(14, 14, 16, 16), mat);
  else if (item.type?.includes("platform")) object = new THREE.Mesh(new THREE.BoxGeometry(4, 0.45, 4), mat);
  else if (item.type?.includes("player")) {
    object = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.05, 8, 16), mat);
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 12), createStandardMaterial(0xffd166));
    head.position.y = 1.42;
    object.add(body, head);
  }
  else if (item.type?.includes("light")) object = new THREE.PointLight(0x9fd7ff, 40, 20, 1.8);
  else if (item.type?.includes("camera")) object = new THREE.Group();
  else {
    object = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color, wireframe: true }));
    object.add(mesh);
  }
  object.name = item.name || "Loaded Object";
  object.userData.novaId = item.id || uid(item.type || "loaded");
  object.userData.sourceFile = item.sourceFile || null;
  object.position.fromArray(item.position || [0, 0, 0]);
  object.rotation.set(...(item.rotation || [0, 0, 0]));
  object.scale.fromArray(item.scale || [1, 1, 1]);
  object.visible = item.visible !== false;
  if (item.gameplay) {
    object.userData.physics = item.gameplay.physics || object.userData.physics;
    object.userData.scripts = item.gameplay.scripts || [];
    object.userData.cameraFollowTarget = !!item.gameplay.cameraFollowTarget;
  }
  if (item.material) {
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((childMat) => {
          if (childMat.color) childMat.color.set(item.material.color);
          childMat.opacity = item.material.opacity ?? 1;
          childMat.transparent = childMat.opacity < 1;
          childMat.wireframe = item.material.wireframe ?? false;
        });
      }
    });
  }
  scene.add(object);
  markEditable(object, item.type || "loaded");
}

function clearSceneObjects() {
  deselectObject();
  state.sceneObjects.forEach((object) => scene.remove(object));
  state.sceneObjects = [];
  state.mixers = [];
  updateObjectCount();
}

function newScene() {
  clearSceneObjects();
  state.assets = [];
  state.animationKeyframes = {};
  state.score = 0;
  renderAssetList();
  addObject("terrain");
  addObject("platform");
  if (state.selected) state.selected.position.set(3, 1.1, -2);
  addObject("player");
  addObject("sphere");
  if (state.selected) {
    state.selected.name = "Collectable Orb";
    state.selected.position.set(-2.5, 1.1, -2);
    state.selected.userData.scripts.push({ name: "Collectable", preset: "collectable" });
  }
  addObject("light");
  setCameraMode("followPlayer");
  setStatus("New playable scene created with terrain, platform, player controller, camera follow, and collectable.");
}

function exportBuild() {
  const manifest = {
    name: state.projectName,
    engine: "NovaForge Engine",
    buildTarget: "web-prototype",
    createdAt: new Date().toISOString(),
    objectCount: state.sceneObjects.length,
    assetCount: state.assets.length,
    features: ["real-3d-editor", "transform-gizmos", "fbx-import", "gltf-import", "obj-import", "animation-mixer", "keyframe-animations", "playable-mode", "character-controller", "collision", "camera-follow", "script-components"],
    scene: state.sceneObjects.map(serializeObject)
  };
  downloadJson(`${state.projectName}_build_manifest.json`, manifest);
  setStatus("Exported build manifest. Full game builds are next roadmap step.");
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
}

function onResize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = Math.max(width / Math.max(height, 1), 0.1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(state.clock.getDelta(), 0.033);
  if (state.playMode) updateGame(delta);
  updateCameraFollow(delta);
  if (!state.playMode || state.cameraMode === "free") orbit.update();
  state.mixers.forEach((entry) => entry.mixer.update(delta));
  renderer.render(scene, camera);
}

function bindEvents() {
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    state.keys.add(event.code);
    if ((event.key === "Delete" || event.key === "Backspace") && state.selected && !state.playMode) deleteSelected();
    if (!state.playMode && event.ctrlKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
    }
    if (!state.playMode && event.key.toLowerCase() === "w") setTool("move");
    if (!state.playMode && event.key.toLowerCase() === "e") setTool("rotate");
    if (!state.playMode && event.key.toLowerCase() === "r") setTool("scale");
  });
  window.addEventListener("keyup", (event) => state.keys.delete(event.code));

  document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => addObject(button.dataset.add)));
  document.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", () => setCameraView(button.dataset.camera)));

  $("addPlayerBtn")?.addEventListener("click", () => addObject("player"));
  $("addPlatformBtn")?.addEventListener("click", () => addObject("platform"));
  $("cameraFreeBtn")?.addEventListener("click", () => setCameraMode("free"));
  $("cameraFollowPlayerBtn")?.addEventListener("click", () => setCameraMode("followPlayer"));
  $("cameraFollowSelectedBtn")?.addEventListener("click", () => setCameraMode("followSelected"));
  $("cameraFirstPersonBtn")?.addEventListener("click", () => setCameraMode("firstPerson"));

  $("selectToolBtn").addEventListener("click", () => setTool("select"));
  $("moveToolBtn").addEventListener("click", () => setTool("move"));
  $("rotateToolBtn").addEventListener("click", () => setTool("rotate"));
  $("scaleToolBtn").addEventListener("click", () => setTool("scale"));
  $("snapToggleBtn").addEventListener("click", toggleSnap);
  $("focusBtn").addEventListener("click", focusSelected);
  $("gridToggleBtn").addEventListener("click", () => {
    state.gridVisible = !state.gridVisible;
    grid.visible = state.gridVisible;
    $("gridToggleBtn").classList.toggle("active", state.gridVisible);
  });
  $("wireToggleBtn").addEventListener("click", toggleWireframe);
  $("playBtn").addEventListener("click", () => setPlayMode(true));
  $("stopBtn").addEventListener("click", () => setPlayMode(false));
  $("modelInput").addEventListener("change", (event) => importModels(Array.from(event.target.files || [])));
  $("animationInput").addEventListener("change", (event) => importAnimationFiles(Array.from(event.target.files || [])));
  $("duplicateBtn").addEventListener("click", duplicateSelected);
  $("deleteBtn").addEventListener("click", deleteSelected);
  $("captureKeyframeBtn").addEventListener("click", captureKeyframe);
  $("playCreatedAnimBtn").addEventListener("click", playCreatedAnimation);
  $("stopAnimBtn").addEventListener("click", stopAllAnimations);
  $("clearKeyframesBtn").addEventListener("click", clearKeyframes);
  $("addScriptBtn")?.addEventListener("click", addScriptToSelected);
  $("animationName").addEventListener("input", renderKeyframeList);
  $("newSceneBtn").addEventListener("click", newScene);
  $("saveSceneBtn").addEventListener("click", saveScene);
  $("loadSceneInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) loadSceneFromFile(file);
  });
  $("exportBuildBtn").addEventListener("click", exportBuild);
  $("aiBuildBtn").addEventListener("click", createSceneFromPrompt);

  ["objName", "posX", "posY", "posZ", "rotX", "rotY", "rotZ", "scaleX", "scaleY", "scaleZ", "matColor", "opacity", "visibleToggle", "castShadowToggle", "physicsEnabled", "physicsBodyType", "physicsGravity", "physicsSpeed", "physicsJump", "cameraTargetToggle", "cameraTargetToggle"].forEach((id) => {
    $(id)?.addEventListener("input", applyInspectorToSelection);
    $(id)?.addEventListener("change", applyInspectorToSelection);
  });

  viewport.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  viewport.addEventListener("drop", (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    const modelFiles = files.filter((file) => /\.(fbx|glb|gltf|obj)$/i.test(file.name));
    if (modelFiles.length) importModels(modelFiles);
  });
}

function bootstrap() {
  bindEvents();
  onResize();
  newScene();
  setTool("move");
  updateInspectorFromSelection();
  animate();
  setStatus("NovaForge Real Editor loaded with character controller and camera follow. Press Play to test movement.");
}

bootstrap();
}

function startFallbackEditor(loadError) {
  const $ = (id) => document.getElementById(id);
  const viewport = $("viewport");
  const statusText = $("statusText");
  const objectCount = $("objectCount");
  const hierarchyEl = $("hierarchy");
  const assetListEl = $("assetList");
  const inspector = $("inspector");
  const inspectorEmpty = $("inspectorEmpty");
  const clipListEl = $("clipList");
  const keyframeListEl = $("keyframeList");

  const state = {
    objects: [],
    assets: [],
    selected: null,
    tool: "move",
    playMode: false,
    keys: new Set(),
    keyframes: [],
    score: 0,
    snap: false,
    wire: false,
    camera: "perspective",
    cameraMode: "followPlayer",
    animationTimer: null,
    nextId: 1
  };

  viewport.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.tabIndex = 0;
  viewport.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  function setStatus(message) {
    if (statusText) statusText.textContent = message;
  }

  function resizeCanvas() {
    const rect = viewport.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(240, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function colorForType(type) {
    return {
      cube: "#4f8cff",
      sphere: "#8a5cff",
      plane: "#1f8f6a",
      terrain: "#2aa56b",
      platform: "#9a7a35",
      player: "#f8d24b",
      light: "#ffe89c",
      camera: "#ff8a4f",
      model: "#e86ad6"
    }[type] || "#4f8cff";
  }

  function makeObject(type, name) {
    const id = `nf_${state.nextId++}`;
    const o = {
      id,
      type,
      name: name || `${type[0].toUpperCase()}${type.slice(1)} ${state.nextId - 1}`,
      x: type === "player" ? 0 : (Math.random() * 8 - 4),
      y: type === "terrain" ? -0.4 : type === "platform" ? 0.25 : 1,
      z: type === "platform" ? -2 : 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      sx: type === "terrain" ? 14 : type === "platform" ? 5 : 1,
      sy: type === "terrain" ? 0.25 : type === "platform" ? 0.45 : 1,
      sz: type === "terrain" ? 10 : type === "platform" ? 2 : 1,
      color: colorForType(type),
      opacity: 1,
      visible: true,
      physicsEnabled: ["terrain", "platform", "player"].includes(type),
      bodyType: type === "player" ? "character" : ["terrain", "platform"].includes(type) ? "static" : "dynamic",
      useGravity: type === "player",
      speed: 6,
      jump: 7.5,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: false,
      cameraFollowTarget: type === "player",
      scripts: type === "player" ? [{ name: "Player Input", preset: "playerInput" }] : []
    };
    if (type === "cube") o.scripts.push({ name: "Rotator", preset: "rotator" });
    state.objects.push(o);
    selectObject(o);
    renderAll();
    setStatus(`Added ${o.name}. Fallback editor is active because Three.js did not load.`);
    return o;
  }

  function project(o) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;
    if (state.camera === "top") return { x: w / 2 + o.x * 38, y: h / 2 + o.z * 38, w: o.sx * 38, h: o.sz * 38 };
    if (state.camera === "front") return { x: w / 2 + o.x * 45, y: h * 0.75 - o.y * 45, w: o.sx * 45, h: o.sy * 45 };
    if (state.camera === "right") return { x: w / 2 + o.z * 45, y: h * 0.75 - o.y * 45, w: o.sz * 45, h: o.sy * 45 };
    return { x: w / 2 + (o.x - o.z) * 34, y: h * 0.72 - o.y * 45 + (o.x + o.z) * 11, w: o.sx * 42, h: Math.max(16, o.sy * 42) };
  }

  function drawGrid(w, h) {
    ctx.strokeStyle = "rgba(120,160,255,0.13)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0a1026");
    grad.addColorStop(1, "#050814");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    drawGrid(w, h);

    const sorted = [...state.objects].filter(o => o.visible).sort((a, b) => (a.z + a.y) - (b.z + b.y));
    for (const o of sorted) {
      const p = project(o);
      ctx.save();
      ctx.globalAlpha = o.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((o.rotZ || 0) * Math.PI / 180);
      ctx.fillStyle = o.color;
      ctx.strokeStyle = state.selected === o ? "#ffffff" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = state.selected === o ? 3 : 1;
      if (o.type === "sphere") {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(14, p.w / 2), Math.max(14, p.h / 2), 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      } else if (o.type === "light") {
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,232,156,0.45)";
        ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.stroke();
      } else if (o.type === "camera") {
        ctx.beginPath();
        ctx.moveTo(-18, -12); ctx.lineTo(10, -12); ctx.lineTo(18, 0); ctx.lineTo(10, 12); ctx.lineTo(-18, 12); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e8efff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(o.name, 0, -Math.max(24, p.h / 2 + 8));
      if (state.selected === o) drawGizmo(p, o);
      ctx.restore();
    }

    if (state.playMode) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(12, 12, 280, 48);
      ctx.fillStyle = "#ffffff";
      ctx.font = "15px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`PLAY MODE · Score: ${state.score}`, 24, 42);
    }
  }

  function drawGizmo(p, o) {
    ctx.lineWidth = 3;
    if (state.tool === "move" || state.tool === "select") {
      ctx.strokeStyle = "#ff5f6d";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(55, 0); ctx.stroke();
      ctx.strokeStyle = "#22c55e";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -55); ctx.stroke();
      ctx.strokeStyle = "#4f8cff";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, 35); ctx.stroke();
    } else if (state.tool === "rotate") {
      ctx.strokeStyle = "#f8d24b";
      ctx.beginPath(); ctx.arc(0, 0, Math.max(28, p.w / 2 + 12), 0, Math.PI * 2); ctx.stroke();
    } else if (state.tool === "scale") {
      ctx.strokeStyle = "#b983ff";
      ctx.strokeRect(-p.w / 2 - 8, -p.h / 2 - 8, p.w + 16, p.h + 16);
    }
  }

  function renderHierarchy() {
    objectCount.textContent = `${state.objects.length} objects`;
    if (!state.objects.length) {
      hierarchyEl.className = "scroll-list empty";
      hierarchyEl.textContent = "No objects yet.";
      return;
    }
    hierarchyEl.className = "scroll-list";
    hierarchyEl.innerHTML = state.objects.map(o => `<button class="hierarchy-item ${state.selected === o ? "selected" : ""}" data-id="${o.id}"><strong>${escapeHtml(o.name)}</strong><span>${escapeHtml(o.type)}</span></button>`).join("");
    hierarchyEl.querySelectorAll("[data-id]").forEach(btn => btn.addEventListener("click", () => selectObject(state.objects.find(o => o.id === btn.dataset.id))));
  }

  function renderAssets() {
    if (!state.assets.length) {
      assetListEl.className = "scroll-list empty";
      assetListEl.textContent = "No imported assets yet.";
      return;
    }
    assetListEl.className = "scroll-list";
    assetListEl.innerHTML = state.assets.map(a => `<button class="hierarchy-item" data-asset="${a.id}"><strong>${escapeHtml(a.name)}</strong><span>${escapeHtml(a.kind)}</span></button>`).join("");
    assetListEl.querySelectorAll("[data-asset]").forEach(btn => btn.addEventListener("click", () => {
      const asset = state.assets.find(a => a.id === btn.dataset.asset);
      const o = makeObject("model", asset.name.replace(/\.[^.]+$/, ""));
      o.assetName = asset.name;
      o.color = "#e86ad6";
      renderAll();
    }));
  }

  function updateInspector() {
    if (!state.selected) {
      inspector.classList.add("hidden");
      inspectorEmpty.classList.remove("hidden");
      return;
    }
    const o = state.selected;
    inspector.classList.remove("hidden");
    inspectorEmpty.classList.add("hidden");
    $("objName").value = o.name;
    $("objType").value = o.type;
    $("posX").value = round(o.x); $("posY").value = round(o.y); $("posZ").value = round(o.z);
    $("rotX").value = round(o.rotX); $("rotY").value = round(o.rotY); $("rotZ").value = round(o.rotZ);
    $("scaleX").value = round(o.sx); $("scaleY").value = round(o.sy); $("scaleZ").value = round(o.sz);
    $("matColor").value = o.color;
    $("opacity").value = o.opacity;
    $("visibleToggle").checked = o.visible;
    $("castShadowToggle").checked = true;
    $("physicsEnabled").checked = o.physicsEnabled;
    $("physicsBodyType").value = o.bodyType;
    $("physicsGravity").checked = o.useGravity;
    $("physicsSpeed").value = o.speed;
    $("physicsJump").value = o.jump;
    if ($("cameraTargetToggle")) $("cameraTargetToggle").checked = !!o.cameraFollowTarget;
    renderScripts();
    renderClips();
  }

  function applyInspector() {
    const o = state.selected;
    if (!o) return setStatus("Select an object first.");
    o.name = $("objName").value || o.name;
    o.x = num("posX", o.x); o.y = num("posY", o.y); o.z = num("posZ", o.z);
    o.rotX = num("rotX", o.rotX); o.rotY = num("rotY", o.rotY); o.rotZ = num("rotZ", o.rotZ);
    o.sx = Math.max(0.05, num("scaleX", o.sx)); o.sy = Math.max(0.05, num("scaleY", o.sy)); o.sz = Math.max(0.05, num("scaleZ", o.sz));
    o.color = $("matColor").value;
    o.opacity = num("opacity", o.opacity);
    o.visible = $("visibleToggle").checked;
    o.physicsEnabled = $("physicsEnabled").checked;
    o.bodyType = $("physicsBodyType").value;
    o.useGravity = $("physicsGravity").checked;
    o.speed = num("physicsSpeed", o.speed);
    o.jump = num("physicsJump", o.jump);
    if ($("cameraTargetToggle")) o.cameraFollowTarget = $("cameraTargetToggle").checked;
    renderAll(false);
  }

  function renderScripts() {
    const el = $("scriptList");
    const o = state.selected;
    if (!o || !o.scripts.length) {
      el.className = "scroll-list compact empty";
      el.textContent = o ? "No scripts attached." : "Select an object to add scripts.";
      return;
    }
    el.className = "scroll-list compact";
    el.innerHTML = o.scripts.map((s, i) => `<div class="script-chip"><span>${escapeHtml(s.name)}</span><button data-remove-script="${i}">Remove</button></div>`).join("");
    el.querySelectorAll("[data-remove-script]").forEach(btn => btn.addEventListener("click", () => {
      o.scripts.splice(Number(btn.dataset.removeScript), 1);
      renderScripts();
    }));
  }

  function renderClips() {
    if (!state.selected?.clips?.length) {
      clipListEl.className = "scroll-list compact empty";
      clipListEl.textContent = "Imported animation clips appear here in the Three.js editor. Fallback mode stores clip files only.";
      return;
    }
  }

  function renderKeyframes() {
    if (!state.keyframes.length) {
      keyframeListEl.className = "scroll-list compact empty";
      keyframeListEl.textContent = "No keyframes captured.";
      return;
    }
    keyframeListEl.className = "scroll-list compact";
    keyframeListEl.innerHTML = state.keyframes.map(k => `<div class="keyframe-row"><strong>${escapeHtml(k.name)}</strong><span>${k.time}s · x:${round(k.x)} y:${round(k.y)} z:${round(k.z)}</span></div>`).join("");
  }

  function selectObject(o) {
    state.selected = o || null;
    updateInspector();
    renderHierarchy();
    draw();
  }

  function renderAll(update = true) {
    renderHierarchy();
    renderAssets();
    renderKeyframes();
    if (update) updateInspector();
    draw();
  }

  function setTool(tool) {
    state.tool = tool === "select" ? "move" : tool;
    ["selectToolBtn", "moveToolBtn", "rotateToolBtn", "scaleToolBtn"].forEach(id => $(id)?.classList.remove("active"));
    const id = tool === "select" ? "selectToolBtn" : `${tool}ToolBtn`;
    $(id)?.classList.add("active");
    setStatus(`${tool} tool active. Fallback canvas editor is running.`);
    draw();
  }

  function cameraView(view) {
    state.camera = view;
    document.querySelectorAll("[data-camera]").forEach(b => b.classList.toggle("active", b.dataset.camera === view));
    setStatus(`Camera view: ${view}`);
    draw();
  }

  function toggleSnap() {
    state.snap = !state.snap;
    $("snapToggleBtn").textContent = state.snap ? "Snap On" : "Snap Off";
    setStatus(`Snap ${state.snap ? "enabled" : "disabled"}.`);
  }

  function focusSelected() {
    if (!state.selected) return setStatus("Select an object first, then press Focus.");
    setStatus(`Focused ${state.selected.name}.`);
    draw();
  }

  function toggleWire() {
    state.wire = !state.wire;
    $("wireToggleBtn").textContent = state.wire ? "Wire On" : "Wire Off";
    setStatus(`Wireframe ${state.wire ? "on" : "off"}.`);
  }

  function duplicateSelected() {
    if (!state.selected) return setStatus("Select an object before duplicating.");
    const copy = JSON.parse(JSON.stringify(state.selected));
    copy.id = `nf_${state.nextId++}`;
    copy.name += " Copy";
    copy.x += 1.2;
    copy.z += 1.2;
    state.objects.push(copy);
    selectObject(copy);
    setStatus(`Duplicated ${copy.name}.`);
  }

  function deleteSelected() {
    if (!state.selected) return setStatus("Select an object before deleting.");
    const name = state.selected.name;
    state.objects = state.objects.filter(o => o !== state.selected);
    state.selected = null;
    renderAll();
    setStatus(`Deleted ${name}.`);
  }

  function addScript() {
    if (!state.selected) return setStatus("Select an object before adding a script.");
    const preset = $("scriptPreset").value;
    const names = { rotator: "Rotator", bob: "Hover Bob", patrol: "Side Patrol", collectable: "Collectable", playerInput: "Player Input" };
    state.selected.scripts.push({ preset, name: names[preset] || preset });
    if (preset === "playerInput") {
      state.selected.physicsEnabled = true;
      state.selected.bodyType = "character";
      state.selected.useGravity = true;
      state.selected.cameraFollowTarget = true;
    }
    renderScripts();
    setStatus(`Added ${names[preset]} script to ${state.selected.name}.`);
  }

  function captureKeyframe() {
    if (!state.selected) return setStatus("Select an object before capturing a keyframe.");
    state.keyframes.push({
      objectId: state.selected.id,
      name: $("animationName").value || "NewAnimation",
      time: num("keyTime", 0),
      x: state.selected.x,
      y: state.selected.y,
      z: state.selected.z,
      rotX: state.selected.rotX,
      rotY: state.selected.rotY,
      rotZ: state.selected.rotZ,
      sx: state.selected.sx,
      sy: state.selected.sy,
      sz: state.selected.sz
    });
    state.keyframes.sort((a, b) => a.time - b.time);
    renderKeyframes();
    setStatus("Captured keyframe.");
  }

  function playCreatedAnimation() {
    if (!state.selected) return setStatus("Select an object before playing created animation.");
    const frames = state.keyframes.filter(k => k.objectId === state.selected.id).sort((a, b) => a.time - b.time);
    if (frames.length < 2) return setStatus("Capture at least two keyframes for the selected object.");
    stopAnimation();
    const start = performance.now();
    const duration = Math.max(num("animDuration", 2), frames.at(-1).time || 2);
    state.animationTimer = setInterval(() => {
      const t = ((performance.now() - start) / 1000) % duration;
      let a = frames[0], b = frames[frames.length - 1];
      for (let i = 0; i < frames.length - 1; i++) {
        if (t >= frames[i].time && t <= frames[i + 1].time) { a = frames[i]; b = frames[i + 1]; break; }
      }
      const span = Math.max(0.001, b.time - a.time);
      const p = Math.max(0, Math.min(1, (t - a.time) / span));
      const o = state.selected;
      o.x = lerp(a.x, b.x, p); o.y = lerp(a.y, b.y, p); o.z = lerp(a.z, b.z, p);
      o.rotZ = lerp(a.rotZ, b.rotZ, p);
      updateInspector(); draw();
    }, 16);
    setStatus("Playing created keyframe animation.");
  }

  function stopAnimation() {
    if (state.animationTimer) clearInterval(state.animationTimer);
    state.animationTimer = null;
    setStatus("Stopped animation.");
  }

  function clearKeyframes() {
    state.keyframes = [];
    renderKeyframes();
    setStatus("Cleared keyframes.");
  }

  function newScene() {
    state.objects = [];
    state.assets = [];
    state.keyframes = [];
    state.selected = null;
    state.nextId = 1;
    makeObject("terrain");
    makeObject("platform");
    makeObject("player");
    const orb = makeObject("sphere", "Collectable Orb");
    orb.x = -2.5; orb.y = 1; orb.z = -2; orb.scripts.push({ name: "Collectable", preset: "collectable" });
    makeObject("light");
    setStatus("New playable scene created with player controller and camera follow controls.");
  }

  function saveScene() {
    const blob = new Blob([JSON.stringify({ engine: "NovaForge", version: "fallback-v0.4.2", objects: state.objects, assets: state.assets, keyframes: state.keyframes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "NovaForgeProject.novaforge"; a.click();
    URL.revokeObjectURL(url);
    setStatus("Saved scene file.");
  }

  function loadScene(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state.objects = data.objects || data.scene || [];
        state.assets = data.assets || [];
        state.keyframes = data.keyframes || [];
        state.nextId = state.objects.length + 1;
        selectObject(state.objects[0] || null);
        renderAll();
        setStatus(`Loaded ${file.name}.`);
      } catch (e) {
        setStatus(`Could not load scene: ${e.message}`);
      }
    };
    reader.readAsText(file);
  }

  function exportBuild() {
    const blob = new Blob([JSON.stringify({ name: "NovaForgeBuild", createdAt: new Date().toISOString(), objects: state.objects.length, assets: state.assets.length, mode: "fallback-web-build" }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "NovaForge_Build_Manifest.json"; a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported build manifest.");
  }

  function importFiles(files, kind) {
    files.forEach(file => state.assets.push({ id: `asset_${Date.now()}_${Math.random()}`, name: file.name, kind, size: file.size }));
    renderAssets();
    setStatus(`Imported ${files.length} ${kind} file(s). In fallback mode, assets are registered as editable placeholders.`);
  }

  function aiBuild() {
    const prompt = ($("aiPrompt").value || "").toLowerCase();
    if (prompt.includes("forest")) { makeObject("terrain", "Forest Terrain"); makeObject("cube", "Training Block"); makeObject("light", "Forest Sun"); }
    else if (prompt.includes("platform")) { makeObject("platform", "AI Platform"); makeObject("player", "AI Player"); }
    else { makeObject("cube", "AI Cube"); makeObject("sphere", "AI Sphere"); }
    $("aiOutput").textContent = "Nova AI created starter objects. For full AI generation, connect a model API later.";
    setStatus("AI scene idea generated.");
  }

  let dragging = false, dragStart = null;
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = [...state.objects].reverse().find(o => {
      const p = project(o);
      return x >= p.x - p.w / 2 - 12 && x <= p.x + p.w / 2 + 12 && y >= p.y - p.h / 2 - 12 && y <= p.y + p.h / 2 + 12;
    });
    if (hit) {
      selectObject(hit);
      dragging = true;
      dragStart = { x, y, ox: hit.x, oy: hit.y, oz: hit.z, rot: hit.rotZ, sx: hit.sx, sy: hit.sy, sz: hit.sz };
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || !state.selected) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - rect.left - dragStart.x) / 40;
    const dy = (e.clientY - rect.top - dragStart.y) / 40;
    const o = state.selected;
    if (state.tool === "rotate") o.rotZ = dragStart.rot + dx * 30;
    else if (state.tool === "scale") { o.sx = Math.max(0.1, dragStart.sx + dx); o.sy = Math.max(0.1, dragStart.sy - dy); o.sz = Math.max(0.1, dragStart.sz + dx); }
    else { o.x = dragStart.ox + dx; if (e.shiftKey) o.y = Math.max(0, dragStart.oy - dy); else o.z = dragStart.oz + dy; }
    if (state.snap) { o.x = Math.round(o.x); o.y = Math.round(o.y * 2) / 2; o.z = Math.round(o.z); }
    updateInspector(); draw(); renderHierarchy();
  });
  canvas.addEventListener("pointerup", (e) => { dragging = false; dragStart = null; try { canvas.releasePointerCapture(e.pointerId); } catch {} });

  function updateGame(dt) {
    const player = state.objects.find(o => o.bodyType === "character") || state.objects.find(o => o.type === "player");
    if (!player) return;
    const speed = player.speed || 6;
    const oldX = player.x, oldZ = player.z;
    if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) player.z -= speed * dt;
    if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) player.z += speed * dt;
    if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) player.x -= speed * dt;
    if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) player.x += speed * dt;
    if ((state.keys.has("Space") || state.keys.has("KeyJ")) && player.grounded) { player.vy = player.jump || 7.5; player.grounded = false; }
    player.vy += -18 * dt;
    player.y += player.vy * dt;
    const ground = state.objects.filter(o => o !== player && o.physicsEnabled && o.bodyType === "static");
    player.grounded = false;
    for (const g of ground) {
      if (Math.abs(player.x - g.x) <= (player.sx + g.sx) / 2 && Math.abs(player.z - g.z) <= (player.sz + g.sz) / 2) {
        const top = g.y + g.sy / 2 + player.sy / 2;
        if (player.y <= top && player.vy <= 0) { player.y = top; player.vy = 0; player.grounded = true; }
      }
    }
    if (player.y < 0.7) { player.y = 0.7; player.vy = 0; player.grounded = true; }
    for (const o of state.objects) {
      for (const s of o.scripts || []) {
        if (s.preset === "rotator") o.rotZ += 60 * dt;
        if (s.preset === "bob") o.y += Math.sin(Date.now() / 220) * 0.003;
        if (s.preset === "patrol") o.x += Math.sin(Date.now() / 700) * 0.01;
        if (s.preset === "collectable" && o.visible && Math.abs(player.x - o.x) < 0.8 && Math.abs(player.z - o.z) < 0.8 && Math.abs(player.y - o.y) < 1.2) { o.visible = false; state.score += 1; if ($("scoreText")) $("scoreText").textContent = `Score: ${state.score}`; setStatus(`Collected ${o.name}. Score ${state.score}.`); }
      }
    }
  }

  function gameLoop(t) {
    const now = performance.now();
    const dt = Math.min(0.033, (now - (gameLoop.last || now)) / 1000);
    gameLoop.last = now;
    if (state.playMode) updateGame(dt);
    draw();
    requestAnimationFrame(gameLoop);
  }

  function playMode(on) {
    state.playMode = on;
    $("gameHud")?.classList.toggle("hidden", !on);
    if (on && !state.objects.some(o => o.bodyType === "character" || o.type === "player")) makeObject("player");
    if (on) state.score = 0;
    if ($("scoreText")) $("scoreText").textContent = "Score: 0";
    canvas.focus();
    setStatus(on ? "Play mode started. Use WASD/Arrow Keys and Space/J." : "Stopped play mode. Back to editor.");
  }

  function bind(id, event, fn) {
    const el = $(id);
    if (!el) return console.warn(`Missing element #${id}`);
    el.addEventListener(event, (e) => {
      try { fn(e); } catch (err) { console.error(err); setStatus(`Button error: ${err.message}`); }
    });
  }

  document.querySelectorAll("[data-add]").forEach(btn => btn.addEventListener("click", () => makeObject(btn.dataset.add)));
  document.querySelectorAll("[data-camera]").forEach(btn => btn.addEventListener("click", () => cameraView(btn.dataset.camera)));
  bind("addPlayerBtn", "click", () => makeObject("player"));
  bind("addPlatformBtn", "click", () => makeObject("platform"));
  bind("cameraFreeBtn", "click", () => { state.cameraMode = "free"; setStatus("Fallback camera mode: free."); });
  bind("cameraFollowPlayerBtn", "click", () => { state.cameraMode = "followPlayer"; setStatus("Fallback camera mode: follow player."); });
  bind("cameraFollowSelectedBtn", "click", () => { state.cameraMode = "followSelected"; setStatus("Fallback camera mode: follow selected."); });
  bind("cameraFirstPersonBtn", "click", () => { state.cameraMode = "firstPerson"; setStatus("Fallback camera mode: first person placeholder."); });
  bind("selectToolBtn", "click", () => setTool("select"));
  bind("moveToolBtn", "click", () => setTool("move"));
  bind("rotateToolBtn", "click", () => setTool("rotate"));
  bind("scaleToolBtn", "click", () => setTool("scale"));
  bind("snapToggleBtn", "click", toggleSnap);
  bind("focusBtn", "click", focusSelected);
  bind("gridToggleBtn", "click", () => setStatus("Grid is always visible in fallback mode."));
  bind("wireToggleBtn", "click", toggleWire);
  bind("playBtn", "click", () => playMode(true));
  bind("stopBtn", "click", () => playMode(false));
  bind("duplicateBtn", "click", duplicateSelected);
  bind("deleteBtn", "click", deleteSelected);
  bind("addScriptBtn", "click", addScript);
  bind("captureKeyframeBtn", "click", captureKeyframe);
  bind("playCreatedAnimBtn", "click", playCreatedAnimation);
  bind("stopAnimBtn", "click", stopAnimation);
  bind("clearKeyframesBtn", "click", clearKeyframes);
  bind("newSceneBtn", "click", newScene);
  bind("saveSceneBtn", "click", saveScene);
  bind("exportBuildBtn", "click", exportBuild);
  bind("aiBuildBtn", "click", aiBuild);
  bind("modelInput", "change", e => { importFiles(Array.from(e.target.files || []), "model"); e.target.value = ""; });
  bind("animationInput", "change", e => { importFiles(Array.from(e.target.files || []), "animation"); e.target.value = ""; });
  bind("loadSceneInput", "change", e => { const file = e.target.files?.[0]; if (file) loadScene(file); e.target.value = ""; });
  ["objName", "posX", "posY", "posZ", "rotX", "rotY", "rotZ", "scaleX", "scaleY", "scaleZ", "matColor", "opacity", "visibleToggle", "castShadowToggle", "physicsEnabled", "physicsBodyType", "physicsGravity", "physicsSpeed", "physicsJump", "cameraTargetToggle"].forEach(id => { bind(id, "input", applyInspector); bind(id, "change", applyInspector); });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", e => { state.keys.add(e.code); if (e.key === "Delete" && !state.playMode) deleteSelected(); if (!state.playMode && e.ctrlKey && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); } });
  window.addEventListener("keyup", e => state.keys.delete(e.code));
  viewport.addEventListener("dragover", e => e.preventDefault());
  viewport.addEventListener("drop", e => { e.preventDefault(); importFiles(Array.from(e.dataTransfer?.files || []), "model"); });

  function escapeHtml(v) { return String(v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c])); }
  function round(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function num(id, fallback) { const v = Number($(id)?.value); return Number.isFinite(v) ? v : fallback; }
  function lerp(a, b, p) { return a + (b - a) * p; }

  newScene();
  resizeCanvas();
  requestAnimationFrame(gameLoop);
  const reason = loadError?.message || String(loadError || "Unknown module loading issue");
  setStatus(`Fallback editor loaded. Buttons now work. Three.js did not load: ${reason}`);
}

loadNovaForge();
