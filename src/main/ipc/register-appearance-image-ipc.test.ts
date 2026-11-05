import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture the handler the registrar installs on ipcMain.handle.
const handlers: Record<string, (event: unknown, raw: unknown) => Promise<unknown>> = {}

const copyFileMock = vi.fn(async (_src: string, _dest: string) => {})
const rmMock = vi.fn(async (_path: string, _opts?: unknown) => {})
const mkdirMock = vi.fn(async () => {})
let statSize = 1024
const statMock = vi.fn(async () => ({ size: statSize }))
type OpenDialogResult = { canceled: boolean; filePaths: string[] }
const showOpenDialogMock = vi.fn(
  async (..._args: unknown[]): Promise<OpenDialogResult> => ({ canceled: true, filePaths: [] })
)

vi.mock('electron', () => ({
  app: { getPath: () => '/kun-userdata' },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialogMock(...args) },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, raw: unknown) => Promise<unknown>) => {
      handlers[channel] = fn
    }
  }
}))

vi.mock('node:fs/promises', () => ({
  copyFile: (...args: [string, string]) => copyFileMock(...args),
  mkdir: () => mkdirMock(),
  rm: (...args: [string, unknown]) => rmMock(...args),
  stat: () => statMock()
}))

vi.mock('./app-ipc-handler-utils', () => ({
  assertTrustedWorkbenchSender: () => {},
  parseIpcPayload: (_channel: string, schema: { parse: (v: unknown) => unknown }, raw: unknown) =>
    schema.parse(raw)
}))

import { registerAppearanceImageIpcHandlers } from './register-appearance-image-ipc'

const USER_DATA = '/kun-userdata'
const BACKGROUNDS_DIR = join(USER_DATA, 'appearance', 'backgrounds')
const pick = (raw: unknown): Promise<any> =>
  handlers['appearance:pick-background-image']({}, raw)
const remove = (raw: unknown): Promise<any> =>
  handlers['appearance:remove-background-image']({}, raw)

beforeEach(() => {
  vi.clearAllMocks()
  statSize = 1024
  showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
  registerAppearanceImageIpcHandlers({ getMainWindow: () => null } as never)
})

describe('appearance:pick-background-image', () => {
  it('reports cancel without touching the filesystem', async () => {
    showOpenDialogMock.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await pick({})).toEqual({ ok: false, canceled: true })
    expect(copyFileMock).not.toHaveBeenCalled()
  })

  it('rejects a disallowed extension', async () => {
    showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/pic.gif'] })
    const result = await pick({})
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/PNG|JPG|WebP/i)
    expect(copyFileMock).not.toHaveBeenCalled()
  })

  it('rejects an oversize file before copying', async () => {
    statSize = 15 * 1024 * 1024 + 1
    showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/big.png'] })
    const result = await pick({})
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/15 MB/i)
    expect(copyFileMock).not.toHaveBeenCalled()
  })

  it('copies a valid image into userData and removes the replaced file', async () => {
    const previous = join(BACKGROUNDS_DIR, 'old.png')
    showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/pic.png'] })
    const result = await pick({ previousPath: previous })
    expect(result.ok).toBe(true)
    expect(copyFileMock).toHaveBeenCalledTimes(1)
    const dest = copyFileMock.mock.calls[0][1] as string
    expect(resolve(dest).toLowerCase().startsWith(resolve(BACKGROUNDS_DIR).toLowerCase())).toBe(true)
    expect(rmMock).toHaveBeenCalledWith(resolve(previous), { force: true })
  })
})

describe('appearance:remove-background-image', () => {
  it('deletes only files that live under the backgrounds folder', async () => {
    const inside = join(BACKGROUNDS_DIR, 'a.png')
    expect(await remove({ backgroundPath: inside })).toEqual({ ok: true })
    expect(rmMock).toHaveBeenCalledWith(resolve(inside), { force: true })
  })

  it('refuses a path-traversal target outside the folder', async () => {
    const outside = resolve('/etc/passwd.png')
    expect(await remove({ backgroundPath: outside })).toEqual({ ok: true })
    expect(rmMock).not.toHaveBeenCalled()
  })
})
