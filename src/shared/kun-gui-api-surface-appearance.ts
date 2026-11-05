import type { AppearanceImageResult } from './kun-gui-api-contracts'

/**
 * Whole-window background image picker. The chosen file is copied into
 * `userData/appearance/backgrounds` by the main process; the renderer only ever
 * sees an absolute path that `applyBackground` turns into a `file://` URL.
 */
export type KunGuiAppearanceApi = {
  /** Copy a chosen image into the managed backgrounds folder; returns its absolute path. */
  pickAppBackgroundImage: (previousPath?: string) => Promise<AppearanceImageResult>
  /** Delete a previously stored background image (guarded to the backgrounds folder). */
  removeAppBackgroundImage: (backgroundPath: string) => Promise<AppearanceImageResult>
}
