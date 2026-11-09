# Three.js r187 (vendored, minified)

Built from the official r187 release (https://github.com/mrdoob/three.js/tree/r187) with esbuild:

```sh
esbuild build/three.module.js --bundle --format=esm --minify --legal-comments=eof --outfile=three.min.js
esbuild examples/jsm/controls/OrbitControls.js --format=esm --minify --legal-comments=eof --outfile=addons/controls/OrbitControls.min.js
esbuild examples/jsm/controls/MapControls.js  --format=esm --minify --legal-comments=eof --outfile=addons/controls/MapControls.min.js
# then in MapControls.min.js: "./OrbitControls.js" -> "./OrbitControls.min.js"
```

`index.html` maps the bare import `three` to `three.min.js`. Licence: MIT (see LICENSE).
