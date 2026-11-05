import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppSessionOwner } from '../contracts/app-session-owner.js'
import { runtimeProcessIdentity } from '../server/runtime-process-identity.js'
import * as identity from '../server/runtime-process-identity.js'
import {
  acquireAppSessionReservation,
  AppSessionReservationSchema,
  claimAppSessionReservation,
  orphanedReservationError,
  type AppSessionReservation
} from './app-session-reservation.js'
import { createManagerDiscoveryRecord, managerDiscoveryPath } from './manager-discovery.js'

const roots: string[] = []
const reservations: AppSessionReservation[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(reservations.splice(0).map((reservation) => reservation.release()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
function owner(generation = 1): AppSessionOwner {
  return { ownerSessionId: randomUUID(), ownerKind: 'gui', ownerPid: process.pid,
    ownerStartedAt: new Date().toISOString(), ownerProcessIdentity: runtimeProcessIdentity()!, generation }
}
// Far above any live pid; with a never-issued identity it can only read as dead.
const DEAD_PID = 4_000_000

/** Age a claim directory so its publish window is over. */
async function backdate(path: string, ageMs = 60_000): Promise<void> {
  const when = new Date(Date.now() - ageMs)
  await utimes(path, when, when)
}

async function archivedClaims(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.includes('.app-session.unverified-'))
}

function claimRecord(profile: { dataDir: string; controlDir: string; settingsPath: string }) {
  return AppSessionReservationSchema.parse({ token: randomUUID(), owner: owner(), ...profile })
}

/** Rewrite every claim so its owner looks like an application that already exited. */
async function killOwner(reservation: AppSessionReservation): Promise<void> {
  await rewriteOwner(reservation, DEAD_PID, 'exited-owner')
}

/** Rewrite the owner in every claim so startup reads it as a specific identity. */
async function rewriteOwner(reservation: AppSessionReservation, ownerPid: number, processIdentity: string): Promise<void> {
  const claims = [
    join(reservation.profile.dataDir, '.app-session'),
    join(reservation.profile.controlDir, '.app-session'),
    `${reservation.profile.settingsPath}.kun-app-session`
  ]
  for (const claim of claims) {
    const path = join(claim, 'owner.json')
    const record = JSON.parse(await readFile(path, 'utf8'))
    record.owner = { ...record.owner, ownerPid, ownerProcessIdentity: processIdentity }
    await writeFile(path, JSON.stringify(record))
  }
}

/**
 * Force the recorded owner PID to read as an inconclusive identity verdict, as
 * Windows PID reuse by an unreadable process or a failed native identity query
 * does, while every other PID keeps its real state.
 */
function spyOwnerState(ownerPid: number, state: 'unknown' | 'reused'): void {
  const original = identity.runtimeProcessOwnerState
  vi.spyOn(identity, 'runtimeProcessOwnerState').mockImplementation((pid, record) =>
    pid === ownerPid ? state : original(pid, record))
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kun-session-profile-'))
  roots.push(root)
  return { root, dataDir: join(root, 'data'), controlDir: join(root, 'control'), settingsPath: join(root, 'settings.json') }
}

describe('application session profile reservation', () => {
  it('excludes a different owner across flavors/control directories while a Manager generation is absent', async () => {
    const profile = await fixture()
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    await expect(acquireAppSessionReservation({ ...profile, controlDir: join(profile.root, 'other-control'), owner: owner(2) }))
      .rejects.toThrow('already owned')
  })

  it('rejects distinct data directories sharing the settings profile', async () => {
    const profile = await fixture()
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    await expect(acquireAppSessionReservation({ ...profile, dataDir: join(profile.root, 'other-data'),
      controlDir: join(profile.root, 'other-control'), owner: owner() })).rejects.toThrow('already owned')
  })

  it.skipIf(process.platform === 'win32')('resolves a symlink alias before claiming a data directory', async () => {
    const profile = await fixture()
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    const alias = join(profile.root, 'alias')
    await symlink(profile.dataDir, alias, 'dir')
    await expect(acquireAppSessionReservation({ ...profile, dataDir: alias,
      controlDir: join(profile.root, 'other-control'), settingsPath: join(profile.root, 'other-settings'), owner: owner() }))
      .rejects.toThrow('already owned')
  })

  it('names the exited owner and its still-running processes instead of a generic busy profile', async () => {
    const profile = await fixture()
    const reservation = await acquireAppSessionReservation({ ...profile, owner: owner() })
    await reservation.recordProcess({ pid: process.pid, instanceId: 'manager-2' })
    await killOwner(reservation)
    const attempt = acquireAppSessionReservation({ ...profile, owner: owner() })
    await expect(attempt).rejects.toMatchObject({ code: 'app_session_owner_busy' })
    await expect(attempt).rejects.toThrow(
      `its gui application (pid ${DEAD_PID}) has exited, but processes it started are still running and did not shut down: pid ${process.pid} (manager-2)`
    )
    await expect(attempt).rejects.not.toThrow('Close that client first')
  })

  it('reclaims an exited owner reservation once its recorded processes are gone too', async () => {
    const profile = await fixture()
    const reservation = await acquireAppSessionReservation({ ...profile, owner: owner() })
    await killOwner(reservation)
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
  })

  it('directs orphan recovery through verified ownership instead of raw PID kill commands', () => {
    const exited = { ...owner(), ownerPid: DEAD_PID }
    const orphans = [{ pid: 24121, instanceId: 'manager-2' }, { pid: 17778, instanceId: 'runtime' }]
    expect(orphanedReservationError('/p', exited, orphans, 'darwin').message)
      .toContain('Use Recover Kun to verify and stop the recorded leftover processes')
    expect(orphanedReservationError('/p', exited, orphans, 'win32').message)
      .not.toContain('taskkill')
  })

  it('allows independent profiles and permits a sequential owner after release', async () => {
    const first = await fixture()
    const second = await fixture()
    const reservation = await acquireAppSessionReservation({ ...first, owner: owner() })
    reservations.push(await acquireAppSessionReservation({ ...second, owner: owner() }))
    await reservation.release()
    reservations.push(await acquireAppSessionReservation({ ...first, owner: owner() }))
  })

  it('archives an unpublished claim instead of failing on an unverifiable owner', async () => {
    const profile = await fixture()
    const claimPath = join(profile.dataDir, '.app-session')
    await mkdir(claimPath, { recursive: true })
    await backdate(claimPath)
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    expect(await archivedClaims(profile.dataDir)).toHaveLength(1)
  })

  it('archives a corrupt owner record after the publication grace', async () => {
    const profile = await fixture()
    const claimPath = join(profile.dataDir, '.app-session')
    await mkdir(claimPath, { recursive: true })
    await writeFile(join(claimPath, 'owner.json'), '{"token":')
    await backdate(claimPath)
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    expect(await archivedClaims(profile.dataDir)).toHaveLength(1)
  })

  it('waits for an owner record that is still being published', async () => {
    const profile = await fixture()
    const claimPath = join(profile.dataDir, '.app-session')
    const record = claimRecord(profile)
    await mkdir(claimPath, { recursive: true })
    const pending = claimAppSessionReservation(claimPath, record, { publicationGraceMs: 3_000 })
    await new Promise((resolve) => setTimeout(resolve, 150))
    // A live writer publishes the record; only that publish unblocks the claim.
    await writeFile(join(claimPath, 'owner.json'), JSON.stringify({
      ...record, token: randomUUID(), owner: { ...record.owner, ownerPid: DEAD_PID, ownerProcessIdentity: 'exited-owner' }
    }))
    await pending
    const claimed = JSON.parse(await readFile(join(claimPath, 'owner.json'), 'utf8'))
    expect(claimed.token).toBe(record.token)
    expect(await archivedClaims(profile.dataDir)).toHaveLength(0)
  })

  it('keeps a live recorded process blocking an unreadable claim', async () => {
    const profile = await fixture()
    const claimPath = join(profile.dataDir, '.app-session')
    await mkdir(claimPath, { recursive: true })
    await writeFile(join(claimPath, 'process-manager.json'), JSON.stringify({
      pid: process.pid, instanceId: 'manager', startedAt: new Date().toISOString(),
      processIdentity: runtimeProcessIdentity()!
    }))
    await backdate(claimPath)
    const attempt = acquireAppSessionReservation({ ...profile, owner: owner() })
    await expect(attempt).rejects.toMatchObject({ code: 'app_session_owner_busy' })
    await expect(attempt).rejects.toThrow(
      'its owner record is unreadable, but processes it started are still running and did not shut down: ' +
      `pid ${process.pid} (manager)`)
    expect(await archivedClaims(profile.dataDir)).toHaveLength(0)
  })

  it('keeps a live Runtime Manager blocking an unreadable claim', async () => {
    const profile = await fixture()
    await mkdir(join(profile.dataDir, '.app-session'), { recursive: true })
    await mkdir(profile.controlDir, { recursive: true })
    await writeFile(managerDiscoveryPath(profile.controlDir), JSON.stringify(createManagerDiscoveryRecord({
      pid: process.pid, startedAt: new Date().toISOString(), host: '127.0.0.1', port: 18888,
      baseUrl: 'http://127.0.0.1:18888', managerToken: 'claim-test-token', serviceVersion: '0.0.0-test',
      dataDir: profile.dataDir, settingsPath: profile.settingsPath
    })))
    await backdate(join(profile.dataDir, '.app-session'))
    await expect(acquireAppSessionReservation({ ...profile, owner: owner() }))
      .rejects.toThrow(`a Runtime Manager (pid ${process.pid}) still owns this profile`)
    expect(await archivedClaims(profile.dataDir)).toHaveLength(0)
  })
})

// A never-issued PID used only to drive an inconclusive identity verdict in the spy.
const UNVERIFIABLE_PID = 4_500_000

/** Seed a stale, readable owner claim whose PID can only read as inconclusive. */
async function seedStaleClaim(claimPath: string, profile: { dataDir: string; controlDir: string; settingsPath: string }): Promise<void> {
  await mkdir(claimPath, { recursive: true })
  await writeFile(join(claimPath, 'owner.json'), JSON.stringify({
    ...claimRecord(profile), token: randomUUID(),
    owner: { ...owner(), ownerPid: UNVERIFIABLE_PID, ownerProcessIdentity: 'unverifiable-owner' }
  }))
  await backdate(claimPath)
}

describe('application session stale unverifiable owner recovery', () => {
  it('recovers a crashed profile whose owner identity is unverifiable and has no live Kun process', async () => {
    const profile = await fixture()
    const claimPath = join(profile.dataDir, '.app-session')
    await seedStaleClaim(claimPath, profile)
    spyOwnerState(UNVERIFIABLE_PID, 'unknown')
    // No participant files and no live Manager: the unverifiable owner is stale.
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    // Evidence is archived (preserved), never deleted, and the profile is reclaimed.
    expect(await archivedClaims(profile.dataDir)).toHaveLength(1)
    const claimed = JSON.parse(await readFile(join(claimPath, 'owner.json'), 'utf8'))
    expect(claimed.owner.ownerPid).toBe(process.pid)
  })

  it('logs the owner PID and the inconclusive verdict when a stale owner is recovered', async () => {
    const profile = await fixture()
    await seedStaleClaim(join(profile.dataDir, '.app-session'), profile)
    spyOwnerState(UNVERIFIABLE_PID, 'unknown')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    const logged = info.mock.calls.map(([message, ...rest]) => `${message} ${rest.join(' ')}`).join('\n')
    expect(logged).toContain(`"ownerPid":${UNVERIFIABLE_PID}`)
    expect(logged).toContain('"ownerState":"unknown"')
    expect(logged).toContain('"action":"archive-unverified-owner"')
    expect(logged).not.toContain(profile.dataDir.replace(/\\/gu, '')) // never leaks the raw profile path
  })

  it('names leftover processes when an unverifiable owner still has a live recorded process', async () => {
    const profile = await fixture()
    const reservation = await acquireAppSessionReservation({ ...profile, owner: owner() })
    await reservation.recordProcess({ pid: process.pid, instanceId: 'manager-2' })
    await rewriteOwner(reservation, UNVERIFIABLE_PID, 'unverifiable-owner')
    spyOwnerState(UNVERIFIABLE_PID, 'unknown')
    const attempt = acquireAppSessionReservation({ ...profile, owner: owner() })
    await expect(attempt).rejects.toMatchObject({ code: 'app_session_owner_busy' })
    await expect(attempt).rejects.toThrow('processes it started are still running and did not shut down')
    await expect(attempt).rejects.not.toThrow('Close that client first')
    expect(await archivedClaims(profile.dataDir)).toHaveLength(0)
  })

  it('keeps a live Runtime Manager blocking an unverifiable owner record', async () => {
    const profile = await fixture()
    await seedStaleClaim(join(profile.dataDir, '.app-session'), profile)
    await mkdir(profile.controlDir, { recursive: true })
    await writeFile(managerDiscoveryPath(profile.controlDir), JSON.stringify(createManagerDiscoveryRecord({
      pid: process.pid, startedAt: new Date().toISOString(), host: '127.0.0.1', port: 18888,
      baseUrl: 'http://127.0.0.1:18888', managerToken: 'claim-test-token', serviceVersion: '0.0.0-test',
      dataDir: profile.dataDir, settingsPath: profile.settingsPath
    })))
    spyOwnerState(UNVERIFIABLE_PID, 'unknown')
    const attempt = acquireAppSessionReservation({ ...profile, owner: owner() })
    await expect(attempt).rejects.toThrow(`a Runtime Manager (pid ${process.pid}) still owns this profile`)
    expect(await archivedClaims(profile.dataDir)).toHaveLength(0)
  })

  it('reclaims after a recycled owner PID is detected as reused, without a false live-owner block', async () => {
    const profile = await fixture()
    const claimPath = join(profile.dataDir, '.app-session')
    await seedStaleClaim(claimPath, profile)
    spyOwnerState(UNVERIFIABLE_PID, 'reused')
    reservations.push(await acquireAppSessionReservation({ ...profile, owner: owner() }))
    // 'reused' is conclusive, so the stale record is retired (not archived aside).
    expect(await archivedClaims(profile.dataDir)).toHaveLength(0)
    const claimed = JSON.parse(await readFile(join(claimPath, 'owner.json'), 'utf8'))
    expect(claimed.owner.ownerPid).toBe(process.pid)
  })
})
