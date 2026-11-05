import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BACKGROUND,
  DEFAULT_GLASS,
  GLASS_BLUR_MAX,
  GLASS_BRIGHTNESS_MAX,
  BACKGROUND_ANGLE_MAX,
  mergeBackgroundSettings,
  mergeGlassSettings,
  normalizeBackgroundSettings,
  normalizeGlassSettings
} from './app-settings-appearance'
import {
  builtinThemePresets,
  createPreset,
  deletePreset,
  duplicatePreset,
  isBuiltinThemePresetId,
  normalizeThemePresets,
  presetLookToPatch,
  renamePreset,
  snapshotCurrentLook,
  THEME_PRESET_NAME_MAX_CHARS
} from './app-settings-appearance-presets'

describe('glass settings normalize/merge', () => {
  it('defaults to disabled glass with the shared constants', () => {
    expect(normalizeGlassSettings(undefined)).toEqual({ ...DEFAULT_GLASS })
    expect(DEFAULT_GLASS.enabled).toBe(false)
  })

  it('clamps ranges and rejects malformed hex tints', () => {
    const glass = normalizeGlassSettings({
      enabled: true,
      blurPx: GLASS_BLUR_MAX + 50,
      opacity: 5,
      tint: 'red',
      borderIntensity: -2,
      shadowIntensity: 0.9
    })
    expect(glass.enabled).toBe(true)
    expect(glass.blurPx).toBe(GLASS_BLUR_MAX)
    expect(glass.opacity).toBe(1)
    expect(glass.tint).toBe(DEFAULT_GLASS.tint)
    expect(glass.borderIntensity).toBe(0)
    expect(glass.shadowIntensity).toBe(0.9)
  })

  it('merges a single-slider patch without wiping siblings', () => {
    const current = normalizeGlassSettings({ enabled: true, blurPx: 20, tint: '#abcdef' })
    const merged = mergeGlassSettings(current, { blurPx: 8 })
    expect(merged.enabled).toBe(true)
    expect(merged.tint).toBe('#abcdef')
    expect(merged.blurPx).toBe(8)
  })
})

describe('background settings normalize/merge', () => {
  it('defaults to the plain background', () => {
    expect(normalizeBackgroundSettings(undefined)).toEqual({ ...DEFAULT_BACKGROUND })
    expect(DEFAULT_BACKGROUND.type).toBe('default')
  })

  it('coerces unknown enums and clamps numeric fields', () => {
    const bg = normalizeBackgroundSettings({
      type: 'neon' as never,
      fit: 'stretch' as never,
      motion: 'spin' as never,
      gradientAngle: BACKGROUND_ANGLE_MAX + 400,
      brightness: GLASS_BRIGHTNESS_MAX + 5,
      overlay: 3,
      solidColor: '#ZZZZZZ'
    })
    expect(bg.type).toBe('default')
    expect(bg.fit).toBe(DEFAULT_BACKGROUND.fit)
    expect(bg.motion).toBe('off')
    expect(bg.gradientAngle).toBe(BACKGROUND_ANGLE_MAX)
    expect(bg.brightness).toBe(GLASS_BRIGHTNESS_MAX)
    expect(bg.overlay).toBe(1)
    expect(bg.solidColor).toBe(DEFAULT_BACKGROUND.solidColor)
  })

  it('keeps the stored image path when only the type changes', () => {
    const current = normalizeBackgroundSettings({ type: 'image', imagePath: 'C:\\app\\bg.png' })
    const merged = mergeBackgroundSettings(current, { overlay: 0.4 })
    expect(merged.type).toBe('image')
    expect(merged.imagePath).toBe('C:\\app\\bg.png')
    expect(merged.overlay).toBe(0.4)
  })

  it('clears the image path when explicitly set empty', () => {
    const current = normalizeBackgroundSettings({ type: 'image', imagePath: 'C:\\app\\bg.png' })
    const merged = mergeBackgroundSettings(current, { type: 'default', imagePath: '' })
    expect(merged.type).toBe('default')
    expect(merged.imagePath).toBe('')
  })
})

describe('theme presets', () => {
  it('offers three built-in, non-deletable presets', () => {
    const builtins = builtinThemePresets()
    expect(builtins).toHaveLength(3)
    expect(builtins.every((preset) => preset.builtIn)).toBe(true)
    for (const preset of builtins) expect(isBuiltinThemePresetId(preset.id)).toBe(true)
  })

  it('drops built-in ids, duplicates and non-array input when normalizing', () => {
    expect(normalizeThemePresets(undefined)).toEqual([])
    const normalized = normalizeThemePresets([
      { id: 'builtin-aurora-glass', name: 'spoof' },
      { id: 'user-1', name: 'One' },
      { id: 'user-1', name: 'dup' }
    ])
    expect(normalized.map((preset) => preset.id)).toEqual(['user-1'])
    expect(normalized[0].builtIn).toBe(false)
  })

  it('trims preset names to the max length on create', () => {
    const preset = createPreset('user-2', `${'x'.repeat(200)}`, { theme: 'dark' })
    expect(preset.name).toHaveLength(THEME_PRESET_NAME_MAX_CHARS)
    expect(preset.id).toBe('user-2')
  })

  it('duplicating a built-in yields a deletable user preset', () => {
    const next = duplicatePreset([], 'builtin-midnight-glass', 'user-3', 'Midnight copy')
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('user-3')
    expect(next[0].builtIn).toBe(false)
    expect(deletePreset(next, 'user-3')).toHaveLength(0)
  })

  it('refuses to delete or rename built-ins', () => {
    const users = [createPreset('user-4', 'Keep', { theme: 'light' })]
    expect(deletePreset(users, 'builtin-paper-light')).toEqual(users)
    const renamed = renamePreset(users, 'builtin-paper-light', 'hacked')
    expect(renamed).toEqual(users)
  })

  it('clamps the captured look so unrelated keys are untouched by the patch', () => {
    const look = snapshotCurrentLook({
      theme: 'dark',
      uiFontScale: 9,
      glass: normalizeGlassSettings({ enabled: true, blurPx: 999 })
    })
    expect(look.uiFontScale).toBe(1.6)
    expect(look.glass?.blurPx).toBe(GLASS_BLUR_MAX)
    const patch = presetLookToPatch(look)
    expect(Object.keys(patch).sort()).toEqual(['glass', 'theme', 'uiFontScale'])
  })
})
