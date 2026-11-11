# Three.js r187 (vendored, minified)

Built from the official r187 release (https://github.com/mrdoob/three.js/tree/r187) with esbuild:

```sh
esbuild build/three.module.js --bundle --format=esm --minify --legal-comments=eof --outfile=three.min.js
esbuild examples/jsm/controls/OrbitControls.js --format=esm --minify --legal-comments=eof --outfile=addons/controls/OrbitControls.min.js
esbuild examples/jsm/controls/MapControls.js  --format=esm --minify --legal-comments=eof --outfile=addons/controls/MapControls.min.js
# then in MapControls.min.js: "./OrbitControls.js" -> "./OrbitControls.min.js"
```

`index.html` maps the bare import `three` to `three.min.js`. Licence: MIT (see LICENSE).

Also vendored (same build steps):

```sh
esbuild examples/jsm/objects/Sky.js --format=esm --minify --legal-comments=eof --outfile=addons/objects/Sky.min.js
esbuild examples/jsm/utils/BufferGeometryUtils.js --format=esm --minify --legal-comments=eof --outfile=addons/utils/BufferGeometryUtils.min.js
```

Post-processing (night glow), bundled into one file and loaded only after the town is on screen:

```sh
# entry re-exports EffectComposer, RenderPass, UnrealBloomPass, OutputPass from examples/jsm/postprocessing
esbuild pp-entry.js --bundle --external:three --format=esm --minify --legal-comments=eof --outfile=addons/postprocessing/bloom.min.js
```
