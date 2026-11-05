import {
  APP_BACKGROUND_FITS,
  APP_BACKGROUND_TYPES,
  BACKGROUND_ANGLE_MAX,
  GLASS_BRIGHTNESS_MAX,
  GLASS_BRIGHTNESS_MIN,
  normalizeBackgroundSettings,
  type AppBackgroundFit,
  type AppBackgroundSettingsPatchV1,
  type AppBackgroundSettingsV1,
  type AppBackgroundType
} from '@shared/app-settings'
import { useState, type ReactElement } from 'react'
import { pathToFileUrl } from '../lib/apply-appearance'
import { HexColorControl } from './settings-color-controls'
import { SettingRow, SettingsCard, SettingsReveal } from './settings-controls'
import { PercentSlider, ScaleControl } from './settings-scale-control'

type Translate = (key: string, values?: Record<string, unknown>) => string

const selectClass =
  'h-9 min-w-0 rounded-lg border border-ds-border bg-ds-card px-3 text-[13px] text-ds-ink focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30'

function typeLabel(t: Translate, type: AppBackgroundType): string {
  if (type === 'solid') return t('settingsIaBgSolid')
  if (type === 'gradient') return t('settingsIaBgGradient')
  if (type === 'image') return t('settingsIaBgImage')
  return t('settingsIaBgDefault')
}

function fitLabel(t: Translate, fit: AppBackgroundFit): string {
  if (fit === 'contain') return t('settingsIaBgFitContain')
  if (fit === 'center') return t('settingsIaBgFitCenter')
  if (fit === 'tile') return t('settingsIaBgFitTile')
  return t('settingsIaBgFitCover')
}

