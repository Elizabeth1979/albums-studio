/**
 * How much detail a photograph loses when it is blurred again.
 *
 * Every measure this feature has tried asked a question *about* the picture and
 * needed a number to compare the answer against — how much detail, how wide an
 * edge — and each one failed the same way, because those numbers are properties
 * of what the photograph is of. Water is full of detail and skin is not, so the
 * same reading means "sharp" in one frame and "blurred" in another, and there is
 * no threshold that holds across an album.
 *
 * This asks a question the photograph answers about *itself*. Blur it again and
 * see how much it changes. A frame that came out has fine detail to lose and
 * loses a great deal; a frame the camera already blurred has little left and
 * barely changes. The reading is the ratio between the two, so whatever the
 * subject brought to the picture divides out — a seascape and a portrait are
 * each compared only against themselves.
 *
 * This is Crété-Roffet's no-reference perceptual blur metric (2007), which is
 * the standard answer to precisely the problem this feature kept hitting.
 */

/**
 * How far the picture is smoothed before it is compared with itself.
 *
 * Noise is the fault that has broken every measure here, and it breaks this one
 * the same way if left in: noise is one-pixel spikes, the re-blur wipes them out
 * completely, so a noisy frame looks like it lost a great deal of detail and
 * therefore reads sharp. Untouched, a frame blurred twenty pixels with a trace
 * of grain read 0.213 against 0.269 for a sharp one — backwards again.
 *
 * Smoothed first, the same pair reads 0.748 against 0.357, and heavy grain moves
 * a sharp frame by four thousandths.
 */
const DENOISE = 1.5

/** A separable Gaussian, for taking the grain out before anything is compared. */
function smooth(source: Float64Array, width: number, height: number): Float64Array {
  const radius = Math.max(1, Math.ceil(DENOISE * 3))
  const weights: number[] = []
  for (let i = -radius; i <= radius; i += 1) {
    weights.push(Math.exp(-(i * i) / (2 * DENOISE * DENOISE)))
  }
  const sum = weights.reduce((one, two) => one + two, 0)
  const kernel = weights.map((weight) => weight / sum)

  const clamp = (value: number, limit: number) => Math.min(limit - 1, Math.max(0, value))
  const horizontal = new Float64Array(source.length)
  const out = new Float64Array(source.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * source[y * width + clamp(x + i, width)]
      }
      horizontal[y * width + x] = total
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * horizontal[clamp(y + i, height) * width + x]
      }
      out[y * width + x] = total
    }
  }

  return out
}

/** Neighbour-to-neighbour differences, summed along one axis. */
function variation(luma: Float64Array, width: number, height: number, horizontal: boolean): {
  original: number[]
  count: number
} {
  const values: number[] = []

  if (horizontal) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 1; x < width; x += 1) {
        values.push(Math.abs(luma[y * width + x] - luma[y * width + x - 1]))
      }
    }
  } else {
    for (let y = 1; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        values.push(Math.abs(luma[y * width + x] - luma[(y - 1) * width + x]))
      }
    }
  }

  return { original: values, count: values.length }
}

/**
 * The re-blur itself: a nine-pixel average along one axis.
 *
 * The published metric uses nine, which is right for the small images it was
 * validated on and wrong here: at nine, a frame blurred past twelve pixels was
 * already smoother than the re-blur, so re-blurring changed it hardly at all and
 * the reading fell back down — 20px blur read 0.370 against 0.515 for 6px, so
 * the worst photographs measured better than the merely soft ones. Twenty-five
 * spans the blur a phone actually produces, and the reading rises all the way
 * from 0.36 to 0.77.
 */
const REBLUR_SPAN = 25

function reblur(
  luma: Float64Array,
  width: number,
  height: number,
  horizontal: boolean,
): Float64Array {
  const out = new Float64Array(luma.length)
  const reach = Math.floor(REBLUR_SPAN / 2)
  const clamp = (value: number, limit: number) => Math.min(limit - 1, Math.max(0, value))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      for (let step = -reach; step <= reach; step += 1) {
        total += horizontal
          ? luma[y * width + clamp(x + step, width)]
          : luma[clamp(y + step, height) * width + x]
      }
      out[y * width + x] = total / REBLUR_SPAN
    }
  }

  return out
}

/**
 * The share of the picture's detail that survives being blurred again.
 *
 * Between 0 and 1, and **higher means blurrier**: it is the fraction of the
 * frame's neighbour-to-neighbour variation that re-blurring does *not* take
 * away. A photograph that came out has crisp transitions that the re-blur
 * flattens, so little survives and the reading is low. One the camera already
 * blurred has nothing left to flatten, so almost all of it survives.
 *
 * Returns null for a frame with no variation to speak of — fog, a blank wall —
 * where the ratio would be a division by nothing.
 */
export function blurRatio(raw: Float64Array, width: number, height: number): number | null {
  if (width < REBLUR_SPAN + 2 || height < REBLUR_SPAN + 2) return null

  const luma = smooth(raw, width, height)

  const alongEachAxis = [true, false].map((horizontal) => {
    const blurred = reblur(luma, width, height, horizontal)
    const first = variation(luma, width, height, horizontal).original
    const second = variation(blurred, width, height, horizontal).original

    let detail = 0
    let lost = 0

    for (let index = 0; index < first.length; index += 1) {
      detail += first[index]
      lost += Math.max(0, first[index] - second[index])
    }

    return detail === 0 ? null : (detail - lost) / detail
  })

  const readings = alongEachAxis.filter((value): value is number => value !== null)
  if (readings.length === 0) return null

  // The blurrier axis decides. A photograph smeared by a hand moving sideways is
  // blurred, however crisp it still is from top to bottom.
  return Math.max(...readings)
}
