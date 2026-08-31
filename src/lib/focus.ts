/**
 * Photographs that are out of focus on their own terms.
 *
 * Near-duplicate review already ranks focus, but only *within* a group: it can
 * say which of four frames of the same picture is sharpest, and says nothing at
 * all about a blurred photograph that was taken only once. That is the common
 * case — a phone fired while someone was still moving, and one soft frame sits
 * in the album with nothing to compare it to. This module is the other half.
 *
 * The reading it works from is `edgeWidth` in `imaging/sharpness`: how many
 * pixels the picture's crispest transitions take to cross. That is the one
 * property of a photograph that moves with focus and barely at all with what
 * the photograph is of — a wave against sand and a cheek against the sky both
 * cross in a pixel or two when the lens found them — which is what allows a
 * single line to be drawn across a whole album at all.
 */
import type { FocusReading } from './imaging/measure'
import type { Photo } from './photos'
import type { SimilarGroup } from './similarity'

/**
 * Above this width, in pixels, a photograph's edges are soft enough to mention.
 *
 * Measured through everything a photograph really goes through before this sees
 * it — blurred at camera size, shrunk to a thumbnail, rounded to whole numbers,
 * and carrying sensor noise — across the kinds of content that have broken this
 * feature before: dense texture (water, sand), smooth subjects (faces), and a
 * sharp subject against a deliberately blurred background.
 *
 * | | in focus | 3px | 6px | 12px | 20px |
 * | --- | --- | --- | --- | --- | --- |
 * | textured, clean | 4.72 | 5.57 | 7.60 | 12.00 | 19.03 |
 * | textured, noisy | 4.63 | 5.23 | 6.55 | 9.35 | 7.52 |
 * | faces | 4.32 | — | 7.00 | 11.70 | — |
 * | sharp subject, blurred background | 4.37 | — | — | — | — |
 *
 * Two things to read off it. Every in-focus reading, whatever the subject and
 * whatever the noise, lands between 4.3 and 4.8 — a spread of half a pixel,
 * where the measure this replaced moved five-fold with subject matter. And
 * every reading of a photograph the lens actually missed by six pixels or more
 * is at least 6.5, in the noisiest case as much as in the cleanest.
 *
 * 6.0 sits in that gap. It errs towards saying nothing, deliberately: a frame
 * softened by three pixels at camera size — one pixel by the time it is a
 * thumbnail — goes unmentioned, and that is the right trade. Missing a blurred
 * photograph costs nothing, while telling the owner her sharp photograph of her
 * own face is out of focus costs her trust in every suggestion the studio makes.
 */
export const SOFT_EDGE_WIDTH = 6.0

export type SoftPhoto = {
  photo: Photo
  /** How wide this photograph's edges are, in pixels. */
  edgeWidth: number
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
  /** The widest edges found in the album, or null when nothing was measured. */
  softest: number | null
  /** Every reading obtained, narrowest edges first. */
  readings: number[]
  /** The width photographs are judged against. */
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
      summary.readings.push(reading.edgeWidth)
      summary.softest =
        summary.softest === null
          ? reading.edgeWidth
          : Math.max(summary.softest, reading.edgeWidth)
    }
  }

  summary.readings.sort((one, two) => one - two)

  summary.line = SOFT_EDGE_WIDTH

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

      return reading?.kind === 'measured' && reading.edgeWidth > SOFT_EDGE_WIDTH
        ? [{ photo, edgeWidth: reading.edgeWidth }]
        : []
    })
    .sort((one, two) => one.photo.sortOrder - two.photo.sortOrder)
}

