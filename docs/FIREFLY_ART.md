# Raster firefly artwork

Mode: built-in image_gen, with transparent background and the approved dark lightning beetle as the reference. The exact final prompt is preserved in [prompt.txt](../artwork/firefly/prompt.txt), alongside the [reference](../artwork/firefly/reference.png) and unchanged [generated source atlas](../artwork/firefly/atlas-source.png).

The 4 × 4 source atlas supplies painted closed-wing, wing-flap, luminous-tail, and bush-emergence poses. scripts/build-firefly-sprites.py uses Pillow to crop, register, and pack these poses; it does not draw the insect or invent motion with transforms. Run python scripts/build-firefly-sprites.py with Pillow installed to regenerate the committed outputs. App and CI builds require neither Python nor image generation.

- web/assets/firefly.png: 256 × 256 transparent closed-wing resting pose, also used in static hint previews and reduced-motion mode.
- web/assets/firefly-atlas.png: 1024 × 1024 PNG containing sixteen 256 × 256 frames.
- web/firefly-frames.js: generated frame indices and durations.
- [Found preview](../artwork/firefly/found-preview.webp): the bug peeks out from a bush, emerges with flapping wings, and closes its wings (1.1 seconds).
- [Idle preview](../artwork/firefly/idle-preview.webp): wings open, flap with a brighter tail, then close (1.035 seconds).

web/firefly-player.js copies individual atlas tiles to a canvas using independent clocks. All wing movement, emergence, leaves, and changing illumination are painted into the raster frames. Fireflies have no CSS motion, scaling, or animated filters. Finished or cancelled sequences restore the closed-wing PNG. Atlas loading retains the resting image, and load failure leaves a static insect. Each active sequence redraws only when its frame changes; all insects share one animation-frame loop.

Random idle sequences pause at home, during dialogs, when hidden, and under reduced-motion preferences. Found sequences finish before the completion dialog appears. A revealed firefly stays static while its hint explanation is open, then plays its arrival after Continue. Assets are preloaded and cached offline, decorative to screen readers, and cannot intercept taps or initiate native dragging.
