import type { ColorPaletteSettingsV1 } from './app-settings-color-palette'
import type { DarkUiColorsV1 } from './app-settings-types'
import { normalizeColorPaletteSettings } from './app-settings-color-palette'
import { normalizeDarkUiColors } from './app-settings-dark-ui'
import {
  DEFAULT_BACKGROUND,
  DEFAULT_GLASS,
  normalizeBackgroundSettings,
  normalizeGlassSettings,
  type AppBackgroundSettingsV1,
  type GlassmorphismSettingsV1
} from './app-settings-appearance'

export const THEME_PRESET_MAX_COUNT = 40
export const THEME_PRESET_NAME_MAX_CHARS = 60

type ThemeChoice = 'system' | 'light' | 'dark'

/** The complete "look" a preset captures and applies in one patch. */
export type AppearanceLookV1 = {
  theme: ThemeChoice
  colorPalette?: ColorPaletteSettingsV1
  darkUiColors?: DarkUiColorsV1
  glass?: GlassmorphismSettingsV1
  background?: AppBackgroundSettingsV1
  uiFontScale?: number
}

export type AppearancePresetV1 = {
  id: string
  name: string
  builtIn: boolean
  look: AppearanceLookV1
}

function palette(id: string): ColorPaletteSettingsV1 {
  return normalizeColorPaletteSettings({ id: id as ColorPaletteSettingsV1['id'] })
}

function glass(overrides: Partial<GlassmorphismSettingsV1>): GlassmorphismSettingsV1 {
  return normalizeGlassSettings({ ...DEFAULT_GLASS, enabled: true, ...overrides })
}

function background(overrides: Partial<AppBackgroundSettingsV1>): AppBackgroundSettingsV1 {
  return normalizeBackgroundSettings({ ...DEFAULT_BACKGROUND, ...overrides })
}

/**
 * Curated, non-deletable full-look presets shown first in the gallery. They are
 * a fixed catalog, so they never live in the persisted `themePresets` field and
 * cannot be edited or removed by the user.
 */
export const BUILTIN_THEME_PRESETS: readonly AppearancePresetV1[] = Object.freeze([
  {
    id: 'builtin-aurora-glass',
    name: 'Aurora Glass',
    builtIn: true,
    look: {
      theme: 'dark',
      colorPalette: palette('dusk'),
      glass: glass({ blurPx: 22, opacity: 0.5, tint: '#0b1f3a', borderIntensity: 0.7, shadowIntensity: 0.6 }),
      background: background({ type: 'gradient', gradientFrom: '#0b1f3a', gradientTo: '#1f3a2e', motion: 'drift', overlay: 0.2 }),
      uiFontScale: 1
    }
  },
  {
    id: 'builtin-midnight-glass',
    name: 'Midnight Glass',
    builtIn: true,
    look: {
      theme: 'dark',
      colorPalette: palette('graphite'),
      glass: glass({ blurPx: 18, opacity: 0.42, tint: '#000000', borderIntensity: 0.55, shadowIntensity: 0.7 }),
      background: background({ type: 'solid', solidColor: '#070708', overlay: 0.1 }),
      uiFontScale: 1
    }
  },
  {
    id: 'builtin-paper-light',
    name: 'Paper Light',
    builtIn: true,
    look: {
      theme: 'light',
      colorPalette: palette('parchment'),
      glass: { ...DEFAULT_GLASS, enabled: false },
      background: { ...DEFAULT_BACKGROUND, type: 'default' },
      uiFontScale: 1
    }
  }
] as AppearancePresetV1[])

const BUILTIN_THEME_PRESET_IDS = new Set(BUILTIN_THEME_PRESETS.map((preset) => preset.id))

export function isBuiltinThemePresetId(id: string): boolean {
  return BUILTIN_THEME_PRESET_IDS.has(id)
}

/** Built-in gallery entries, always offered regardless of user presets. */
export function builtinThemePresets(): AppearancePresetV1[] {
  return BUILTIN_THEME_PRESETS.map((preset) => ({ ...preset, look: { ...preset.look } }))
}

/**
 * Normalize the persisted user presets only. Built-ins are never stored here; a
 * row that collides with a built-in id is dropped to keep the gallery honest.
 */
