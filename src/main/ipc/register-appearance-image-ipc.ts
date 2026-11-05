import { app, dialog, ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { extname, join, resolve, sep } from 'node:path'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { z } from 'zod'
import type { AppearanceImageResult } from '../../shared/kun-gui-api'
import type { RegisterAppIpcHandlersOptions } from './app-ipc-handler-options'
import { assertTrustedWorkbenchSender, parseIpcPayload } from './app-ipc-handler-utils'

/** A whole-window background is decorative; keep the copied file small and the payload light. */
const MAX_BACKGROUND_BYTES = 15 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
const ALLOWED_EXTENSION_SET = new Set<string>(ALLOWED_EXTENSIONS)

const pickBackgroundImagePayloadSchema = z
  .object({ previousPath: z.string().max(4096).optional() })
  .strict()

const removeBackgroundImagePayloadSchema = z
  .object({ backgroundPath: z.string().min(1).max(4096) })
  .strict()

function backgroundsDirectory(): string {
  return join(app.getPath('userData'), 'appearance', 'backgrounds')
}

/**
 * Delete a stored background only when it lives directly under the backgrounds
 * folder, so a crafted path can never remove files elsewhere on disk. Best
 * effort: a missing or locked file must not fail the picker.
 */
async function deleteStoredBackground(rawPath?: string): Promise<void> {
  const candidate = (rawPath ?? '').trim()
  if (!candidate) return
  const dir = resolve(backgroundsDirectory())
  const target = resolve(candidate)
  const prefix = dir + sep
  if (target.toLowerCase() === dir.toLowerCase()) return
  if (!target.toLowerCase().startsWith(prefix.toLowerCase())) return
  try {
    await rm(target, { force: true })
  } catch {
    // Ignore: the stored file may already be gone or held by the OS.
  }
}

export function registerAppearanceImageIpcHandlers(options: RegisterAppIpcHandlersOptions): void {
  const { getMainWindow } = options

  ipcMain.handle(
    'appearance:pick-background-image',
    async (event, raw: unknown): Promise<AppearanceImageResult> => {
      assertTrustedWorkbenchSender(event, getMainWindow)
      const { previousPath } = parseIpcPayload(
        'appearance:pick-background-image',
        pickBackgroundImagePayloadSchema,
        raw ?? {}
      )
      const dialogOptions: Electron.OpenDialogOptions = {
        title: 'Choose a background image',
        properties: ['openFile', 'dontAddToRecent'],
        filters: [{ name: 'Images', extensions: [...ALLOWED_EXTENSIONS] }]
      }
      const mainWindow = getMainWindow()
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
      const sourcePath = result.filePaths[0]
      try {
        const ext = extname(sourcePath).replace(/^\./, '').toLowerCase()
        if (!ALLOWED_EXTENSION_SET.has(ext)) {
          return { ok: false, message: 'Please choose a PNG, JPG, JPEG, or WebP image.' }
        }
        const info = await stat(sourcePath)
        if (info.size > MAX_BACKGROUND_BYTES) {
          return { ok: false, message: 'Background images must be 15 MB or smaller.' }
        }
        const dir = backgroundsDirectory()
        await mkdir(dir, { recursive: true })
        const targetPath = join(dir, `${randomBytes(8).toString('hex')}.${ext}`)
        await copyFile(sourcePath, targetPath)
        // Replace: remove the file the user had chosen before, if any.
        await deleteStoredBackground(previousPath)
        return { ok: true, path: targetPath }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    'appearance:remove-background-image',
    async (event, raw: unknown): Promise<AppearanceImageResult> => {
      assertTrustedWorkbenchSender(event, getMainWindow)
      const { backgroundPath } = parseIpcPayload(
        'appearance:remove-background-image',
        removeBackgroundImagePayloadSchema,
        raw ?? {}
      )
      try {
        await deleteStoredBackground(backgroundPath)
        return { ok: true }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    }
  )
}
