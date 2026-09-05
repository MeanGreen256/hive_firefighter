# AI-assisted graphics quality workflow

Use GPT and image generation to shorten visual iteration, not to replace the
game's deterministic art contracts. Harbour Hill and Sunflower Valley are
procedural 3D scenes: gameplay geometry, state signals, camera composition, and
style colours remain code/content so both styles stay synchronized.

## Review order

1. **Hard gates:** the intended state and style boot; the canvas is non-empty;
   there are no browser errors; geometry is attached and inside authored world
   space; draw, triangle, particle, frame, shadow, and DPR budgets pass.
2. **Gameplay meaning:** fire owns saturation; smoke leads to the incident;
   water has an obvious origin, arc, and contact; heroes and the Firehouse read
   at gameplay distance; the next action is unambiguous.
3. **Perceptual polish:** inspect clipping, z-fighting, seams, depth ordering,
   silhouette, material consistency, and preservation across both styles.

This follows the useful image-evaluation split between non-negotiable gates and
graded perceptual quality. A pretty frame that points at the wrong incident is
still a failed game frame.

## When to generate an image

Image generation is appropriate for a concept reference, a deliberately
texture-based scenic detail, or a UI illustration that cannot be expressed by
the shared primitive vocabulary. Do not generate a bitmap to repair camera
placement, transforms, depth, dynamic fire state, or a district-content error.

Before integrating generated art, require:

- an explicit gameplay use and target camera/view size;
- both-style ownership, or a documented shared treatment;
- transparent PNG/WebP only when transparency is actually required;
- correct sRGB annotation for colour textures;
- a measured bundle/draw-call cost and a deterministic fallback;
- review at full gameplay size and at a 200 px thumbnail.

## Prompt and edit recipe

Structure a generation prompt in this order: background/scene, main subject,
defining details, then constraints. State the viewpoint, lighting, composition,
palette role, and empty-space requirements explicitly. For follow-up edits,
make one local request at a time: “change only X; preserve camera, layout,
lighting, palette roles, silhouette, and transparent background.”

Evaluate each candidate against a short rubric: hard-constraint pass/fail,
subject readability, style consistency, preservation/locality, production
fitness, and hidden failures such as halos, accidental text, broken alpha, or
details that disappear at gameplay scale.

## Sources

- [OpenAI GPT Image prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [OpenAI image evaluation workflow](https://developers.openai.com/cookbook/examples/multimodal/image_evals)
- [Three.js colour management](https://threejs.org/manual/en/color-management.html)
- [Three.js shadow tradeoffs](https://threejs.org/manual/en/shadows.html)
- [Three.js transparency pitfalls](https://threejs.org/manual/en/transparency.html)
