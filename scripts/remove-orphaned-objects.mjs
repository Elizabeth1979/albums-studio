/**
 * Removes stored bytes that no photo row references.
 *
 * Storage holds no foreign keys to the database, so the two can disagree: a tab
 * closed mid-delete, or a request that fails after the rows are already gone,
 * leaves objects behind that no owner can see and no query will ever join to.
 * supabase/checks/orphaned_objects.sql finds them; this removes them.
 *
 * It goes through the Storage API rather than deleting from storage.objects,
 * because that table is an index over an S3 bucket. Deleting its rows would
 * leave the bytes in place, still stored and still paid for, and would take
 * away the only handle anything has on them.
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/remove-orphaned-objects.mjs
 *
 * Prints what it found and stops. Add --delete to actually remove them. The
 * secret key bypasses RLS and can see every owner's photographs, so it belongs
 * in a shell that is about to run this and nowhere else — never in .env.local
 * beside the publishable key, and never in anything the browser loads.
 */
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'photos'

// An object younger than this may belong to an upload still in flight, whose
// row has not been written yet. Deleting that would break a live photograph.
const MIN_AGE_MINUTES = 60

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.')
  process.exit(1)
}

const deleting = process.argv.includes('--delete')
const supabase = createClient(url, key, { auth: { persistSession: false } })

/** Walks the bucket, which lists one directory at a time. */
async function everyObject(prefix = '') {
  const found = []
  const pageSize = 100

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: pageSize, offset })

    if (error) throw new Error(`Listing ${prefix || '/'}: ${error.message}`)
    if (!data.length) break

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // A folder comes back as an entry with no id of its own.
      if (entry.id === null) found.push(...(await everyObject(path)))
      else found.push({ path, size: entry.metadata?.size ?? 0, createdAt: entry.created_at })
    }

    if (data.length < pageSize) break
  }

  return found
}

/** Every path the database still points at, across all owners. */
async function referencedPaths() {
  const paths = new Set()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('photos')
      .select('storage_path, thumbnail_path')
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Reading photos: ${error.message}`)

    for (const row of data) {
      paths.add(row.storage_path)
      if (row.thumbnail_path) paths.add(row.thumbnail_path)
    }

    if (data.length < pageSize) break
  }

  return paths
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// The rows are read first. Reading them after the listing would open a window
// in which a photo uploaded in between looks like an orphan.
const referenced = await referencedPaths()
const objects = await everyObject()

const cutoff = Date.now() - MIN_AGE_MINUTES * 60 * 1000
const orphaned = objects.filter((object) => !referenced.has(object.path))
const tooYoung = orphaned.filter((object) => new Date(object.createdAt).getTime() > cutoff)
const removable = orphaned.filter((object) => new Date(object.createdAt).getTime() <= cutoff)

console.log(`${objects.length} objects in ${BUCKET}, ${referenced.size} referenced by a photo row.`)

if (tooYoung.length) {
  console.log(
    `\nLeaving ${tooYoung.length} alone: newer than ${MIN_AGE_MINUTES} minutes, so an upload may still be in flight.`,
  )
}

if (!removable.length) {
  console.log('\nNothing to remove.')
  process.exit(0)
}

console.log(`\n${removable.length} orphaned, ${megabytes(removable.reduce((sum, o) => sum + o.size, 0))}:`)
for (const object of removable) console.log(`  ${object.path}  (${megabytes(object.size)})`)

if (!deleting) {
  console.log('\nNothing was deleted. Re-run with --delete to remove these.')
  process.exit(0)
}

// Storage caps how many paths one call may carry.
for (let start = 0; start < removable.length; start += 100) {
  const batch = removable.slice(start, start + 100).map((object) => object.path)
  const { error } = await supabase.storage.from(BUCKET).remove(batch)
  if (error) throw new Error(`Removing objects: ${error.message}`)
}

console.log(`\nRemoved ${removable.length}.`)
