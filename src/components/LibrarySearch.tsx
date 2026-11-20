import './LibrarySearch.css'
import { type FormEvent, useState } from 'react'
import {
  FIELD_LABELS,
  MIN_QUERY_LENGTH,
  type SearchResult,
  searchLibrary,
  searchTerms,
  snippet,
} from '../lib/search'
import { LiveStatus } from './LiveStatus'

type LibrarySearchProps = {
  /** Opens a photo in its album, or the album itself when photoId is null. */
  onOpen: (albumSlug: string, photoId: string | null) => void
  /** Injected for tests; the real thing queries the database. */
  search?: typeof searchLibrary
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching'; query: string }
  | { status: 'done'; query: string; results: SearchResult[]; thumbnails: Map<string, string> }
  | { status: 'failed'; query: string; message: string }

/**
 * Searched on submit rather than on every keystroke: each search is a round trip
 * and a phone keyboard types a word one letter at a time. A failed search says
 * so, in words different from an empty one, so "nothing matched" can never stand
 * in for "the search did not run".
 */
export function LibrarySearch({ onOpen, search = searchLibrary }: LibrarySearchProps) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const [hint, setHint] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const typed = query.trim()

    if (typed.length < MIN_QUERY_LENGTH) {
      setHint(`Type at least ${MIN_QUERY_LENGTH} letters.`)
      return
    }

    setHint(null)
    setState({ status: 'searching', query: typed })

    try {
      const { results, thumbnails } = await search(typed)
      setState({ status: 'done', query: typed, results, thumbnails })
    } catch (caught) {
      setState({
        status: 'failed',
        query: typed,
        message: caught instanceof Error ? caught.message : 'unknown error',
      })
    }
  }

  function clear() {
    setQuery('')
    setHint(null)
    setState({ status: 'idle' })
  }

  const terms = state.status === 'done' ? searchTerms(state.query) : []

  return (
    // No heading of its own: the label names it, and the form is a search
    // landmark. A heading here also cost a line of the phone's first screen.
    <div className="library-search">
      <form className="library-search-form" role="search" onSubmit={handleSubmit}>
        <label htmlFor="library-search-input">
          <span>Search your words</span>
          <input
            id="library-search-input"
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={200}
            placeholder="A name, a place, a memory"
            aria-describedby="library-search-help"
            enterKeyHint="search"
          />
        </label>
        <button
          className="primary-button"
          type="submit"
          disabled={state.status === 'searching'}
        >
          Search
        </button>
      </form>
      {/* Read with the field by screen readers on every screen; shown only where
          there is room for it, since on a phone it pushed the albums down. */}
      <p className="album-note library-search-help" id="library-search-help">
        Finds captions, story notes, alt text and album text, including what only you can see.
      </p>

      <LiveStatus>
        {hint && <p className="form-message">{hint}</p>}
        {state.status === 'searching' && <p className="search-count">Searching…</p>}
        {state.status === 'done' && (
          <p className="search-count">
            {state.results.length === 0
              ? `Nothing you have written matches “${state.query}”.`
              : `${state.results.length === 1 ? '1 result' : `${state.results.length} results`} for “${state.query}”.`}
          </p>
        )}
      </LiveStatus>

      {state.status === 'failed' && (
        <p className="form-message error" role="alert">
          The search did not run: {state.message}
        </p>
      )}

      {state.status === 'done' && state.results.length > 0 && (
        <ul className="search-results" aria-label={`Results for ${state.query}`}>
          {state.results.map((result) => {
            const picture = result.thumbnailPath
              ? state.thumbnails.get(result.thumbnailPath)
              : undefined

            return (
              <li key={result.key}>
                <button
                  className="search-result"
                  type="button"
                  onClick={() => onOpen(result.albumSlug, result.photoId)}
                >
                  {picture ? (
                    <img className="search-thumb" src={picture} alt="" loading="lazy" />
                  ) : (
                    <span className="search-thumb empty" aria-hidden="true" />
                  )}
                  <span className="search-text">
                    <span className="search-album">
                      {result.photoId ? `Photo in ${result.albumTitle}` : `Album: ${result.albumTitle}`}
                    </span>
                    {result.matches.map((match) => (
                      <span className="search-match" key={match.field + match.text}>
                        <span className="search-field">{FIELD_LABELS[match.field]}: </span>
                        {/* Isolated, so a Hebrew note takes its own direction
                            rather than the page's. */}
                        <bdi>
                          {snippet(match.text, terms).map((part, index) =>
                            part.hit ? <mark key={index}>{part.text}</mark> : part.text,
                          )}
                        </bdi>
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {state.status !== 'idle' && (
        <button className="text-button" type="button" onClick={clear}>
          Clear search
        </button>
      )}
    </div>
  )
}
