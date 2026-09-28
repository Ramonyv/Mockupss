# Forma Mockup Studio

A local-first mockup editor built with React, TypeScript, Vite, WebGL, Canvas, and IndexedDB.

The interface uses the locally bundled Google Sans variable font in light and dark themes. Its SIL Open Font License is included at `src/assets/fonts/OFL.txt`.

## Run

```sh
npm install
npm run dev
```

Open the local URL shown by Vite. Build with `npm run build`.

## Workflow

1. Select a template in the library.
2. Upload, drop, or paste one or more screenshots. Multiple files fill screens in order.
3. Select a screen to set Fill/Fit, zoom, position, and rotation. Double-click it for direct adjustment.
4. Export PNG, JPG, or WebP at the master image resolution or a selected output size.

Create private templates at `/template-builder`: upload a master image with bright green displays, wait for the detected screen count, click **Test with screenshot**, then **Save template**. For masters you generate, add the four reserved corner markers described in [Calibrated masters](docs/CALIBRATED_MASTERS.md). Marker centroids determine each screen's projective plane; the green mask independently defines the visible silhouette. Masters without a complete marker set use contour estimation, then manual adjustment if needed. **Perspective Debug** shows the mapped corners, and **Test perspective grid** checks the warp. Use **Detection Settings** to adjust green tolerance or **Fix detection** for manual corner, mask, and foreground corrections. If no valid screen is found, **Save draft** stores the image and metadata locally; reopen it from **My Mockups** to finish setup. Custom templates and imported screenshots stay in IndexedDB. UI preferences stay in localStorage. Published custom templates can be exported and imported as `.forma.json` files.

## Rendering

`src/renderer/render.ts` is shared by preview, builder test mode, and export. It solves a projective homography from the four screen corners, samples the screenshot with WebGL, composites the result in Canvas, then draws the foreground layer. Export uses the template's original dimensions and processes WebGL drawing in tiles.

The library starts empty and shows only templates you create or import. For photographic mockups, supply your own master and transparent foreground layer in Template Builder.

## Current scope

This version covers the core image workflow. Brush masks, batch export, compare mode, and video formats are not included yet. Very large output canvases still depend on browser Canvas limits.
