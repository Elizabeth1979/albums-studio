/**
 * Photographs that are out of focus on their own terms.
 *
 * Near-duplicate review already ranks focus, but only *within* a group: it can
 * say which of four frames of the same picture is sharpest, and says nothing at
 * all about a blurred photograph that was taken only once. That is the common
 * case — a phone fired while someone was still moving, and one soft frame sits
 * in the album with nothing to compare it to. This module is the other half.
 *
 * The reading it works from is `focusScore` in `imaging/sharpness`: how well the
 * best-focused part of the frame is focused, divided by that part's own
 * contrast. Both halves matter here. Judging the sharpest part rather than the
 * average is what lets a portrait with a deliberately blurred background pass,
 * and dividing by contrast is what stops a misty lake from being called a
 * mistake. Between them they make one number that means the same thing for a
 * landscape, a portrait and a close-up — which is what allows a single line to
 * be drawn at all.
 */
import type { FocusReading } from './imaging/measure'
import type { Photo } from './photos'
import type { SimilarGroup } from './similarity'

/**
 * Above this width, in pixels, a photograph's edges are soft enough to mention.
 *
 * Measured through the reduction a photograph really goes through — blurred at
 * camera size, shrunk to a thumbnail, rounded to whole numbers — across two
 * kinds of content chosen because they broke the measure this replaces: dense
 * texture (water, sand) and smooth subjects (faces, sky).
 *
 * | | textured | faces |
 * | --- | --- | --- |
 * | in focus | 1.78 | 2.00 |
 * | barely soft | 1.94 | 2.00 |
 * | soft | 2.78 | 2.47 |
 * | blurred | 3.11 | 3.00 |
 * | plainly blurred | 5.7 | 5.9 |
 * | sharp subject, blurred background | 1.73 | — |
 *
 * The two columns are the point. Subject matter moves the reading by about two
 * tenths of a pixel; blur moves it from 1.8 to 5.9. The measure this replaces
 * moved five-fold with subject matter, which is how a sharp close-up of two
 * faces came to be offered for deletion beside an album of seascapes.
 *
 * 2.8 sits forty per cent above every in-focus reading of either kind — nothing
 * sharp is offered, and a portrait against a deliberately blurred background is
 * furthest of all from the line — while catching everything from a plainly
 * blurred frame down to a mildly soft one. It errs towards saying nothing,
 * deliberately: missing a blurred photograph costs nothing, while telling the
 * owner her sharp photograph of her own face is out of focus costs her trust in
 * every suggestion the studio makes.
 */
export const SOFT_EDGE_WIDTH = 2.8

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

