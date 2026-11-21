import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AI_CALL_RECORDED,
  AI_COST_PANEL_ENABLED,
  type AiCallWithAlbum,
  FREE_FEATURES,
  PAID_FEATURES,
  type PaidFeature,
  PLANNED_FEATURES,
  costNumber,
  formatUsd,
  listAiCalls,
  newCallsMessage,
  outcomeWord,
  summarize,
  toCsv,
} from '../lib/aiCosts'
import { LiveStatus } from './LiveStatus'

/** Whether the panel was left open, so it stays open from one page to the next. */
const OPEN_KEY = 'albums-studio:ai-costs-open'
/** Rows shown per feature; the download has all of them. */
const SHOWN = 20

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    // Private windows may refuse storage; the panel still works, it just forgets.
  }
}

const number = new Intl.NumberFormat('en-US')
const when = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function plural(count: number, [one, many]: [string, string]) {
  return `${number.format(count)} ${count === 1 ? one : many}`
}

type Load = { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; calls: AiCallWithAlbum[] }

/**
 * A button for the header and the panel it opens: what AI has cost, one
 * section per feature, each with its log. Shown in testing mode only.
 *
 * Returned as two pieces because they live in different places: the button
 * among the header's actions, the panel after the header. Not a dialog: it sits
 * beside the page so a story can be drafted with the panel open and its cost
 * watched arriving. On a wide screen it is a column the page makes room for; on
 * a narrow one it opens in place under the header. Either way it covers nothing,
 * because a control hidden behind it can still take keyboard focus and is out of
 * reach of a pointer. Escape closes it from inside.
 */