export function normalizeThemePresets(
  input: Array<Partial<AppearancePresetV1>> | undefined
): AppearancePresetV1[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const presets: AppearancePresetV1[] = []
  for (const raw of input) {
    const id = typeof raw?.id === 'string' ? raw.id.trim().slice(0, 80) : ''
    if (!id || seen.has(id) || isBuiltinThemePresetId(id)) continue
    seen.add(id)
    presets.push({
      id,
      name: typeof raw?.name === 'string' ? raw.name.slice(0, THEME_PRESET_NAME_MAX_CHARS) : '',
      builtIn: false,
      look: normalizeLook(raw.look)
    })
    if (presets.length >= THEME_PRESET_MAX_COUNT) break
  }
  return presets
}

function normalizeThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

/** Rebuild one look from a loosely typed snapshot, clamping every sub-setting. */
export function normalizeLook(look: unknown): AppearanceLookV1 {
  const source = (look && typeof look === 'object' ? look : {}) as Record<string, unknown>
  const result: AppearanceLookV1 = { theme: normalizeThemeChoice(source.theme) }
  if (source.colorPalette && typeof source.colorPalette === 'object') {
    result.colorPalette = normalizeColorPaletteSettings(source.colorPalette as never)
  }
  if (source.darkUiColors && typeof source.darkUiColors === 'object') {
    result.darkUiColors = normalizeDarkUiColors(source.darkUiColors as never)
  }
  if (source.glass && typeof source.glass === 'object') {
    result.glass = normalizeGlassSettings(source.glass as never)
  }
  if (source.background && typeof source.background === 'object') {
    result.background = normalizeBackgroundSettings(source.background as never)
  }
  if (typeof source.uiFontScale === 'number' && Number.isFinite(source.uiFontScale)) {
    result.uiFontScale = Math.min(1.6, Math.max(0.8, source.uiFontScale))
  }
  return result
}

function validName(name: string): string {
  return name.trim().slice(0, THEME_PRESET_NAME_MAX_CHARS)
}

/** Capture the current look from full settings so "Save as preset" snapshots it. */
export function snapshotCurrentLook(settings: {
  theme: ThemeChoice
  colorPalette?: ColorPaletteSettingsV1
  darkUiColors?: DarkUiColorsV1
  glass?: GlassmorphismSettingsV1
  background?: AppBackgroundSettingsV1
  uiFontScale?: number
}): AppearanceLookV1 {
  return normalizeLook(settings)
}

/**
 * Return the narrow settings patch that applies a preset. Only the keys the
 * preset actually defines are touched, so unrelated preferences survive.
 */
export function presetLookToPatch(look: AppearanceLookV1): AppearanceLookV1 {
  return normalizeLook(look)
}

export function createPreset(id: string, name: string, look: AppearanceLookV1): AppearancePresetV1 {
  return { id: id.trim().slice(0, 80), name: validName(name), builtIn: false, look: normalizeLook(look) }
}

/**
 * Insert a copy of an existing preset (built-in or user) under a fresh id. The
 * copy is always a deletable user preset, even when the source is a built-in.
 */
export function duplicatePreset(
  presets: AppearancePresetV1[],
  sourceId: string,
  newId: string,
  newName: string
): AppearancePresetV1[] {
  const source = [...builtinThemePresets(), ...presets].find((preset) => preset.id === sourceId)
  if (!source) return presets
  const copy = createPreset(newId, newName || `${source.name} Copy`, source.look)
  return [...presets, copy].slice(-THEME_PRESET_MAX_COUNT)
}

/** Delete refuses built-ins (they are a fixed catalog) and unknown ids. */
export function deletePreset(presets: AppearancePresetV1[], id: string): AppearancePresetV1[] {
  if (isBuiltinThemePresetId(id)) return presets
  return presets.filter((preset) => preset.id !== id)
}

/** Rename refuses built-ins; user presets keep their id and look. */
export function renamePreset(presets: AppearancePresetV1[], id: string, name: string): AppearancePresetV1[] {
  if (isBuiltinThemePresetId(id)) return presets
  return presets.map((preset) => (preset.id === id ? { ...preset, name: validName(name) } : preset))
}
