import { useEffect, useState } from 'react'
import type { AlbumVisibility } from '../lib/albums'
import { albumShareToken, rotateShareToken, shareUrl } from '../lib/sharing'

type ShareAlbumProps = {
  albumId: string
  visibility: AlbumVisibility
  onChangeVisibility: (visibility: AlbumVisibility) => Promise<void>
}

export function ShareAlbum({ albumId, visibility, onChangeVisibility }: ShareAlbumProps) {
  const [token, setToken] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only fetched while the album is actually shared. A token is a credential;
  // there is no reason for one to be sitting in a private album's page.
  useEffect(() => {
    let active = true

    if (visibility !== 'link') {
      setToken(null)
      return
    }

    albumShareToken(albumId)
      .then((fetched) => {
        if (active) setToken(fetched)
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Could not read the link.')
        }
      })

    return () => {
      active = false
    }
  }, [albumId, visibility])

  async function run(action: () => Promise<void>, fallback: string) {
    setPending(true)
    setError(null)

    try {
      await action()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback)
      return false
    } finally {
      setPending(false)
    }
  }

  const url = token ? shareUrl(token) : ''

  return (
    <section className="album-controls" aria-labelledby="share-title">
      <h2 id="share-title">Sharing</h2>

      <fieldset className="visibility-choice">
        <legend>Who can open this album?</legend>
        <label className="visibility-option">
          <input
            type="radio"
            name="album-visibility"
            value="private"
            checked={visibility === 'private'}
            disabled={pending}
            onChange={() =>
              run(() => onChangeVisibility('private'), 'Could not stop sharing.')
            }
          />
          <span>
            Only me
            <em>Nobody else can open it, link or no link.</em>
          </span>
        </label>
        <label className="visibility-option">
          <input
            type="radio"
            name="album-visibility"
            value="link"
            checked={visibility === 'link'}
            disabled={pending}
            onChange={() => run(() => onChangeVisibility('link'), 'Could not start sharing.')}
          />
          <span>
            Anyone with the link
            {/* Deliberately does not say "captions": that word also labels a
                field on this page, and a loose locator matched both. */}
            <em>No account needed. They see only what you chose to publish.</em>
          </span>
        </label>
      </fieldset>

      {visibility === 'link' && (
        <div className="share-link">
          <label htmlFor="share-url">
            <span>The link</span>
            <input id="share-url" type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>

          <div className="story-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={!url}
              onClick={async () => {
                await navigator.clipboard?.writeText(url)
                setCopied(true)
              }}
            >
              Copy link
            </button>
            {copied && (
              <p className="form-message success" role="status">
                Copied.
              </p>
            )}
          </div>

          {confirmingRotate ? (
            <>
              <p className="field-hint">
                Every link you have already sent stops working. There is no way to withdraw
                one copy and keep another: the link is the key.
              </p>
              <div className="story-actions">
                <button
                  className="danger-button"
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    const done = await run(async () => {
                      setToken(await rotateShareToken(albumId))
                    }, 'Could not replace the link.')

                    if (done) {
                      setConfirmingRotate(false)
                      setCopied(false)
                    }
                  }}
                >
                  Replace the link
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmingRotate(false)}
                >
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <button
              className="text-button"
              type="button"
              onClick={() => setConfirmingRotate(true)}
            >
              Replace this link
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
