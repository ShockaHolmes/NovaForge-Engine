# NovaForge Real Editor v0.6

NovaForge is a browser-based game-engine prototype with real 3D editing, transform gizmos, model import, animation tools, playable mode, character controllers, camera follow, collision, script components, and now a **Pro World Builder** upgrade.

## v0.6 Highlights

- Pro environment generator
- Large sculpted terrain
- Water, forest, rocks, mountains, road/path tools
- Day/night lighting
- Weather particles: clear, rain, snow, embers
- Adventure, Platformer, Racing, and Training Simulator templates
- NPC, enemy, collectable, vehicle, door, and trigger presets
- Prefab creation/spawning
- Profiler overlay
- Console overlay
- Save/load support for prefabs and environment data

## Run

```bash
python server.py
```

Then open:

```text
http://localhost:5173
```

## First test

1. Press **Better Environment**.
2. Press **Play**.
3. Move with WASD or Arrow Keys.
4. Jump with Space/J.
5. Toggle **Profiler** and **Console**.

---

# NovaForge Engine - Real Editable 3D Editor

NovaForge Engine is a browser-based real editable game engine prototype. This version moves beyond placeholder buttons and adds a true Three.js scene editor with object selection, transform gizmos, model importing, animation playback, and keyframe animation creation.


## Button Rescue Fix

Version **0.5.0** keeps the button rescue fix and adds a real playable character-controller layer. The previous build used static Three.js CDN imports. If the browser could not resolve the Three.js addon modules, the entire JavaScript file stopped before any buttons were wired.

This version now uses:

- A browser import map for `three` and `three/addons/`
- Dynamic imports with error handling
- A self-contained fallback editor if Three.js cannot load
- Status bar messages for button errors and loading problems

If Three.js loads correctly, NovaForge runs as a real WebGL editor. If it does not, NovaForge still opens a working fallback editor so the buttons, inspector, play mode, and save/load features remain usable.

## What works now

- Real WebGL 3D viewport powered by Three.js
- Click objects to select them
- Move, rotate, and scale selected objects with TransformControls gizmos
- Orbit camera controls
- Hierarchy panel
- Inspector panel for name, position, rotation, scale, visibility, color, opacity, and shadows
- Add primitives: cube, sphere, plane, terrain, platform, player, light, and camera marker
- Import models: `.fbx`, `.glb`, `.gltf`, `.obj`
- Import animation files: `.fbx`, `.glb`, `.gltf`
- Play imported animation clips using AnimationMixer
- Create keyframe animations in the editor
- Save scene as `.novaforge`
- Load saved scene data
- Export build manifest
- Drag and drop model files into the viewport
- AI Builder prototype that generates starter scene objects from a prompt
- Playable Game Mode with WASD/Arrow movement and Space/J jump
- Character Controller body type in the Inspector
- Static Collider and Dynamic Rigidbody physics body types
- Collision against terrain/platforms
- Script components: Player Input, Rotator, Hover Bob, Side Patrol, Collectable
- Camera follow modes: Free Camera, Follow Player, Follow Selected, and First Person

## Best model format

Use **GLB** whenever possible. FBX is supported for import, but GLB/GLTF is cleaner for browser runtime and game deployment.

Recommended workflow:

```text
Blender / Maya / Mixamo / 3D tool
        ↓
Export FBX if needed
        ↓
Convert or export as GLB/GLTF
        ↓
Import into NovaForge
```

## How to run

Use a local server. Do not double-click `index.html`, because browser module imports and model loading work best from a server.

```bash
cd NovaForgeRealEditor
python server.py
```

Then open:

```text
http://localhost:5173
```

## Controls

### Editor controls

- Left click: select object
- Gizmo arrows/rings/boxes: move, rotate, scale
- Mouse wheel: zoom
- Right drag / orbit controls: rotate view
- Delete / Backspace: delete selected object
- Ctrl+D: duplicate selected object
- W: move tool
- E: rotate tool
- R: scale tool

### Play mode controls

- Press **Play** to enter playable mode
- WASD / Arrow Keys: move the character controller
- Space / J: jump
- Stop: return to editor mode and reset the scene to its edit position
- Camera modes: Free Camera, Follow Player, Follow Selected, First Person

## Important asset notes

This is a browser editor. Some FBX files can be very large or use features that browser loaders do not support cleanly. If an FBX fails, try converting it to GLB in Blender.

GLTF files that reference separate texture/bin files may need all external files served together. GLB is preferred because it bundles the model, textures, and animations into one file.

## Project structure

```text
NovaForgeRealEditor/
├── index.html
├── src/
│   ├── main.js
│   └── styles.css
├── docs/
│   ├── ROADMAP.md
│   ├── ASSET_PIPELINE.md
│   └── ANIMATION_STUDIO.md
├── scripts/
│   └── push_to_github.sh
├── server.py
├── package.json
└── README.md
```

## Next major upgrades

- Local asset library with thumbnails
- GLB conversion pipeline
- Advanced capsule collision and slopes
- Visual scripting graph
- UI canvas editor
- Audio studio
- AR/VR OpenXR layer
- GitHub project sync
- AI code assistant connected to an LLM API

## New playable workflow

1. Press **New Scene** or use the default scene.
2. Select **Player** in the hierarchy.
3. In the Inspector, confirm Body Type is **Character Controller**.
4. Press **Play**.
5. Move with WASD/Arrow Keys and jump with Space/J.
6. Switch camera modes from the Playable Mode panel.