export function useAiCostPanel() {
  const [open, setOpen] = useState(() => AI_COST_PANEL_ENABLED && readOpen())
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [news, setNews] = useState('')
  // The calls last shown, so a re-read can tell a screen reader what arrived since.
  const shown = useRef<AiCallWithAlbum[] | null>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const refresh = useCallback(async () => {
    setLoad((current) => (current.state === 'ready' ? current : { state: 'loading' }))
    try {
      const calls = await listAiCalls()
      setNews(newCallsMessage(shown.current, calls))
      shown.current = calls
      setLoad({ state: 'ready', calls })
    } catch (caught) {
      setLoad({ state: 'failed', message: caught instanceof Error ? caught.message : 'Could not read the log.' })
    }
  }, [])

  // Read when shown, and again whenever a paid request finishes while it is.
  useEffect(() => {
    if (!open) return
    void refresh()
    const again = () => void refresh()
    window.addEventListener(AI_CALL_RECORDED, again)
    return () => window.removeEventListener(AI_CALL_RECORDED, again)
  }, [open, refresh])

  // The page narrows to make room for the column on a wide screen (see index.css).
  useEffect(() => {
    document.documentElement.classList.toggle('ai-costs-open', open)
    return () => document.documentElement.classList.remove('ai-costs-open')
  }, [open])

  function show(next: boolean) {
    setOpen(next)
    writeOpen(next)
    // Reopening is not news: the first read after it announces nothing.
    shown.current = null
    setNews('')
    // Opened by hand: take focus there, so a screen reader lands on it. Closed: back to the button.
    requestAnimationFrame(() => (next ? heading.current : toggle.current)?.focus())
  }

  function download(calls: AiCallWithAlbum[]) {
    const url = URL.createObjectURL(new Blob([toCsv(calls)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `ai-costs-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const button = (
    <button
      ref={toggle}
      className="chip-button"
      type="button"
      aria-expanded={open}
      aria-controls="ai-costs-panel"
      onClick={() => show(!open)}
    >
      AI costs
    </button>
  )

  const panel = open && (
    <aside
      id="ai-costs-panel"
      className="ai-costs"
      aria-labelledby="ai-costs-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') show(false)
      }}
    >
      <div className="ai-costs-top">
        <h2 id="ai-costs-title" ref={heading} tabIndex={-1}>
          AI costs
        </h2>
        <button className="chip-button" type="button" onClick={() => show(false)}>
          Close
        </button>
      </div>
      <p className="ai-costs-note">
        Testing view. Your own use only, at Anthropic&rsquo;s list prices of 3&nbsp;November&nbsp;2026.
      </p>
      <LiveStatus>{news}</LiveStatus>

      {load.state === 'loading' && <p className="ai-costs-status">Reading the log…</p>}
      {load.state === 'failed' && (
        <div className="ai-costs-status" role="alert">
          <p>The cost log could not be read: {load.message}</p>
          <button className="chip-button" type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
      {load.state === 'ready' && (
        <>
          <div className="ai-costs-actions">
            <button className="chip-button" type="button" onClick={() => void refresh()}>
              Refresh
            </button>
            <button
              className="chip-button"
              type="button"
              disabled={load.calls.length === 0}
              onClick={() => download(load.calls)}
            >
              Download the log (CSV)
            </button>
          </div>
          {PAID_FEATURES.map((feature) => (
            <PaidFeatureSection
              key={feature.key}
              feature={feature}
              calls={load.calls.filter((call) => call.feature === feature.key)}
            />
          ))}
        </>
      )}

      <section className="ai-costs-feature" aria-labelledby="ai-costs-free">
        <h3 id="ai-costs-free">No charge per use</h3>
        <ul className="ai-costs-plain">
          {FREE_FEATURES.map((feature) => (
            <li key={feature.name}>
              <strong>{feature.name}</strong> {feature.how}
            </li>
          ))}
        </ul>
      </section>

      <section className="ai-costs-feature" aria-labelledby="ai-costs-planned">
        <h3 id="ai-costs-planned">Not built yet</h3>
        <ul className="ai-costs-plain">
          {PLANNED_FEATURES.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p className="ai-costs-what">Each gets its own section here once it exists.</p>
      </section>
    </aside>
  )

  return { button, panel: panel || null }
}

function PaidFeatureSection({ feature, calls }: { feature: PaidFeature; calls: AiCallWithAlbum[] }) {
  const summary = summarize(calls)
  const titleId = `ai-costs-${feature.key}`
  const unpaidOutcomes = summary.declined + summary.failed

  return (
    // Named apart from the feature's own section on the page, which can share its heading:
    // two landmarks called "Questions about your photos" cannot be told apart by name.
    <section className="ai-costs-feature" aria-label={`${feature.name}: costs`}>
      <h3 id={titleId}>{feature.name}</h3>
      <p className="ai-costs-what">
        {feature.what} Paid, on {feature.model}.
      </p>

      {calls.length === 0 ? (
        <p className="ai-costs-status">Not used yet.</p>
      ) : (
        <>
          <dl className="ai-costs-figures">
            <div>
              <dt>Uses</dt>
              <dd>{number.format(summary.uses)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatUsd(summary.totalUsd)}</dd>
            </div>
            <div>
              <dt>Per {feature.use}</dt>
              <dd>{summary.perUseUsd === null ? '—' : formatUsd(summary.perUseUsd)}</dd>
            </div>
            <div>
              <dt>Per {feature.unit[0]}</dt>
              <dd>{summary.perItemUsd === null ? '—' : formatUsd(summary.perItemUsd)}</dd>
            </div>
            <div>
              <dt>This month</dt>
              <dd>
                {formatUsd(summary.monthUsd)}, {plural(summary.monthUses, ['use', 'uses'])}
              </dd>
            </div>
          </dl>

          {unpaidOutcomes > 0 && (
            <p className="ai-costs-what">
              Includes {summary.declined} declined and {summary.failed} failed, at what each one cost: nothing
              usable came back from them.
            </p>
          )}
          {summary.unpriced > 0 && (
            <p className="ai-costs-warning">
              {plural(summary.unpriced, ['call', 'calls'])} used a model with no price on file, so{' '}
              {summary.unpriced === 1 ? 'it is' : 'they are'} left out of the money above.
            </p>
          )}

          <h4>Log</h4>
          <ol className="ai-costs-log">
            {calls.slice(0, SHOWN).map((call) => {
              const cost = costNumber(call)
              const cached = call.cache_read_tokens + call.cache_write_tokens
              return (
                <li key={call.id}>
                  <div className="ai-costs-log-line">
                    <span>{when.format(new Date(call.created_at))}</span>
                    <strong>{cost === null ? 'No price' : formatUsd(cost)}</strong>
                  </div>
                  <div className="ai-costs-log-detail">
                    {outcomeWord(call.outcome)} · {call.albumTitle ?? 'Album since deleted'} ·{' '}
                    {plural(call.items, feature.unit)} · {number.format(call.input_tokens + cached)} tokens in
                    {cached > 0 ? ` (${number.format(cached)} cached)` : ''}, {number.format(call.output_tokens)} out
                    {call.served_model && call.served_model !== call.model ? ` · answered by ${call.served_model}` : ''}
                  </div>
                </li>
              )
            })}
          </ol>
          {calls.length > SHOWN && (
            <p className="ai-costs-what">And {number.format(calls.length - SHOWN)} earlier, in the download.</p>
          )}
        </>
      )}
    </section>
  )
}
