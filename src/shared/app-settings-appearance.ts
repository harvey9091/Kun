import { normalizeDarkUiHexColor } from './app-settings-dark-ui'

/**
 * Glassmorphism surface settings. Opt-in: `enabled` defaults to false so legacy
 * snapshots keep their current opaque look until the user turns glass on.
 */
export type GlassmorphismSettingsV1 = {
  enabled: boolean
  /** Blur radius applied to gated surfaces, 0..GLASS_BLUR_MAX px. */
  blurPx: number
  /** Translucent fill opacity, 0..1. */
  opacity: number
  /** Surface tint, six-digit hex. */
  tint: string
  /** Border highlight strength, 0..1. */
  borderIntensity: number
  /** Drop shadow strength, 0..1. */
  shadowIntensity: number
}

export type GlassmorphismSettingsPatchV1 = Partial<GlassmorphismSettingsV1>

export const APP_BACKGROUND_TYPES = ['default', 'solid', 'gradient', 'image'] as const
export type AppBackgroundType = (typeof APP_BACKGROUND_TYPES)[number]

export const APP_BACKGROUND_FITS = ['cover', 'contain', 'center', 'tile'] as const
export type AppBackgroundFit = (typeof APP_BACKGROUND_FITS)[number]

export const APP_BACKGROUND_MOTIONS = ['off', 'drift'] as const
export type AppBackgroundMotion = (typeof APP_BACKGROUND_MOTIONS)[number]

/** Whole-window background layer behind the workbench shell. */
export type AppBackgroundSettingsV1 = {
  type: AppBackgroundType
  solidColor: string
  gradientFrom: string
  gradientTo: string
  /** Gradient direction in degrees, 0..360. */
  gradientAngle: number
  motion: AppBackgroundMotion
  /** Absolute file path copied into userData by the image picker IPC. */
  imagePath: string
  fit: AppBackgroundFit
  /** Image brightness multiplier, 0.2..1.5. */
  brightness: number
  /** Darkening overlay strength drawn over the background, 0..1. */
  overlay: number
  overlayColor: string
}

export type AppBackgroundSettingsPatchV1 = Partial<AppBackgroundSettingsV1>

export const GLASS_BLUR_MIN = 0
export const GLASS_BLUR_MAX = 30
export const GLASS_BRIGHTNESS_MIN = 0.2
export const GLASS_BRIGHTNESS_MAX = 1.5
export const BACKGROUND_ANGLE_MIN = 0
export const BACKGROUND_ANGLE_MAX = 360

export const DEFAULT_GLASS: Readonly<GlassmorphismSettingsV1> = Object.freeze({
  enabled: false,
  blurPx: 16,
  opacity: 0.62,
  tint: '#0f172a',
  borderIntensity: 0.5,
  shadowIntensity: 0.5
})

export const DEFAULT_BACKGROUND: Readonly<AppBackgroundSettingsV1> = Object.freeze({
  type: 'default',
  solidColor: '#101014',
  gradientFrom: '#0b1f3a',
  gradientTo: '#3a0b2f',
  gradientAngle: 135,
  motion: 'off',
  imagePath: '',
  fit: 'cover',
  brightness: 1,
  overlay: 0,
  overlayColor: '#000000'
})

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function clampUnit(value: unknown, fallback: number): number {
  return clampNumber(value, 0, 1, fallback)
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && (choices as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

export function normalizeGlassSettings(
  value?: GlassmorphismSettingsPatchV1 | null
): GlassmorphismSettingsV1 {
  return {
    enabled: value?.enabled === true,
    blurPx: clampNumber(value?.blurPx, GLASS_BLUR_MIN, GLASS_BLUR_MAX, DEFAULT_GLASS.blurPx),
    opacity: clampUnit(value?.opacity, DEFAULT_GLASS.opacity),
    tint: normalizeDarkUiHexColor(value?.tint, DEFAULT_GLASS.tint),
    borderIntensity: clampUnit(value?.borderIntensity, DEFAULT_GLASS.borderIntensity),
    shadowIntensity: clampUnit(value?.shadowIntensity, DEFAULT_GLASS.shadowIntensity)
  }
}

/**
 * Merge a partial glass patch over the current glass settings so a single
 * slider change never wipes its siblings.
 */
export function mergeGlassSettings(
  current?: GlassmorphismSettingsPatchV1 | null,
  patch?: GlassmorphismSettingsPatchV1
): GlassmorphismSettingsV1 {
  if (!patch) return normalizeGlassSettings(current)
  return normalizeGlassSettings({ ...current, ...patch })
}

export function normalizeBackgroundSettings(
  value?: AppBackgroundSettingsPatchV1 | null
): AppBackgroundSettingsV1 {
  return {
    type: oneOf(value?.type, APP_BACKGROUND_TYPES, DEFAULT_BACKGROUND.type),
    solidColor: normalizeDarkUiHexColor(value?.solidColor, DEFAULT_BACKGROUND.solidColor),
    gradientFrom: normalizeDarkUiHexColor(value?.gradientFrom, DEFAULT_BACKGROUND.gradientFrom),
    gradientTo: normalizeDarkUiHexColor(value?.gradientTo, DEFAULT_BACKGROUND.gradientTo),
    gradientAngle: clampNumber(
      value?.gradientAngle,
      BACKGROUND_ANGLE_MIN,
      BACKGROUND_ANGLE_MAX,
      DEFAULT_BACKGROUND.gradientAngle
    ),
    motion: oneOf(value?.motion, APP_BACKGROUND_MOTIONS, DEFAULT_BACKGROUND.motion),
    imagePath: typeof value?.imagePath === 'string' ? value.imagePath : DEFAULT_BACKGROUND.imagePath,
    fit: oneOf(value?.fit, APP_BACKGROUND_FITS, DEFAULT_BACKGROUND.fit),
    brightness: clampNumber(
      value?.brightness,
      GLASS_BRIGHTNESS_MIN,
      GLASS_BRIGHTNESS_MAX,
      DEFAULT_BACKGROUND.brightness
    ),
    overlay: clampUnit(value?.overlay, DEFAULT_BACKGROUND.overlay),
    overlayColor: normalizeDarkUiHexColor(value?.overlayColor, DEFAULT_BACKGROUND.overlayColor)
  }
}

/**
 * Merge a partial background patch over the current background settings. Image
 * edits keep the copied `imagePath` unless a new path (or an explicit empty
 * string) is supplied, so switching type never silently drops the stored image.
 */
export function mergeBackgroundSettings(
  current?: AppBackgroundSettingsPatchV1 | null,
  patch?: AppBackgroundSettingsPatchV1
): AppBackgroundSettingsV1 {
  if (!patch) return normalizeBackgroundSettings(current)
  return normalizeBackgroundSettings({ ...current, ...patch })
}
