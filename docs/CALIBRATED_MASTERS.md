# Calibrated mockup masters

Use a green display (`#00FF00`) and one compact marker at each theoretical corner of **each** replaceable screen plane:

| Corner | Marker color |
| --- | --- |
| Top left (TL) | `#FF0033` |
| Top right (TR) | `#0066FF` |
| Bottom right (BR) | `#00FFFF` |
| Bottom left (BL) | `#FFD400` |

The marker's **center** is the projection corner. Keep all four centers on the physical glass plane, even when a notch, rounded edge, or hand hides part of it. Use solid 12–20 pixel diameter dots for a 1448-pixel master; scale the size with resolution. Reserve these colors exclusively for markers and save a lossless PNG or WebP when possible.

The Builder detects green connected regions, assigns nearby marker components to each region, and uses color to identify the four corners. It validates the plane and projects screenshots with a 3×3 homography. The green region remains the clipping silhouette, and marker pixels are added to its mask so they disappear from the final result. Each device is calibrated separately. If a complete valid marker set is absent, the Builder tries contour geometry and then offers manual four-point adjustment.

`tests/fixtures/calibrated-handheld-master.png` is a calibrated version of the angled hand-held source. `npm test` checks it with `tests/fixtures/Papers.png` and a checkerboard, plus an extreme synthetic plane with rotation, occlusion, and multiple screens. Visual test results are written to `tests/artifacts/`. The photo's real top and bottom glass edges are similar in width; a larger top-to-bottom taper requires a master photographed or generated with that physical taper.
