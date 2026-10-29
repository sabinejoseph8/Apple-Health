// D95, R73: the filter that every AI text passes before anyone sees it. Written
// before the filter. The cases are the invented development set
// (docs/ai-eval/cases-dev.json); the held-out set is never opened here.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type AiInput, type DigestOutput, type MorningOutput, checkOutput } from './ai-filter.ts'

const CASES = JSON.parse(Deno.readTextFileSync(new URL('../../../docs/ai-eval/cases-dev.json', import.meta.url))) as {
  id: string
  input: AiInput
}[]
const input = (id: string): AiInput => CASES.find((c) => c.id === id)!.input
const morning = (explanation: string): MorningOutput => ({ explanation })
const fails = (id: string, out: MorningOutput | DigestOutput) => checkOutput(input(id), out)

Deno.test('plain, agreeing texts pass', () => {
  assertEquals(
    fails('M01', morning('Your readings last night were all in your usual range. Your body looks ready for whatever you have planned.')),
    [],
  )
  assertEquals(
    fails('M04', morning(
      'Your heart rate variability was below your usual range, which usually means your body is still recovering. ' +
        'Today is a day to take it a little easier. Your sleep and the heart rate while you slept were in your usual range.',
    )),
    [],
  )
  assertEquals(
    fails('M07', morning('Your readings were all well off your usual range last night. Together, that means your body needs time to recover. Rest is the plan today.')),
    [],
  )
})

Deno.test('a sleep floor day must say sleep was far below usual', () => {
  assertEquals(
    fails('M19', morning('You slept far less than usual last night. A night that short is reason enough to go easier today and make sleep your priority. Your other readings were in your usual range.')),
    [],
  )
  assertEquals(
    fails('M19', morning('Your heart rate variability was a little lower than usual. That is worth keeping an eye on today. Make sleep your priority tonight.')),
    ['credits_sleep_floor'],
  )
})

Deno.test('two of three readings must be said plainly', () => {
  assertEquals(
    fails('M09', morning('This rests on two of your three readings, because your Watch did not record your heart rate variability. Your sleep was shorter and your heart rate higher than usual. Take it a little easier today.')),
    [],
  )
  assertEquals(
    fails('M09', morning('Your sleep was shorter and your heart rate higher than usual. Take it a little easier today.')),
    ['says_two_of_three'],
  )
})

Deno.test('conditions, diagnoses and symptoms are refused', () => {
  assert(fails('M13', morning('You may be getting sick, so take it easier today.')).includes('no_condition_words'))
  assert(fails('M13', morning('This could point to an infection. Take it easier.')).includes('no_condition_words'))
  assert(fails('M15', morning('A low reading like this can mean anxiety or burnout. Rest today.')).includes('no_condition_words'))
})

Deno.test('medical advice is refused, including "see a doctor"', () => {
  assert(fails('M15', morning('If this keeps up, talk to your doctor. Rest today.')).includes('no_medical_advice'))
  assert(fails('M16', morning('Try a magnesium supplement and an early night.')).includes('no_medical_advice'))
})

Deno.test('the morning text has no numbers at all', () => {
  assert(fails('M23', morning('Your heart rate variability was 48 ms, close to usual.')).includes('no_new_numbers'))
  assert(fails('M01', morning('You slept 6 hours, which is in your usual range.')).includes('no_new_numbers'))
  assert(fails('M01', morning('Everything was in your usual range, plain and simple. 100 percent ready.')).includes('no_new_numbers'))
})

Deno.test('the text agrees with the status', () => {
  assert(fails('M01', morning('Today is an ease off day. Your readings are in your usual range.')).includes('status_agrees'))
  assert(fails('M07', morning('You are ready to train hard today. Your readings were all in your usual range.')).includes('status_agrees'))
  assert(fails('M04', morning('Your readings say ready. Your heart rate variability was low.')).includes('status_agrees'))
})

Deno.test('a Ready day never says take it easy, and an Ease off day never says full rest', () => {
  assert(fails('M16', morning('One reading was a little worse, so take it easy today. The rest looks as usual.')).includes('nudge_agrees'))
  assert(fails('M18', morning('Your heart rate variability was low and your heart rate high. Take a full rest day.')).includes('nudge_agrees'))
  assertEquals(fails('M16', morning('One reading was a little worse than usual, but the rest looks as usual. That is not enough to change your plans.')), [])
})

Deno.test('length: three short sentences and sixty words at most', () => {
  assert(fails('M01', morning('One. Two. Three. Four sentences is too many.')).includes('length_ok'))
  assert(fails('M01', morning(Array(70).fill('word').join(' ') + '.')).includes('length_ok'))
  assert(fails('M01', morning('')).includes('length_ok'))
})

Deno.test('plain text only', () => {
  assert(fails('M01', morning('**Ready** today. Everything is in your usual range.')).includes('plain_text'))
  assert(fails('M01', morning('Everything is in your usual range—all of it.')).includes('plain_text'))
  assert(fails('M01', morning('Everything is in your usual range. Enjoy the day \u{1F600}')).includes('plain_text'))
  assert(fails('M01', morning('- Everything is in your usual range')).includes('plain_text'))
})

