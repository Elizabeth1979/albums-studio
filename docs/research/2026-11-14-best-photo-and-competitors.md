# Best-photo picking and competing products

**Date:** 2026-11-14

What the industry does to pick the best photo of a moment, what people complain about in
competing products, and what that means for Albums Studio. Decisions taken from it are in the
[roadmap](../plans/2026-08-15-albums-studio-roadmap.md); this note keeps the evidence and the
reasoning.

**Source quality.** Reddit refuses automated access, so no Reddit threads were read. User voice
comes from app reviews, Apple's discussion forums, MacRumors and sites that analyse app-store
reviews. Several comparison articles are written by a competitor of the product they review;
those claims are weighted down and marked below.

## How the industry picks the best photo

**Pro culling tools** (Aftershoot, Narrative Select, FilterPixel) all ship the same core:

1. Group similar frames (bursts and near-duplicates).
2. Flag blur.
3. Flag closed eyes.
4. Judge focus on the faces, not the whole frame.
5. Suggest; the photographer decides.

Narrative adds a **close-up panel**: every face in the selected frames, cropped and shown side
by side, so a blink is spotted by eye rather than trusted to the detector.

**Consumer apps.** Google Photos stacks near-identical shots; Apple Photos keeps bursts apart
and only merges exact duplicates; Gemini Photos (MacPaw) suggests which similar shot to keep.
Google's Best Take composites the best face of each person from several frames into a picture
that was never taken.

**Where Albums Studio stands.** Grouping and blur match the standard. Closed eyes and
face-level checks are the gap.

## What people complain about

| Complaint | Source | Meaning for us |
| --- | --- | --- |
| The AI chose a half-blink; it also rejected a laughing, tearful or kissing moment because the eyes were closed | Digital Camera World review; Narrative's comparison (competitor) | A blink lowers a frame, never removes it, and the reason is shown |
| "Half the book is bad framing I would never have chosen" — Chatbooks auto-picked and auto-cropped | Unstar review analysis (single anecdote) | Never auto-crop; never publish without the owner's review |
| Shared albums give relatives shrunken copies; iCloud capped them near 2048px for years, fixed only in iOS 27 | Apple discussions, MacRumors | **Applies to us**: we store 2000px only |
| Relatives will not make an account or install an app | Family-sharing vendor blogs (self-interested) | Already solved: viewers need no account |
| Relatives want to add their own photos to a shared album | Same | Not possible yet; added to the roadmap |
| Subscription traps, ads after every tap, paywalled basics | Unstar review analysis | Predictable cost is already a product requirement; keep it a selling point |
| Memories keep resurfacing an ex or someone who has died | Google Photos coverage (9to5Google, Android Central) | Any automatic memories feature needs "hide this person" from day one |
| Cannot choose the cover of an automatic memory (iOS) | iMore | Already solved: owners choose album covers |

## Closed eyes are usually, not always, a fault

Reviewers agree a blink is the commonest reason a frame is worse, and also that an intentional
closed-eye moment (a kiss, a laugh, a prayer, a tearful moment) is often the best frame of all.
No source gives a rate, and nothing here measures one.

The design that handles both: **compare a person's eyes only across frames of the same moment.**
Within a similar-photo group, a frame is marked down only when the same person has their eyes
open in another frame of that group — which is exactly a blink. A kiss photographed five times
has closed eyes in all five, so no frame is marked down. A photograph with no sibling is never
judged on eyes at all. Laughing (eyes shut, wide smile) is worth testing as a second exception
once the detector's readings have been seen on real albums.

## Things worth not copying

- **Best Take face swaps.** They change a family record into something that did not happen.
- **Generic "is this a nice photo" scoring** (NIMA and similar, e.g. idealo's Apache-2.0
  implementation). Trained on photo-contest ratings; favours artistic frames over family
  moments.
- **Auto-crop and auto-publish.**

## Storage cost of full-quality originals

Supabase Pro, from the official pricing page: file storage $0.0213/GB-month beyond the 100 GB
included; egress $0.09/GB beyond 250 GB included.

A phone original is typically 2-6 MB; our 2000px copy at JPEG quality 0.85 is well under 1 MB.
At 4 MB per original:

- 1,000 photos ≈ 4 GB ≈ $0.09 a month, about $1 a year.
- A relative downloading a 300-photo album in full ≈ 1.2 GB ≈ $0.11 once.

The cost is small per user. What matters is that **an original not kept at upload can never be
recovered**: paying later cannot restore it. That is why originals are kept for every upload,
and why price is set by storage quota rather than by a separate "high quality" add-on.

What 2000px is good for: any screen, and prints up to about 17 cm (6.7 in) on the long edge at
print resolution — a 10×15 cm print. A full A4 page or a photo-book spread needs about
3,500px, so printed books need originals.

## Sources

- [Digital Camera World – Aftershoot review](https://digitalcameraworld.com/reviews/aftershoot-review)
- [Shotkit – Aftershoot review](https://shotkit.com/aftershoot-review/)
- [Narrative – Aftershoot vs Narrative](https://narrative.so/blog/aftershoot-vs-narrative-which-is-better-culling-software) (competitor)
- [Shotkit – FilterPixel review](https://shotkit.com/filterpixel-review/)
- [PhotoWorkout – AI culling software 2026](https://www.photoworkout.com/?p=223718)
- [MacStories – Gemini Photos](https://www.macstories.net/reviews/gemini-photos-declutters-your-photo-library/)
- [Google – Ask Photos](https://blog.google/products-and-platforms/products/photos/updates-ask-photos-search/)
- [iMore – Memories cover photo](https://www.imore.com/how-to-pick-cover-photo-memories-does-not-work)
- [Apple Community – shared albums low quality](https://discussions-jp-prz.apple.com/thread/256124221)
- [MacRumors – iOS 27 full-resolution shared albums](https://macrumors.com/2026/08/20/ios-27-shared-albums-eat-into-icloud-storage)
- [Unstar – photo print apps ranked](https://unstar.app/blog/shutterfly-snapfish-freeprints-chatbooks-mixbook-photo-print-apps-ranked-2026)
- [Unstar – photo app complaints](https://unstar.app/blog/photo-editing-app-reviews-what-creators-hate-most-2026)
- [Tom's Guide – Mixbook review](https://www.tomsguide.com/reviews/mixbook)
- [Viallo – sharing with grandparents](https://viallo.app/blog/share-photos-with-grandparents) (vendor)
- [FamilyAlbum vs Google Photos](https://blog.family-album.com/blog/familyalbum-vs-google-photos-which-is-better-for-families/) (vendor)
- [Ente – safe photo sharing for kids](https://ente.com/articles/safe-photo-sharing-for-kids/) (vendor)
- [9to5Google – hide faces from Memories](https://9to5google.com/2024/05/01/google-photos-hide-face-from-memory/)
- [MediaPipe Face Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [idealo image-quality-assessment](https://github.com/idealo/image-quality-assessment)
- [Supabase pricing](https://supabase.com/docs/pricing)
