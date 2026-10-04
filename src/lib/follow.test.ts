import { describe, expect, it } from 'vitest'
import { askTonight, askYesterday, type FollowDay, followDays } from './follow'

const at = (h: number, m: number) => new Date(2026, 8, 29, h, m)
const easy: FollowDay = { date: '2026-09-29', nudge: 'train_easy', answer: null }

describe('when the app asks about the nudge', () => {
  it('asks from 8pm on a change day, never before (R52)', () => {
    expect(askTonight(at(19, 59), easy)).toBe(false)
    expect(askTonight(at(20, 0), easy)).toBe(true)
    expect(askTonight(at(23, 30), easy)).toBe(true)
    expect(askTonight(at(21, 0), null)).toBe(false)
  })

  it('asks about yesterday the next morning until noon, if unanswered (R55, D67)', () => {
    expect(askYesterday(at(7, 0), easy)).toBe(true)
    expect(askYesterday(at(11, 59), easy)).toBe(true)
    expect(askYesterday(at(12, 0), easy)).toBe(false)
    expect(askYesterday(at(7, 0), { ...easy, answer: 'yes' })).toBe(false)
    expect(askYesterday(at(7, 0), null)).toBe(false)
  })
})

describe('which days were change days', () => {
  it('uses the first nudge shown each day (D61), never a train-as-planned day', () => {
    const days = followDays(
      [
        { date: '2026-09-28', nudge: 'train_as_planned', shown_at: '2026-09-28T11:44:00Z' },
        { date: '2026-09-29', nudge: 'rest', shown_at: '2026-09-29T11:50:00Z' },
        { date: '2026-09-29', nudge: 'train_easy', shown_at: '2026-09-29T11:44:00Z' },
        { date: '2026-09-30', nudge: 'train_as_planned', shown_at: '2026-09-30T11:40:00Z' },
        { date: '2026-09-30', nudge: 'rest', shown_at: '2026-09-30T13:00:00Z' },
      ],
      [],
    )
    expect([...days.keys()]).toEqual(['2026-09-29'])
    expect(days.get('2026-09-29')?.nudge).toBe('train_easy')
  })

  it("gives each day's latest answer (R54)", () => {
    const days = followDays(
      [{ date: '2026-09-29', nudge: 'train_easy', shown_at: '2026-09-29T11:44:00Z' }],
      [
        { date: '2026-09-29', answer: 'yes', answered_at: '2026-09-30T01:05:00Z' },
        { date: '2026-09-29', answer: 'no', answered_at: '2026-09-30T01:07:00Z' },
      ],
    )
    expect(days.get('2026-09-29')?.answer).toBe('no')
  })
})
