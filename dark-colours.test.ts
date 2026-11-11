import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Dark mode (D111, R76): the dark colour set in src/styles.css must keep the same names as the light set
// and meet the same contrast rules (docs/design.md, section 2): text 4.5 to 1, chart lines and the
// orange dot 3 to 1.
const css = readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8')

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]))
}

// Every colour token must be one this test can read: a six-digit lower-case hex. A short hex or an
// rgb() value would otherwise drop out of both sets without a word.
function unreadable(block: string): string[] {
  return [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]+|rgba?\([^)]*\)|hsla?\([^)]*\));/g)]
    .filter((m) => !/^#[0-9a-f]{6}$/.test(m[2]))
    .map((m) => `${m[1]}: ${m[2]}`)
}

const light = tokens(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-reduced-motion')))
const dark = tokens(css.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}\n/)?.[1] ?? '')

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background, needed ratio]
const PAIRS: [string, string, number][] = [
  ['text', 'surface', 4.5],
  ['text', 'bg', 4.5],
  ['text-secondary', 'surface', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'bg', 4.5],
  ['link-blue', 'surface', 4.5],
  ['link-blue', 'bg', 4.5],
  ['on-primary', 'primary', 4.5],
  ['button-blue', 'button-tint', 4.5],
  ['ease-text', 'ease-pill', 4.5],
  ['ease-text', 'ease-tint', 4.5],
  ['ease-text', 'surface', 4.5],
  ['ready-text', 'ready-pill', 4.5],
  ['rest-text', 'rest-pill', 4.5],
  ['neutral-text', 'neutral-pill', 4.5],
  ['normal-green', 'surface', 4.5],
  ['hrv', 'surface', 4.5],
  ['sleep', 'surface', 4.5],
  ['sleeping-hr', 'surface', 4.5],
  ['hrv', 'hrv-band', 3],
  ['sleep', 'sleep-band', 3],
  ['sleeping-hr', 'sleeping-hr-band', 3],
  ['attention', 'surface', 3],
]

describe('dark colours', () => {
  it('read both sets from the stylesheet', () => {
    expect(Object.keys(light).length).toBeGreaterThan(30)
    expect(Object.keys(dark).length).toBeGreaterThan(30)
  })

  it('holds only colours this test can read', () => {
    const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-reduced-motion'))
    const darkBlock = css.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}\n/)?.[1] ?? ''
    expect(unreadable(lightBlock)).toEqual([])
    expect(unreadable(darkBlock)).toEqual([])
  })

  it('give every light colour a dark partner of the same name', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
  })

  it('make the dark values differ from the light ones for the page, cards and text', () => {
    for (const name of ['bg', 'surface', 'text', 'text-secondary', 'separator']) expect(dark[name]).not.toBe(light[name])
  })

  for (const [set, name] of [[light, 'light'], [dark, 'dark']] as const) {
    describe(`${name} contrast`, () => {
      for (const [fg, bg, needed] of PAIRS) {
        it(`${fg} on ${bg} is at least ${needed} to 1`, () => {
          expect(contrast(set[fg], set[bg])).toBeGreaterThanOrEqual(needed)
        })
      }
    })
  }
})
