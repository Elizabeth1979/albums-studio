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

`face_landmarker.task` (3.6 MB) reads the eyes in each face the detector found.
Also not in the npm package; published at

    https://storage.googleapis.com/mediapipe-models/face_landmarker/
      face_landmarker/float16/1/face_landmarker.task

    sha256  64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff

It is fetched by the browser only when an album has near-identical photographs
with faces in them.

`efficientdet_lite0.tflite` (4.6 MB, the int8 build) finds each person whole, so
blur can be read person by person where a face is too small or smeared to find.
Published at

    https://storage.googleapis.com/mediapipe-models/object_detector/
      efficientdet_lite0/int8/1/efficientdet_lite0.tflite

    sha256  0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb

The int8 build rather than float16 (7.3 MB): on the owner's night burst both
returned the same people, at the same confidences, to two decimal places. It is
fetched only when an album has near-identical photographs.

Both are committed rather than fetched: a build that reaches out to Google's
storage is a build that fails when Google's storage does, and a deploy should
not depend on a third party being up. 224 KB is a fair price for that.

## Why any of this is served from here

Neither file is loaded from a CDN, and that is deliberate. A private album
should not tell a third party which photographs are being looked at, and the
alternative failure — a CDN that is slow, blocked, or gone — is one nobody
maintaining this app could debug from the outside.
