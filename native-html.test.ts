import { describe, expect, it } from 'vitest'
import { stripCrossorigin } from './native-html'

describe('stripCrossorigin', () => {
  it('takes crossorigin off the script and stylesheet tags Vite writes (D115)', () => {
    const html = [
      '<script type="module" crossorigin src="/assets/index-abc.js"></script>',
      '<link rel="stylesheet" crossorigin href="/assets/index-def.css">',
      '<link rel="modulepreload" crossorigin="anonymous" href="/assets/chunk.js">',
    ].join('\n')
    expect(stripCrossorigin(html)).toBe(
      [
        '<script type="module" src="/assets/index-abc.js"></script>',
        '<link rel="stylesheet" href="/assets/index-def.css">',
        '<link rel="modulepreload" href="/assets/chunk.js">',
      ].join('\n'),
    )
  })

  it('leaves every other tag and attribute alone', () => {
    const html = '<link rel="manifest" href="/manifest.webmanifest" />\n<meta name="theme-color" content="#F2F2F7" />\n<p>crossorigin is a word here</p>'
    expect(stripCrossorigin(html)).toBe(html)
  })
})