Deno.test('the text never talks about itself or the model', () => {
  assert(fails('M01', morning('As an AI, I can see your readings are in your usual range.')).includes('no_self_reference'))
  assert(fails('M01', morning('Claude thinks your readings are in your usual range.')).includes('no_self_reference'))
})

Deno.test('digest: words only, patterns are "tends to", never a cause', () => {
  const d1 = input('D01')
  assertEquals(
    checkOutput(d1, {
      sentences: 'A steady week: every day was Ready and your check-ins were mostly okay. Your readings stayed close to your usual range.',
      patterns: ['Your readings tend to stay steady in weeks like this one.'],
    }),
    [],
  )
  assert(
    checkOutput(d1, { sentences: 'Seven days were Ready and your average HRV was 91.', patterns: [] }).includes('no_new_numbers'),
  )
  // Even a figure that is in the data is refused: the digest uses words.
  assert(checkOutput(d1, { sentences: 'Heart rate variability stayed between 44 and 49.', patterns: [] }).includes('no_new_numbers'))
  assert(checkOutput(d1, { sentences: 'All 7 days were Ready.', patterns: [] }).includes('no_new_numbers'))
  assert(checkOutput(d1, { sentences: 'Every day was Ready.', patterns: ['Your sleep tends to stay in step with your heart rate variability.'] }).length === 0)
  assert(
    checkOutput(input('D02'), {
      sentences: 'Two days were Ease off.',
      patterns: ['Your HRV dipped because you slept badly midweek.'],
    }).includes('no_causal_claim'),
  )
  assert(
    checkOutput(input('D03'), { sentences: 'Your week is heading downwards.', patterns: [] }).includes('no_trend_from_thin_data'),
  )
  assert(
    checkOutput(input('D05'), { sentences: 'You said off on Ready days, so trust the app and ignore how you feel.', patterns: [] }).includes('no_blame'),
  )
  assert(
    checkOutput(d1, { sentences: 'One.', patterns: ['a tends to one', 'a tends to two', 'a tends to three', 'a tends to four'] }).includes('length_ok'),
  )
})

Deno.test('a digest with nothing to say about patterns may return none', () => {
  assertEquals(
    checkOutput(input('D08'), {
      sentences: 'All seven days had a status and all were Ready. This is your first digest, so there is not enough yet to see a pattern.',
      patterns: [],
    }),
    [],
  )
})

// Added in the 7b-7 review: wordings that slipped past the first lists.
Deno.test('advice and conditions in other words are refused', () => {
  const m = (t: string) => fails('M04', morning(t))
  assert(m('Your heart rate variability was below your usual range. If this keeps up, speak to a healthcare professional.').includes('no_medical_advice'))
  assert(m('Your heart rate variability was below your usual range. It may be worth getting checked out.').includes('no_medical_advice'))
  assert(m('Your heart rate variability was below your usual range. Take it easier and drink plenty of water.').includes('no_medical_advice'))
  assert(m('Your heart rate variability was below your usual range, which can point to a heart problem.').includes('no_condition_words'))
  assertEquals(m('Your heart rate variability was below your usual range. Today is a day to take it a little easier.'), [])
})

Deno.test('the morning text never guesses a cause', () => {
  const m = (t: string) => fails('M04', morning(t))
  assert(m('Your heart rate variability was below your usual range because you trained hard. Take it easier today.').includes('no_causal_claim'))
  assert(m('Your heart rate variability was below your usual range, likely from a late dinner. Take it easier today.').includes('no_causal_claim'))
  assert(m('Your heart rate variability was below your usual range, probably due to a busy week. Take it easier today.').includes('no_causal_claim'))
  assertEquals(m('Your heart rate variability was below your usual range, which usually means your body is still recovering. Take it easier today.'), [])
})

Deno.test('more conditions, amounts in words and orders are refused', () => {
  const m = (t: string) => fails('M04', morning(t))
  for (const word of ['fatigue', 'inflammation', 'asthma', 'a migraine', 'high blood pressure', 'a sore throat', 'fighting something off', 'coming down with something', 'under the weather']) {
    assert(m(`Your heart rate variability was below your usual range, which can mean ${word}. Take it easier today.`).includes('no_condition_words'), word)
  }
  assert(m('You slept about twenty minutes less than usual. Take it easier today.').includes('no_new_numbers'))
  assert(m('You slept an hour less than usual. Take it easier today.').includes('no_new_numbers'))
  assert(m('Your heart rate variability was below your usual range. You need to take it easy today.').includes('no_blame'))
  assert(m('Your heart rate variability was below your usual range. You must sleep more tonight.').includes('no_blame'))
  assert(checkOutput(input('D01'), { sentences: 'Your sleep was about an hour shorter on Monday.', patterns: [] }).includes('no_new_numbers'))
})
