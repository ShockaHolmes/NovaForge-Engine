# NovaForge Asset Pipeline

## Goal

NovaForge should treat FBX as an import/source format and GLB/GLTF as the preferred runtime format.

## Current editor support

This prototype can import:

- FBX models
- FBX animation clips
- GLB models and animations
- GLTF models and animations
- OBJ static models

## Recommended workflow

1. Create or download the model in Blender, Maya, Mixamo, or another 3D tool.
2. Export as GLB when possible.
3. If the model is only available as FBX, import it into Blender and export to GLB.
4. Import the GLB into NovaForge.
5. Use the transform gizmo and inspector to place the model.
6. Use Animation Studio to play imported clips or create new keyframes.

## Why GLB is preferred

GLB bundles model geometry, materials, textures, skeletons, and animations into one file. This makes browser loading cleaner and more reliable.

## Future production asset pipeline

A professional NovaForge pipeline should include:

- Asset database
- Local asset cache
- Thumbnail generation
- FBX-to-GLB conversion
- Mesh optimization
- Texture compression
- Material conversion
- Animation retargeting
- Skeleton validation
- LOD generation
- Missing texture detection
- Import error reporting
