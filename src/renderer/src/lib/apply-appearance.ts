import {
  normalizeBackgroundSettings,
  normalizeGlassSettings,
  type AppBackgroundSettingsPatchV1,
  type AppBackgroundSettingsV1,
  type GlassmorphismSettingsPatchV1,
  type GlassmorphismSettingsV1
} from '@shared/app-settings'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from './browser-storage'

/** Last applied glass/background, so startup paints them before the settings IPC answers. */
const GLASS_CACHE_KEY = 'kun.glass.v1'
const BACKGROUND_CACHE_KEY = 'kun.background.v1'

/**
 * Encode an absolute filesystem path as a Windows-safe `file://` URL usable in
 * CSS `url("...")`. Backslashes become slashes, a drive letter is preserved, and
 * characters that would break the URL or the CSS url() token are percent-encoded.
 */
export function pathToFileUrl(rawPath: string): string {
  const p = (rawPath ?? '').trim()
  if (!p) return ''
  if (/^file:\/\//i.test(p)) return p
  const isWindowsDrive = /^[A-Za-z]:[\\/]/.test(p)
  const slashes = p.replace(/\\/g, '/')
  const base = isWindowsDrive || slashes.startsWith('/') ? slashes : `/${slashes}`
  const url = base.startsWith('/') ? `file://${base}` : `file:///${base}`
  return url.replace(/[ #%?]/g, (character) => encodeURIComponent(character))
}

function styleVar(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value)
}

export function applyGlass(settings?: GlassmorphismSettingsPatchV1 | null): GlassmorphismSettingsV1 {
  const glass = normalizeGlassSettings(settings)
  if (typeof document === 'undefined') return glass
  const root = document.documentElement
  root.setAttribute('data-glass', glass.enabled ? 'on' : 'off')
  styleVar('--ds-glass-blur', `${glass.blurPx}px`)
  styleVar('--ds-glass-opacity', String(glass.opacity))
  styleVar('--ds-glass-tint', glass.tint)
  styleVar('--ds-glass-border', String(glass.borderIntensity))
  styleVar('--ds-glass-shadow', String(glass.shadowIntensity))
  writeBrowserStorageItem(GLASS_CACHE_KEY, JSON.stringify(glass))
  return glass
}

export function applyBackground(settings?: AppBackgroundSettingsPatchV1 | null): AppBackgroundSettingsV1 {
  const background = normalizeBackgroundSettings(settings)
  if (typeof document === 'undefined') return background
  const root = document.documentElement
  root.setAttribute('data-bg-type', background.type)
  root.setAttribute('data-bg-motion', background.motion)
  root.setAttribute('data-bg-fit', background.fit)
  styleVar('--ds-app-bg-solid', background.solidColor)
  styleVar('--ds-app-bg-gradient-from', background.gradientFrom)
  styleVar('--ds-app-bg-gradient-to', background.gradientTo)
  styleVar('--ds-app-bg-gradient-angle', `${background.gradientAngle}deg`)
  styleVar('--ds-app-bg-gradient', `linear-gradient(${background.gradientAngle}deg, ${background.gradientFrom}, ${background.gradientTo})`)
  const fileUrl = background.type === 'image' ? pathToFileUrl(background.imagePath) : ''
  styleVar('--ds-app-bg-image', fileUrl ? `url("${fileUrl}")` : 'none')
  styleVar('--ds-app-bg-fit', background.fit)
  styleVar('--ds-app-bg-brightness', String(background.brightness))
  styleVar('--ds-app-bg-overlay', String(background.overlay))
  styleVar('--ds-app-bg-overlay-color', background.overlayColor)
  writeBrowserStorageItem(BACKGROUND_CACHE_KEY, JSON.stringify(background))
  return background
}

/** Paint the cached look during first paint, before persisted settings load. */
export function applyCachedAppearance(): void {
  if (typeof document === 'undefined') return
  const glassRaw = readBrowserStorageItem(GLASS_CACHE_KEY)
  if (glassRaw) {
    try {
      applyGlass(JSON.parse(glassRaw) as GlassmorphismSettingsPatchV1)
    } catch {
      removeBrowserStorageItem(GLASS_CACHE_KEY)
    }
  }
  const backgroundRaw = readBrowserStorageItem(BACKGROUND_CACHE_KEY)
  if (backgroundRaw) {
    try {
      applyBackground(JSON.parse(backgroundRaw) as AppBackgroundSettingsPatchV1)
    } catch {
      removeBrowserStorageItem(BACKGROUND_CACHE_KEY)
    }
  }
}
