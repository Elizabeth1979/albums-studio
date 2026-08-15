# Roadmap reorder: AI-led Story Studio with captions/stories/manual alt as controls

**Keywords:** roadmap, MVP, AI-led, AI Story Studio, proactive AI, freemium, paywall, trial
quota, voice, text input, speech, transcript, commands, multimodal AI, LLM stories, layouts,
captions, hidden captions, story notes, audio notes, image regions, manual alt text,
semantic search, LLM search, curation, duplicate photos, collage, slideshow, music, movie
export, blog, Family Travels, productized albums.

## Summary

We clarified that Albums Studio should be the productized version of the personal
Family Travels idea, but not a clone of the travel-map app. Family Travels remains a
reference product and possible future import source. Albums Studio must work for many
album types: weddings, client shoots, school events, portfolios, family albums, and trips.

The major product correction: Albums Studio should be AI-led through AI Story Studio. The
heart of the app is using images plus spoken/written owner context to create stories,
captions, blog sections, slideshow scripts, searchable memory, and accessible descriptions.
AI should proactively suggest what to do next, what context is missing, who the owner might
ask, and which captions/search clues/layouts could help. Captions, story notes, input
transcripts, and manual alt text are still core editor/control features. Voice is an input
method, not the brand; text input must work equally well for accessibility and preference.
AI output should be draft-first and owner-reviewed before it becomes published text.

## Decisions

- MVP starts with albums, upload, selectable layouts, captions/story notes/manual alt text,
  AI Story Studio drafts/suggestions, and share links.
- Captions and story notes may be visible or hidden/search-only.
- AI story generation and search can use captions and story notes as retrieval context,
  including LLM-assisted search for specific photos.
- The app should feel AI-led, not dashboard-led. Voice and text can add stories, search,
  generate drafts, and propose app actions.
- Captions/story notes/alt text create an incentive loop: better owner search and
  organization now, better accessibility for shared albums too.
- Blog and map are optional layouts, not the product center.
- Collages stay on the roadmap as a creative-output feature; they should be higher quality
  and more controllable than a basic auto-collage.
- Slideshow with music and later movie/video export are good future creative-output
  features, but should come after the album/gallery foundation.
- Supabase project was renamed in the dashboard to `albums-studio`; ref stayed
  `vsxbedlsnfmsbnlfayae` in `eu-central-1`.
- Photo curation still avoids unnecessary model calls: group near-duplicates and bursts,
  score blur and sharpness, and help the user choose the best one or two photos.
- Curation should assist decisions, not silently delete photos.
- Prefer free/local browser processing where deterministic tools solve the problem, but do
  not hide the fact that AI story/search is the product differentiator.
- Before paid APIs, evaluate free/open AI options such as browser/Python libraries,
  open-source models, and Hugging Face candidates for transcription, image curation,
  embeddings, and local search.
- Most AI-led features should sit behind paywall or BYOK, with only limited AI trials on the
  free tier so platform costs stay controlled.
- AI drafts/suggestions need a review flow and likely `ai_drafts`, `studio_interactions`,
  and `ai_suggestions` tables before implementation.
- Studio interactions need transcripts, optional audio storage, proposed actions, and
  confirmation before destructive or sharing actions.

## Next Step

Scaffold the app, wire Supabase auth, create a profile row on signup, and build the first
checkpoint: a signed-in user can see an empty library and create an album shell. After
upload/text foundation, the first AI checkpoint should capture typed or spoken context, show
a transcript, provide proactive suggestions, and generate a reviewable story draft from
selected photos and owner notes.
