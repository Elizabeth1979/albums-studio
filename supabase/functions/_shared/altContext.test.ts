import { describe, expect, it } from 'vitest'
import { ALT_DRAFTS_PER_MONTH, altContext } from './altContext'

const album = { title: 'Summer at the lake', description: 'A week with the cousins' }

describe('altContext', () => {
  it('passes on what a visitor can already read', () => {
    const text = altContext({
      album,
      photo: { caption: 'Mia and Leo on the jetty', captionVisibility: 'visible' },
      stories: [{ body: 'The water was freezing', visibility: 'visible' }],
    })

    expect(text).toContain('Summer at the lake')
    expect(text).toContain('A week with the cousins')
    expect(text).toContain('Mia and Leo on the jetty')
    expect(text).toContain('The water was freezing')
  })

  // Alt text is always given to visitors, so anything the owner kept private
  // must never reach the model that writes it: a name in a hidden caption would
  // come back out in a description nobody thought to check for it.
  it('never passes on a hidden caption or a private note', () => {
    const text = altContext({
      album,
      photo: { caption: 'Our house on Elm Street', captionVisibility: 'hidden' },
      stories: [
        { body: 'Grandad, two weeks before the hospital', visibility: 'hidden' },
        { body: 'Leo caught his first fish', visibility: 'visible' },
      ],
    })

    expect(text).not.toContain('Elm Street')
    expect(text).not.toContain('Grandad')
    expect(text).not.toContain('hospital')
    expect(text).toContain('Leo caught his first fish')
  })

  it('tells the model a visible caption will be heard too, so it is not repeated', () => {
    const text = altContext({
      album,
      photo: { caption: 'Mia and Leo on the jetty', captionVisibility: 'visible' },
      stories: [],
    })

    expect(text).toMatch(/also hear/i)
  })

  it('says nothing about a caption when there is none a visitor would see', () => {
    const text = altContext({
      album: { title: 'Lake', description: null },
      photo: { caption: null, captionVisibility: 'visible' },
      stories: [],
    })

    expect(text).not.toMatch(/caption/i)
    expect(text).toBe('Album: Lake')
  })

  it('allows a month of descriptions that covers an ordinary album', () => {
    expect(ALT_DRAFTS_PER_MONTH).toBe(50)
  })
})
