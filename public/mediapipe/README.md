# The face detector's runtime and model

Two kinds of file live here, and they are handled differently on purpose.

## The WebAssembly runtime — copied, not committed

`vision_wasm_internal.{js,wasm}` and `vision_wasm_nosimd_internal.{js,wasm}` are
copied out of `node_modules/@mediapipe/tasks-vision` by
`scripts/vendor-mediapipe.mjs`, which runs before every dev server and every
build. They are 22 MB, reproducible from the pinned dependency, and ignored by
git.

The browser fetches exactly one of the two — MediaPipe asks for the SIMD build
where the browser can instantiate one and the `nosimd` build where it cannot —
and it arrives compressed, about 3.3 MB over the wire.

## The model — committed

`blaze_face_short_range.tflite` (224 KB) is BlazeFace, and it is **not** in the
npm package. MediaPipe publishes it separately at

    https://storage.googleapis.com/mediapipe-models/face_detector/
      blaze_face_short_range/float16/1/blaze_face_short_range.tflite

    sha256  b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f

So it is committed rather than fetched: a build that reaches out to Google's
storage is a build that fails when Google's storage does, and a deploy should
not depend on a third party being up. 224 KB is a fair price for that.

## Why any of this is served from here

Neither file is loaded from a CDN, and that is deliberate. A private album
should not tell a third party which photographs are being looked at, and the
alternative failure — a CDN that is slow, blocked, or gone — is one nobody
maintaining this app could debug from the outside.
