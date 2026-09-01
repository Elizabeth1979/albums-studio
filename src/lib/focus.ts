/**
 * Photographs that are out of focus on their own terms.
 *
 * Near-duplicate review already ranks focus, but only *within* a group: it can
 * say which of four frames of the same picture is sharpest, and says nothing at
 * all about a blurred photograph that was taken only once. That is the common
 * case — a phone fired while someone was still moving, and one soft frame sits
 * in the album with nothing to compare it to. This module is the other half.
 *
 * The reading it works from is `blurRatio` in `imaging/reblur`: how much of the
 * picture's detail survives being blurred again. Measures that asked a question
 * *about* a photograph — how much detail, how wide an edge — all failed the same
 * way, because those are properties of the subject rather than of the focus, and
 * a real album proved it: a tack-sharp selfie read 3.9 where the blurred frame
 * beside it read 3.8. This one asks a question the photograph answers about
 * itself, so whatever the subject brought divides out and one line can be drawn
 * across a whole album.
 */
import type { FocusReading } from './imaging/measure'
import type { Photo } from './photos'
import type { SimilarGroup } from './similarity'

/**
 * Above this reading, a photograph is soft enough to mention.
 *
 * How much of the frame's detail survives being blurred again: between 0 and 1,
 * higher being blurrier. Measured through everything a photograph really goes
 * through — blurred at camera size, stored, rounded to whole numbers, and
 * carrying sensor noise.
 *
 * | | in focus | 3px | 6px | 12px | 20px |
 * | --- | --- | --- | --- | --- | --- |
 * | textured | 0.358 | 0.390 | 0.458 | 0.612 | 0.768 |
 * | textured, noisy | 0.354 | 0.384 | 0.446 | 0.573 | 0.657 |
 * | faces | 0.363 | 0.396 | 0.474 | 0.654 | — |
 * | faces, noisy | 0.375 | 0.407 | 0.472 | 0.646 | — |
 *
 * The columns are what matters, and they are why this measure replaced three
 * others. Subject matter moves an in-focus reading by two hundredths — dense
 * water against smooth skin, the pair that defeated every previous attempt —
 * and sensor noise by four thousandths, while blur moves it by four tenths.
 *
 * 0.42 sits in the gap: above every in-focus reading of either subject at any
 * noise level, below every frame the lens missed by six pixels or more. A frame
 * softened by three pixels at camera size goes unmentioned on purpose, as it
 * always has — missing a blurred photograph costs nothing, while telling the
 * owner her sharp photograph of her own face is out of focus costs her trust in
 * every suggestion the studio makes.
 *
 * The one thing it can still get wrong is a portrait shot deliberately against a
 * thrown-out background: with the whole background blurred by eight pixels that
 * reads 0.474. It is on the list of things to fix by finding the people in the
 * frame and judging them rather than the frame.
 */
export const BLURRED_ENOUGH = 0.42

export type SoftPhoto = {
  photo: Photo
  /** How much of this photograph's detail survived being blurred again. */
  blur: number
}

/**
 * What the focus check actually managed to do, for saying so on screen.
 *
 * Reported plainly because three rounds of this feature were debugged blind:
 * an album where the check never ran, one where every photograph failed to
 * read, and one where everything was measured and judged fine all looked
 * identical — nothing on screen distinguished them. A count and the softest
 * reading tell those three apart at a glance.
 */
export type FocusSummary = {
  total: number
  measured: number
  unjudgeable: number
  failed: number
  /** The blurriest reading in the album, or null when nothing was measured. */
  softest: number | null
  /** Every reading obtained, sharpest first. */
  readings: number[]
  /** The reading photographs are judged against. */
  line: number | null
}

export function summariseFocus(
  photos: Photo[],
  readings: Map<string, FocusReading>,
): FocusSummary {
  const summary: FocusSummary = {
    total: photos.length,
    measured: 0,
    unjudgeable: 0,
    failed: 0,
    softest: null,
    readings: [],
    line: null,
  }

  for (const photo of photos) {
    const reading = readings.get(photo.id)
    if (!reading) continue

    if (reading.kind === 'failed') summary.failed += 1
    else if (reading.kind === 'unjudgeable') summary.unjudgeable += 1
    else {
      summary.measured += 1
      if (reading.blur === null) continue

      summary.readings.push(reading.blur)
      summary.softest =
        summary.softest === null ? reading.blur : Math.max(summary.softest, reading.blur)
    }
  }

  summary.readings.sort((one, two) => one - two)

  summary.line = BLURRED_ENOUGH

  return summary
}

/** Photographs the app tried to judge and could not read at all. */
export function unreadable(photos: Photo[], readings: Map<string, FocusReading>): Photo[] {
  return photos.filter((photo) => readings.get(photo.id)?.kind === 'failed')
}

/**
 * The photographs worth asking about, in album order.
 *
 * A photograph with no reading is left alone. That covers one not yet measured,
 * one whose bytes could not be read, and a frame with too little contrast
 * anywhere to judge — fog, a blank wall, a photograph of the sky. Nothing can
 * honestly be said about any of those from here; what separates them is that
 * the album says so out loud when it could not read a photograph at all.
 *
 * Anything already sitting in a near-duplicate group is left out too: it is on
 * the same screen a few centimetres above, with a comparison that says more
 * than this does. Being asked about the same photograph twice, in two different
 * words, reads as two separate problems.
 */
export function findSoftPhotos(
  photos: Photo[],
  readings: Map<string, FocusReading>,
  groups: SimilarGroup[] = [],
): SoftPhoto[] {
  const grouped = new Set(groups.flatMap((group) => group.photos).map((photo) => photo.id))

  return photos
    .filter((photo) => !grouped.has(photo.id))
    .flatMap((photo) => {
      const reading = readings.get(photo.id)

      return reading?.kind === 'measured' &&
        reading.blur !== null &&
        reading.blur > BLURRED_ENOUGH
        ? [{ photo, blur: reading.blur }]
        : []
    })
    .sort((one, two) => one.photo.sortOrder - two.photo.sortOrder)
}

