# Scanlight for Figma

The Scanlight engine (`../src/engine`) and inspector (`../src/ui/Inspector.tsx`) running as a Figma plugin.

## Run it

```sh
npm run plugin:build     # or plugin:watch while developing
```

In the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and pick `figma-plugin/manifest.json`.
The manifest `"id"` is the published Community listing; keep it so updates go to the same plugin.

## How it fits together

| File | Runs in | Job |
|---|---|---|
| `code.ts` | Figma's sandbox (no DOM, no WebGL) | Reads the selection, exports its pixels, writes results back |
| `ui/` | The plugin iframe (a normal browser page) | Live WebGL preview, inspector, renders the PNG or SVG |
| `messages.ts` | Both | The message types passed between them |

## Output modes

- **Fill**: replaces a shape's fill. Its own paints stay hidden underneath, and **Restore original** brings them back.
- **New layer**: an image rectangle beside the selection.
- **Vectors**: editable shapes from the SVG exporter (LED, Halftone, Ordered, Diffusion, ASCII).

Every result keeps its source pixels (a hidden image paint) and its settings (plugin data). Selecting it later
reopens it with the same settings. Applying again updates it in place instead of stacking a new copy.

Motion previews live, but Apply writes the frame on screen as a still image.
