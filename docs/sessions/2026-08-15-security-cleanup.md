# Security and repository cleanup

**Keywords:** security, RLS, ownership, migrations, private Storage, signed URLs, AGENTS.md,
minimal schema.

We reviewed every repository file and compared the committed schema with the live Supabase
project. Two historical migrations were missing locally, user-editable profiles contained
server-controlled entitlement fields, and several relationships trusted duplicated
`owner_id` values without enforcing that parent and child owners matched.

The missing migration files were restored. A forward-only migration removed unused
biometric and named-sharing structures, enforced album/photo ownership with composite
constraints, narrowed Data API grants, moved the recursive RLS helper out of the exposed
schema, made timestamp triggers invoker-rights, and created profiles automatically on signup.
Storage is now private and the schema stores object paths instead of permanent public URLs.
Share tokens now live in a locked private table rather than API-visible album rows. Photo
paths are constrained to the owner's namespace, and authenticated clients receive only the
column-level insert and update privileges needed by the product.

Claude-specific instructions were replaced by a concise root `AGENTS.md`. The README and
docs index were shortened so the roadmap remains the single detailed product plan. Local
Supabase configuration was added so the migration history can be replayed with the CLI.

Next: scaffold authentication and the empty album-library checkpoint, using signed image
URLs from trusted server code when upload and sharing are implemented.
