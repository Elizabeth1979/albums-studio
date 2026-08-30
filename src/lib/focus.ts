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
 * How far below its album a photograph has to read before it is worth
 * mentioning.
 *
 * Relative, not absolute, and that is the correction. The reading is a ratio of
 * detail to contrast, and how much fine detail a photograph carries is a fact
 * about the scene rather than about the focus: water, sand, foliage and hair
 * produce far more of it than a wall or a sky. Scenes built from synthetic
 * texture read around 1 when sharp; a real album of beach photographs read
 * between 2 and 15, with the plainly blurred frame at 2.23 — above every
 * absolute line drawn from those synthetic scenes, and the reason four rounds
 * of this feature said nothing.
 *
 * What does hold across scenes is the comparison *within one album*: the same
 * camera, the same sort of subject, mostly the same afternoon. A photograph
 * reading well under what the rest of that album reads is the odd one out
 * whatever the absolute numbers are.
 *
 * At 0.6 a frame has to read under three fifths of its album's median. In the
 * album this was calibrated against, the sharp photographs sit near the median
 * and the blurred one sits far below it.
 */
export const SOFT_SHARE_OF_ALBUM = 0.6

/**
 * How many photographs must have been measured before a median means anything.
 *
 * With three photographs a "median" is one photograph, and the softest of three
 * is not evidence of anything.
 */
export const ENOUGH_TO_COMPARE = 4

/**
 * An absolute floor kept underneath the comparison, for the frame that is
 * blurred beyond any argument.
 *
 * It cannot be the main rule — that was the mistake — but a reading this low
 * means nothing in the frame has an edge, whatever the album around it looks
 * like, and a one-photograph album has no album to be compared against.
 */
export const SOFT_FOCUS = 0.4

/** The middle reading of an album, which the rest are judged against. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((one, two) => one - two)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export type SoftPhoto = {
  photo: Photo
  /** What the measurement said, kept so the interface can explain itself. */
  focus: number
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
  /** The lowest reading obtained, or null when nothing was measured. */
  softest: number | null
  /** Every reading obtained, lowest first. */
  readings: number[]
  /** The line photographs were judged against, once the album set one. */
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
      summary.readings.push(reading.focus)
      summary.softest =
        summary.softest === null ? reading.focus : Math.min(summary.softest, reading.focus)
    }
  }

  summary.readings.sort((one, two) => one - two)

  const middle =
    summary.readings.length >= ENOUGH_TO_COMPARE ? median(summary.readings) : null
  void middle
  summary.line = SOFT_FOCUS

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

  const measured = photos.flatMap((photo) => {
    const reading = readings.get(photo.id)
    return reading?.kind === 'measured' ? [reading.focus] : []
  })

  // Withdrawn, deliberately, and the reasoning is worth keeping.
  //
  // Comparing a photograph against its album fixed the scale problem and
  // introduced a worse one: the reading counts fine detail, and a sharp
  // close-up of two faces carries far less of it than a mediocre photograph of
  // rippling water. In an album of beach scenes the portrait is the outlier, so
  // the first thing this rule did in a real album was tell the owner her sharp
  // photograph of herself was out of focus.
  //
  // Between missing a blurred photograph and condemning a good one, this
  // product has always chosen to miss, so the comparison stays off until the
  // reading measures how soft an edge is rather than how much texture a scene
  // happens to contain. `ENOUGH_TO_COMPARE`, `SOFT_SHARE_OF_ALBUM` and
  // `median` stay for that work.
  void ENOUGH_TO_COMPARE
  void SOFT_SHARE_OF_ALBUM
  void measured
  const line = SOFT_FOCUS

  return photos
    .filter((photo) => !grouped.has(photo.id))
    .flatMap((photo) => {
      const reading = readings.get(photo.id)

      return reading?.kind === 'measured' && reading.focus < line
        ? [{ photo, focus: reading.focus }]
        : []
    })
    .sort((one, two) => one.photo.sortOrder - two.photo.sortOrder)
}

