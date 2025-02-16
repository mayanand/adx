import test from 'ava'

import * as ucan from 'ucans'

import * as auth from '../src/auth/index.js'
import Repo from '../src/repo/index.js'
import IpldStore from '../src/blockstore/ipld-store.js'

import * as util from './_util.js'

type Context = {
  ipldAlice: IpldStore
  keypairAlice: ucan.EdKeypair
  repoAlice: Repo
  ipldBob: IpldStore
  tokenBob: ucan.Chained
  namespaceId: string
}

test.beforeEach(async (t) => {
  const ipldAlice = IpldStore.createInMemory()
  const keypairAlice = await ucan.EdKeypair.create()
  const token = await auth.claimFull(keypairAlice.did(), keypairAlice)
  const ucanStore = await ucan.Store.fromTokens([token.encoded()])
  const repoAlice = await Repo.create(
    ipldAlice,
    keypairAlice.did(),
    keypairAlice,
    ucanStore,
  )

  const ipldBob = IpldStore.createInMemory()

  const namespaceId = 'did:example:test'
  t.context = {
    ipldAlice,
    keypairAlice,
    repoAlice,
    ipldBob,
    namespaceId,
  } as Context
  t.pass('Context setup')
})

test('syncs an empty repo', async (t) => {
  const { repoAlice, ipldBob } = t.context as Context
  const car = await repoAlice.getFullHistory()
  const repoBob = await Repo.fromCarFile(car, ipldBob)
  t.deepEqual(repoBob.namespaceCids, {}, 'loads an empty repo')
})

test('syncs a repo that is starting from scratch', async (t) => {
  const { repoAlice, ipldBob, namespaceId } = t.context as Context
  const data = await util.fillRepo(repoAlice, namespaceId, 150, 10, 50)
  const car = await repoAlice.getFullHistory()
  const repoBob = await Repo.fromCarFile(car, ipldBob)
  await util.checkRepo(t, repoBob, namespaceId, data)
})

test('syncs a repo that is behind', async (t) => {
  const { repoAlice, ipldBob, namespaceId } = t.context as Context

  // bring bob up to date with early version of alice's repo
  const data = await util.fillRepo(repoAlice, namespaceId, 150, 10, 50)
  const car = await repoAlice.getFullHistory()
  const repoBob = await Repo.fromCarFile(car, ipldBob)

  // add more to alice's repo & have bob catch up
  const data2 = await util.fillRepo(repoAlice, namespaceId, 300, 10, 50)
  const diff = await repoAlice.getDiffCar(repoBob.cid)
  await repoBob.loadCarRoot(diff)

  const allData = {
    posts: {
      ...data.posts,
      ...data2.posts,
    },
    interactions: {
      ...data.interactions,
      ...data2.interactions,
    },
    follows: {
      ...data.follows,
      ...data2.follows,
    },
  }

  await util.checkRepo(t, repoBob, namespaceId, allData)
})
