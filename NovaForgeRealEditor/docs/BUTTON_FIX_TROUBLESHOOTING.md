# NovaForge Button Fix Troubleshooting

## What was wrong

The editor used static imports from the Three.js CDN. Three.js addon files import the package name `three`, and browsers need an import map to resolve that name. Without the import map, the module failed before NovaForge could attach button click handlers.

## What changed in v0.4.2

- Added an import map in `index.html`.
- Changed `src/main.js` to dynamically import Three.js modules.
- Added a fallback editor that starts if Three.js fails to load.
- Added safer button wrappers and status messages.

## How to run

```bash
cd NovaForgeRealEditor
python server.py
```

Open:

```text
http://localhost:5173
```

Do not double-click `index.html` for the full WebGL editor. Double-clicking may work in fallback mode, but model imports and module loading are more reliable through the local server.

## If buttons still do not work

1. Open DevTools with `F12`.
2. Click the Console tab.
3. Refresh the page.
4. Look for red errors.
5. Confirm the status bar says either:
   - `NovaForge Real Editor loaded...`, or
   - `Fallback editor loaded. Buttons now work...`

If the status bar does not change at all, the browser may be loading an old cached file. Stop the server, restart it, and refresh with `Ctrl + F5`.
