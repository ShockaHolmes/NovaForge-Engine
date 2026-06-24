# Character Controller and Camera Follow

NovaForge v0.5.0 adds the first playable game loop layer.

## Character Controller

Use the **Player** object or add the **Player Input** script to an object. In the Inspector, set:

- Physics Enabled: on
- Body Type: Character Controller
- Use Gravity: on
- Move Speed: desired walking speed
- Jump Power: desired jump strength

## Collision

Use **Terrain**, **Plane**, or **Platform** as static colliders. The character controller can stand on them and jump from them.

## Camera Modes

The Playable Mode panel includes:

- Free Camera
- Follow Player
- Follow Selected
- First Person

Follow Distance and Follow Height control the third-person camera offset.

## Play Controls

- WASD or Arrow Keys: move
- Space or J: jump
- Stop: return to editor mode and reset scene state
