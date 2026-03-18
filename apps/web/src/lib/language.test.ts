import { describe, expect, it } from 'vitest'
import { convertDetectedLanguage } from './language'

describe('convertDetectedLanguage', () => {
  it('passes through stored "tw" value as tw', () => {
    // Given the user previously saved 'tw' to localStorage (i18next reads it back as-is)
    // When convertDetectedLanguage processes that stored value
    // Then it must return 'tw' — not fall through to 'en'
    expect(convertDetectedLanguage('tw')).toBe('tw')
  })

  it('passes through stored "en" value as en', () => {
    expect(convertDetectedLanguage('en')).toBe('en')
  })

  it('converts zh-TW navigator language to tw', () => {
    expect(convertDetectedLanguage('zh-TW')).toBe('tw')
  })

  it('converts zh-CN navigator language to tw', () => {
    expect(convertDetectedLanguage('zh-CN')).toBe('tw')
  })

  it('converts unrecognised navigator language to en', () => {
    expect(convertDetectedLanguage('fr-FR')).toBe('en')
    expect(convertDetectedLanguage('ja')).toBe('en')
  })
})
