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
import type { FaceReading } from './imaging/faces'
import type { FocusReading } from './imaging/measure'
import type { Photo } from './photos'
import type { SimilarGroup } from './similarity'

/**
 * Above this reading, a photograph is soft enough to mention.
 *
 * How much of the frame's detail survives being blurred again: between 0 and 1,
 * higher being blurrier. Measured through the chain the app really performs —
 * blurred at camera size, stored at `FULL_SIZE`, rounded to whole numbers, read
 * at `ANALYSIS_CEILING`, and carrying sensor noise.
 *
 * Blur is named here in pixels of the *stored* image, which is what the check is
 * handed. A phone frame is roughly halved on its way into storage, so double
 * these to picture what the lens did.
 *
 * | blur in the stored image | textured | + noise | faces | + noise |
 * | --- | --- | --- | --- | --- |
 * | in focus | 0.362–0.381 | 0.344–0.380 | 0.338–0.353 | 0.344–0.358 |
 * | 1.5px | 0.374–0.393 | 0.354–0.392 | 0.354–0.368 | 0.357–0.371 |
 * | 3px | 0.404–0.424 | 0.377–0.423 | 0.393–0.405 | 0.389–0.402 |
 * | 6px | 0.487–0.508 | 0.433–0.505 | 0.502–0.504 | 0.486–0.489 |
 * | 10px | 0.603–0.623 | 0.488–0.616 | 0.641–0.646 | 0.618–0.620 |
 * | 15px | 0.716–0.740 | 0.507–0.717 | 0.763–0.769 | 0.731–0.732 |
 *
 * Subject matter moves an in-focus reading by about four hundredths and sensor
 * noise by rather less, while a blur the lens would be ashamed of moves it by
 * three tenths. That is what makes one line across a whole album possible, and
 * it is the property every earlier measure lacked.
 *
 * **0.46, and set from her album rather than from this table.** The table only
 * says where the line *may* go: anywhere above 0.424, which is the blurriest an
 * in-focus or mildly softened synthetic frame reads, and below 0.488, which is
 * the sharpest a 10px one reads. Where it *should* go inside that range is a
 * question no generated scene can answer, and her Eilat album answers it — five
 * photographs reading 0.23, 0.27, 0.32, 0.32 and 0.41, every one of which she
 * considers a photograph that came out. The highest is her selfie: sharp faces
 * against a beach thrown deliberately soft, which is a good photograph and the
 * single most dangerous frame this feature will ever see. The line sits five
 * hundredths above it.
 *
 * That is the invariant applied literally. Missing a blurred photograph costs
 * nothing; telling her that her own sharp face is out of focus costs her trust
 * in every suggestion the studio makes. It was previously 0.42, one hundredth
 * above that selfie, and calibrated at a size the app had stopped using.
 *
 * What it buys, and what it gives up: a photograph the lens missed by 10px in
 * storage — twenty on the camera's frame — is offered at any noise level. One
 * softened by 6px is not reliably caught, and one softened by 3px is not caught
 * at all, on purpose. Both are recorded as assertions rather than left to be
 * rediscovered.
 *
 * The one thing it still cannot do is the thing the album most needs. Her
 * blurred photograph reads 0.32, mid-pack among four sharp ones, because its
 * near foreground is genuinely sharp and only the subject is soft. No line
 * across this reading reaches it. That is not a threshold to tune; it is the
 * case for finding the people in the frame and judging them instead, which is
 * the next piece of work.
 */
export const BLURRED_ENOUGH = 0.46

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


/**
 * What looking for faces managed to do, for saying so on screen.
 *
 * The whole point of the first round of this work. Whether BlazeFace can see a
 * small boy in a hat at some distance in a real beach photograph is a question
 * no scene built here can answer, and her album is the only place it can be
 * answered — so the album has to say what happened, plainly, before anything is
 * built on top of it.
 *
 * Four numbers rather than a yes or no, because "no face in this photograph"
 * and "the detector never loaded" are different facts and this feature has
 * already been debugged blind three times by letting outcomes like those look
 * identical.
 */
export type FaceSummary = {
  total: number
  /** Photographs with at least one face found. */
  withFaces: number
  /** Photographs looked at, where the detector found nobody. */
  withoutFaces: number
  /** Photographs where the detector could not run at all. */
  unavailable: number
  /** Why it could not run, when it could not. */
  detail: string | null
  /** How sure the detector was, surest first, for the photographs where it found someone. */
  confidences: number[]
  /**
   * The smallest face found, as a share of its frame's width, or null.
   *
   * The number that says how much room this approach has left. Detection falls
   * off a cliff between 8% and 5% of the frame and finds nobody below about 2%,
   * so a smallest face of 0.30 means the album is nowhere near the edge and a
   * smallest face of 0.03 means it is standing on it.
   */
  smallestFace: number | null
}

export function summariseFaces(
  photos: Photo[],
  readings: Map<string, FaceReading>,
): FaceSummary {
  const summary: FaceSummary = {
    total: photos.length,
    withFaces: 0,
    withoutFaces: 0,
    unavailable: 0,
    detail: null,
    confidences: [],
    smallestFace: null,
  }

  for (const photo of photos) {
    const reading = readings.get(photo.id)
    if (!reading) continue

    if (reading.kind === 'faces') {
      summary.withFaces += 1
      summary.confidences.push(Math.max(...reading.boxes.map((one) => one.confidence)))

      for (const box of reading.boxes) {
        summary.smallestFace =
          summary.smallestFace === null ? box.share : Math.min(summary.smallestFace, box.share)
      }
    } else if (reading.kind === 'none') {
      summary.withoutFaces += 1
    } else {
      summary.unavailable += 1
      // The first reason is as good as the last and they are almost always the
      // same one; a list of identical sentences says nothing extra.
      summary.detail ??= reading.detail
    }
  }

  summary.confidences.sort((one, two) => two - one)

  return summary
}