export function BackgroundSettingsCard({
  background,
  t,
  onChange
}: {
  background?: AppBackgroundSettingsV1
  t: Translate
  onChange: (patch: AppBackgroundSettingsPatchV1) => void
}): ReactElement {
  const value = normalizeBackgroundSettings(background)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickImage = async (): Promise<void> => {
    if (typeof window.kunGui?.pickAppBackgroundImage !== 'function') {
      setError(t('settingsIaBgImageUnavailable'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const picked = await window.kunGui.pickAppBackgroundImage(value.imagePath || undefined)
      if (picked.canceled) return
      if (!picked.ok) {
        setError(picked.message ?? t('settingsIaBgImageFailed'))
        return
      }
      onChange({ type: 'image', imagePath: picked.path ?? '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const removeImage = async (): Promise<void> => {
    const previous = value.imagePath
    onChange({ type: 'default', imagePath: '' })
    if (previous && typeof window.kunGui?.removeAppBackgroundImage === 'function') {
      try {
        await window.kunGui.removeAppBackgroundImage(previous)
      } catch {
        // Best effort: the stored copy is orphaned but harmless.
      }
    }
  }

  const imageUrl = value.imagePath ? pathToFileUrl(value.imagePath) : ''

  return (
    <SettingsCard title={t('settingsIaBgCard')} description={t('settingsIaBgCardDesc')}>
      <div className="flex flex-wrap gap-2 px-3 py-2">
        {APP_BACKGROUND_TYPES.map((type) => {
          const checked = value.type === type
          return (
            <button
              key={type}
              type="button"
              aria-pressed={checked}
              onClick={() => (type === 'image' ? void pickImage() : onChange({ type }))}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                checked
                  ? 'border-transparent bg-[var(--ds-control)] text-[var(--ds-control-foreground)]'
                  : 'border-ds-border bg-ds-card text-ds-muted hover:bg-ds-hover hover:text-ds-ink'
              }`}
            >
              {typeLabel(t, type)}
            </button>
          )
        })}
      </div>

      <SettingsReveal open={value.type === 'solid'}>
        <SettingRow
          title={t('settingsIaBgSolid')}
          control={
            <div className="w-full md:max-w-xs">
              <HexColorControl
                value={value.solidColor}
                ariaLabel={t('settingsIaBgSolid')}
                onChange={(solidColor) => onChange({ solidColor })}
              />
            </div>
          }
        />
      </SettingsReveal>

      <SettingsReveal open={value.type === 'gradient'}>
        <div className="grid gap-1 px-3 py-2">
          <SettingRow
            title={t('settingsIaBgGradientFrom')}
            control={
              <div className="w-full md:max-w-xs">
                <HexColorControl
                  value={value.gradientFrom}
                  ariaLabel={t('settingsIaBgGradientFrom')}
                  onChange={(gradientFrom) => onChange({ gradientFrom })}
                />
              </div>
            }
          />
          <SettingRow
            title={t('settingsIaBgGradientTo')}
            control={
              <div className="w-full md:max-w-xs">
                <HexColorControl
                  value={value.gradientTo}
                  ariaLabel={t('settingsIaBgGradientTo')}
                  onChange={(gradientTo) => onChange({ gradientTo })}
                />
              </div>
            }
          />
          <SettingRow
            title={t('settingsIaBgGradientAngle')}
            control={
              <ScaleControl
                label={t('settingsIaBgGradientAngle')}
                min={0}
                max={BACKGROUND_ANGLE_MAX}
                step={5}
                value={value.gradientAngle}
                displayValue={Math.round(value.gradientAngle)}
                unit="°"
                minGlyph="0°"
                maxGlyph="360°"
                decreaseLabel={t('settingsIaBgGradientAngle')}
                increaseLabel={t('settingsIaBgGradientAngle')}
                bigStep={15}
                onChange={(gradientAngle) => onChange({ gradientAngle })}
                onDisplayChange={(gradientAngle) => onChange({ gradientAngle })}
              />
            }
          />
          <SettingRow
            title={t('settingsIaBgMotion')}
            description={t('settingsIaBgMotionDesc')}
            control={
              <select
                className={selectClass}
                aria-label={t('settingsIaBgMotion')}
                value={value.motion}
                onChange={(event) => onChange({ motion: event.target.value === 'drift' ? 'drift' : 'off' })}
              >
                <option value="off">{t('settingsIaBgMotionOff')}</option>
                <option value="drift">{t('settingsIaBgMotionDrift')}</option>
              </select>
            }
          />
        </div>
      </SettingsReveal>

      <SettingsReveal open={value.type === 'image'}>
        <div className="grid gap-3 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-ds-border bg-ds-main/40">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-[11px] text-ds-faint">
                  {t('settingsIaBgNoImage')}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void pickImage()} className="rounded-lg border border-ds-border bg-ds-card px-3 py-1.5 text-[12.5px] font-medium text-ds-ink transition hover:bg-ds-hover disabled:opacity-60">
                {busy ? t('settingsIaBgImagePicking') : imageUrl ? t('settingsIaBgImageChange') : t('settingsIaBgImageChoose')}
              </button>
              {imageUrl ? (
                <button type="button" disabled={busy} onClick={() => void removeImage()} className="rounded-lg border border-ds-border bg-ds-card px-3 py-1.5 text-[12.5px] font-medium text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink disabled:opacity-60">
                  {t('settingsIaBgImageRemove')}
                </button>
              ) : null}
            </div>
          </div>
          {error ? <p role="alert" className="text-[12px] text-ds-danger">{error}</p> : null}
          <SettingRow
            title={t('settingsIaBgFit')}
            control={
              <select
                className={selectClass}
                aria-label={t('settingsIaBgFit')}
                value={value.fit}
                onChange={(event) => onChange({ fit: event.target.value as AppBackgroundFit })}
              >
                {APP_BACKGROUND_FITS.map((fit) => (
                  <option key={fit} value={fit}>{fitLabel(t, fit)}</option>
                ))}
              </select>
            }
          />
          <SettingRow
            title={t('settingsIaBgBrightness')}
            control={
              <ScaleControl
                label={t('settingsIaBgBrightness')}
                min={GLASS_BRIGHTNESS_MIN}
                max={GLASS_BRIGHTNESS_MAX}
                step={0.05}
                value={value.brightness}
                displayValue={Math.round(value.brightness * 100)}
                unit="%"
                minGlyph="−"
                maxGlyph="+"
                decreaseLabel={t('settingsIaBgBrightness')}
                increaseLabel={t('settingsIaBgBrightness')}
                bigStep={0.1}
                onChange={(brightness) => onChange({ brightness })}
                onDisplayChange={(percent) => onChange({ brightness: percent / 100 })}
              />
            }
          />
          <SettingRow
            title={t('settingsIaBgOverlay')}
            description={t('settingsIaBgOverlayDesc')}
            control={<PercentSlider label={t('settingsIaBgOverlay')} value={value.overlay} onChange={(overlay) => onChange({ overlay })} />}
          />
          <SettingRow
            title={t('settingsIaBgOverlayColor')}
            control={
              <div className="w-full md:max-w-xs">
                <HexColorControl
                  value={value.overlayColor}
                  ariaLabel={t('settingsIaBgOverlayColor')}
                  onChange={(overlayColor) => onChange({ overlayColor })}
                />
              </div>
            }
          />
        </div>
      </SettingsReveal>
    </SettingsCard>
  )
}
