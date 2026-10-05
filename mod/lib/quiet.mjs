// baton v7 quiet output: a long shell result cut to what an agent needs. Pure.
//
// talos's lesson (#198, "quiet output"): most of a long log is noise the agent pays
// for. Keep the head, the lines that look like failures, and the tail; the whole
// output is saved to a file whose path ends the result.

const FAILISH = /(error|fail(ed|ure)?|panic|exception|traceback|assert|✗|✘|FAIL|ERR!|denied|not found|undefined|cannot|warning:)/i

export function quietText(text, maxLines, savedTo) {
  const lines = String(text).split('\n')
  if (!maxLines || lines.length <= maxLines) return null
  const head = lines.slice(0, 40)
  const tail = lines.slice(-40)
  const mid = lines.slice(40, -40)
  const hits = []
  mid.forEach((l, i) => {
    if (FAILISH.test(l) && hits.length < 80) hits.push(String(i + 41).padStart(6) + '| ' + l)
  })
  return [
    ...head,
    '',
    '── baton: ' + lines.length + ' lines; ' + (lines.length - 80) + ' in the middle omitted' + (hits.length ? ', ' + hits.length + ' of them look like failures:' : ', none of them look like failures.'),
    ...hits,
    '── the last 40 lines:',
    ...tail,
    '',
    '── the whole output: ' + savedTo + ' (read it, or grep it, if you need more)',
  ].join('\n')
}

