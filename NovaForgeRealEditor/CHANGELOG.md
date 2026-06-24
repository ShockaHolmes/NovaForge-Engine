# Changelog

## v0.5.0 - Character Controllers and Camera Follow

- Added a dedicated Player object with a starter character controller.
- Added Platform objects as static colliders.
- Added Playable Mode controls for movement and jumping.
- Added WASD/Arrow movement and Space/J jump input.
- Added gravity, grounded checks, simple collision against terrain/platforms, and dynamic body gravity.
- Added Inspector controls for Physics Enabled, Body Type, Use Gravity, Move Speed, Jump Power, and Camera Follow Target.
- Added Script Components UI with Player Input, Rotator, Hover Bob, Side Patrol, and Collectable presets.
- Added camera modes: Free Camera, Follow Player, Follow Selected, and First Person.
- Added follow distance and follow height controls.
- Updated the default scene to include terrain, a platform, a player controller, a collectable, and lighting.
- Saved scenes and build manifests now include gameplay data, scripts, physics, collision settings, and camera target metadata.

## v0.4.2 - Button Rescue Loader

- Fixed the most likely cause of dead buttons: static Three.js CDN imports stopped the entire app when addon modules could not resolve `three`.
- Added a browser import map for `three` and `three/addons/` paths.
- Replaced static module imports with dynamic imports so load failures are caught instead of freezing the UI.
- Added a self-contained fallback editor that starts automatically if Three.js fails to load.
- Fallback mode supports working buttons, add/select/move/rotate/scale objects, inspector edits, save/load, imports as editable placeholders, keyframes, play mode, basic physics, character movement, and scripts.
- Added status-bar error reporting so the user can see what went wrong.


## v0.3.0 - Real Editable Editor

- Rebuilt the prototype around Three.js.
- Added a real WebGL 3D viewport.
- Added click selection with raycasting.
- Added move, rotate, and scale gizmos.
- Added live inspector editing.
- Added FBX, GLB, GLTF, and OBJ import.
- Added imported animation clip playback.
- Added keyframe animation creation.
- Added save/load project scene files.
- Added export build manifest.
- Added AI Builder prototype.
