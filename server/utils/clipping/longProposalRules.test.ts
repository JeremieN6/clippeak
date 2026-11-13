import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultTitle, proposalState, proposalView, rangeProblem } from './longProposalRules.ts'
import { formatClock } from './longExtract.ts'
import type { ProposalRow } from './longProposalRules.ts'

const row = (patch: Partial<ProposalRow> = {}): ProposalRow => ({
  id: 'p1', origin: 'manual', status: 'proposed', title: 'Mon avis', theme: null, why: 'Passage ajouté à la main.', score: null,
  startSec: 4990, endSec: 5452, createdAt: new Date('2026-11-13T10:00:00Z'),
  vod: { id: 'v1', twitchVodId: '999', title: 'Live du soir', startedAt: new Date('2026-11-12T18:00:00Z'), createdAt: new Date('2026-11-12T18:01:00Z') },
  clipJob: null, ...patch
})

test('proposalState: proposed, ignored, preparing, dans « A valider », and gone once approved, refused or failed', () => {
  assert.equal(proposalState(row()), 'proposed')
  assert.equal(proposalState(row({ status: 'ignored' })), 'ignored')
  assert.equal(proposalState(row({ status: 'prepared', clipJob: { status: 'queued' } })), 'preparing')
  assert.equal(proposalState(row({ status: 'prepared', clipJob: { status: 'rendering' } })), 'preparing')
  assert.equal(proposalState(row({ status: 'prepared', clipJob: { status: 'review' } })), 'validate')
  for (const status of ['approved', 'rejected', 'failed']) assert.equal(proposalState(row({ status: 'prepared', clipJob: { status } })), null)
  assert.equal(proposalState(row({ status: 'prepared', clipJob: null })), null)
})

test('proposalView: gives the streamer what the card shows, and nothing for a proposal that became a video', () => {
  const view = proposalView(row())!
  assert.equal(view.durationSec, 462)
  assert.deepEqual([view.state, view.origin, view.vod.twitchVodId, view.score], ['proposed', 'manual', '999', null])
  assert.equal(view.progress, null)
  assert.equal(proposalView(row({ status: 'prepared', clipJob: { status: 'rendering', progress: 42 } }))!.progress, 42)
  assert.equal(proposalView(row({ status: 'prepared', clipJob: { status: 'review', progress: 100 } }))!.progress, null)
  assert.equal(proposalView(row({ status: 'prepared', clipJob: { status: 'approved' } })), null)
  // Live sans date de debut : la date de creation sert de repli.
  const noStart = proposalView(row({ vod: { id: 'v1', twitchVodId: '9', title: null, startedAt: null, createdAt: new Date('2026-11-12T18:01:00Z') } }))!
  assert.equal(new Date(noStart.vod.startedAt).toISOString(), '2026-11-12T18:01:00.000Z')
})

test('rangeProblem: uses the live length when known, ignores it otherwise', () => {
  const vod = { startedAt: new Date('2026-11-12T18:00:00Z'), endedAt: new Date('2026-11-12T19:00:00Z') }
  assert.equal(rangeProblem(vod, 600, 100, 400), null)
  assert.match(rangeProblem(vod, 600, 3700, 3900)!, /dépasse la fin du live/)
  assert.equal(rangeProblem({ startedAt: null, endedAt: null }, 600, 3700, 3900), null)
  assert.match(rangeProblem(vod, 600, 100, 250)!, /au moins 3 minutes/)
})

test('defaultTitle and formatClock: title of at most 100 characters, clock with hours for live positions', () => {
  assert.equal(defaultTitle('Live du soir', 4990), 'Live du soir (1:23:10)')
  assert.equal(defaultTitle(null, 90), 'Extrait de live (1:30)')
  assert.ok(defaultTitle('x'.repeat(300), 5).length <= 100)
  assert.equal(formatClock(462), '7:42')
  assert.equal(formatClock(462, true), '0:07:42')
  assert.equal(formatClock(4990, true), '1:23:10')
})
