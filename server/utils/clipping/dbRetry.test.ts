import test from 'node:test'
import assert from 'node:assert/strict'
import { isTransientDbError, retrying, withDbRetry } from './dbRetry.ts'

const transient = () => Object.assign(new Error("Can't reach database server at `db:5432`"), { code: 'P1001' })

test('only connection errors are considered transient', () => {
  assert.equal(isTransientDbError(transient()), true)
  assert.equal(isTransientDbError(Object.assign(new Error('x'), { code: 'P1017' })), true)
  assert.equal(isTransientDbError(new Error('Server has closed the connection.')), true)
  assert.equal(isTransientDbError(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })), false)
  assert.equal(isTransientDbError(new Error('boom')), false)
  assert.equal(isTransientDbError(null), false)
})

test('withDbRetry retries with growing delays and returns the first success', async () => {
  const delays: number[] = []
  let calls = 0
  const value = await withDbRetry(async () => {
    if (++calls < 3) throw transient()
    return 'ok'
  }, { sleep: async ms => { delays.push(ms) } })
  assert.equal(value, 'ok')
  assert.equal(calls, 3)
  assert.deepEqual(delays, [1000, 3000])
})

test('withDbRetry gives up after the last attempt and never replays a refused write', async () => {
  let calls = 0
  await assert.rejects(withDbRetry(async () => { calls++; throw transient() }, { sleep: async () => {} }), /Can't reach/)
  assert.equal(calls, 4)

  let writes = 0
  await assert.rejects(withDbRetry(async () => { writes++; throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }) }, { sleep: async () => {} }), /Unique/)
  assert.equal(writes, 1)
})

test('retrying wraps every async method of a store and keeps `this`', async () => {
  let failures = 1
  const store = {
    name: 'store',
    async find(id: string) {
      if (failures-- > 0) throw transient()
      return `${this.name}:${id}`
    }
  }
  const retries: number[] = []
  const wrapped = retrying(store, { sleep: async () => {}, onRetry: (_e, attempt) => { retries.push(attempt) } })
  assert.equal(await wrapped.find('42'), 'store:42')
  assert.deepEqual(retries, [1])
  assert.equal(wrapped.name, 'store')
})
