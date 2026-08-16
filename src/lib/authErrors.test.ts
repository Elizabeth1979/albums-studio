import { describe, expect, it } from 'vitest'
import { describeAuthError } from './authErrors'

describe('describeAuthError', () => {
  it('explains an email rate limit and repeats the wait', () => {
    expect(
      describeAuthError(
        {
          message: 'For security purposes, you can only request this after 53 seconds.',
          code: 'over_email_send_rate_limit',
          status: 429,
        },
        'fallback',
      ),
    ).toBe('Too many sign-in emails at once. You can ask for another in about 53 seconds.')
  })

  it('explains a rate limit that names no wait', () => {
    expect(
      describeAuthError({ message: 'Email rate limit exceeded', status: 429 }, 'fallback'),
    ).toBe('Too many sign-in emails at once. Wait a minute, then try again.')
  })

  it('recognises the limit from the code alone', () => {
    expect(
      describeAuthError(
        { message: 'Email rate limit exceeded', code: 'over_email_send_rate_limit' },
        'fallback',
      ),
    ).toBe('Too many sign-in emails at once. Wait a minute, then try again.')
  })

  it('leaves an unrelated failure in its own words', () => {
    expect(
      describeAuthError(
        { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 },
        'fallback',
      ),
    ).toBe('Invalid login credentials')
  })

  it('reads a plain Error', () => {
    expect(describeAuthError(new Error('Network unreachable'), 'fallback')).toBe(
      'Network unreachable',
    )
  })

  it('falls back for anything that carries no message', () => {
    expect(describeAuthError(null, 'fallback')).toBe('fallback')
    expect(describeAuthError('nope', 'fallback')).toBe('fallback')
    expect(describeAuthError({ message: '' }, 'fallback')).toBe('fallback')
  })
})
