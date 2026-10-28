# Raster firefly artwork

The board uses `web/assets/firefly.png`: a 1254 × 1254 transparent RGBA PNG generated with the built-in `image_gen` tool. It replaces the inline SVG firefly, including in hint previews. The original generated PNG is preserved without retouching or conversion. Found, bobbing, wiggling, fluttering, and lantern-glow motions animate the raster image in CSS. Reduced-motion mode and hint previews remain static.

The image is preloaded, shared by every revealed cell, included in the offline cache, and packaged inside the APK/AAB. It is decorative; the existing cell labels announce found fireflies. Images cannot intercept taps or start native image dragging.

## Generation prompt

Transparent background was enabled. Exact final prompt:

> Create one production-ready transparent PNG raster game sprite for Firefly Grove, a gentle mobile puzzle game. A friendly cute firefly viewed from above, compact and round, broad silhouette slightly wider than tall. It MUST read as a winged insect at 24–40 pixels: small distinct forest-green round head with two short curved antennae and friendly dot eyes, two very broad translucent ivory/soft-mint wings spread diagonally sideways like open leaf shapes, short round golden glowing abdomen with two subtle dark horizontal insect stripes, and tiny outward-pointing legs. Clearly separated head, thorax, and ROUND abdomen, no elongated vertical body or cylindrical silhouette. Hand-painted polished 2D casual-game illustration with clean dark forest-green contours, softly shaded sage green and buttery yellow, simple chunky shapes and restrained details. Entire insect centered, symmetric overall, occupies about 85% of square canvas, generous clean transparent padding. No background, no floor, no drop shadow outside subject, no scene, no flowers, no text, no border, no sprite sheet. True alpha transparency, a SINGLE complete firefly, crisp and charming, NOT photorealistic, NOT a vector/SVG.

SHA-256: `5ba9ca26b93fe84e7373d1b4494621f871f04eab8a794c00fccebf0c6ef37981`.
