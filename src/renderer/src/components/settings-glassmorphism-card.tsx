import {
  GLASS_BLUR_MAX,
  normalizeGlassSettings,
  type GlassmorphismSettingsPatchV1,
  type GlassmorphismSettingsV1
} from '@shared/app-settings'
import type { ReactElement } from 'react'
import { HexColorControl } from './settings-color-controls'
import { SettingRow, SettingsCard, SettingsReveal, Toggle } from './settings-controls'
import { PercentSlider, ScaleControl } from './settings-scale-control'

type Translate = (key: string, values?: Record<string, unknown>) => string

export function GlassmorphismSettingsCard({
  glass,
  t,
  onChange
}: {
  glass?: GlassmorphismSettingsV1
  t: Translate
  onChange: (patch: GlassmorphismSettingsPatchV1) => void
}): ReactElement {
  const value = normalizeGlassSettings(glass)
  const on = value.enabled

  return (
    <SettingsCard title={t('settingsIaGlassCard')} description={t('settingsIaGlassCardDesc')}>
      <SettingRow
        title={t('settingsIaGlassEnable')}
        description={t('settingsIaGlassEnableDesc')}
        control={<Toggle checked={on} onChange={(enabled) => onChange({ enabled })} />}
      />
      <SettingsReveal open={on}>
        <div className="grid gap-1 px-3 py-2">
          <SettingRow
            title={t('settingsIaGlassBlur')}
            description={t('settingsIaGlassBlurDesc')}
            control={
              <ScaleControl
                label={t('settingsIaGlassBlur')}
                min={0}
                max={GLASS_BLUR_MAX}
                step={1}
                value={value.blurPx}
                displayValue={Math.round(value.blurPx)}
                unit="px"
                minGlyph={t('settingsIaGlassBlurClear')}
                maxGlyph={t('settingsIaGlassBlurFrosted')}
                decreaseLabel={t('settingsIaGlassBlurDecrease')}
                increaseLabel={t('settingsIaGlassBlurIncrease')}
                bigStep={2}
                onChange={(blurPx) => onChange({ blurPx })}
                onDisplayChange={(blurPx) => onChange({ blurPx })}
              />
            }
          />
          <SettingRow
            title={t('settingsIaGlassOpacity')}
            description={t('settingsIaGlassOpacityDesc')}
            control={
              <PercentSlider
                label={t('settingsIaGlassOpacity')}
                value={value.opacity}
                onChange={(opacity) => onChange({ opacity })}
              />
            }
          />
          <SettingRow
            title={t('settingsIaGlassTint')}
            description={t('settingsIaGlassTintDesc')}
            control={
              <div className="w-full md:max-w-xs">
                <HexColorControl
                  value={value.tint}
                  ariaLabel={t('settingsIaGlassTint')}
                  onChange={(tint) => onChange({ tint })}
                />
              </div>
            }
          />
          <SettingRow
            title={t('settingsIaGlassBorder')}
            description={t('settingsIaGlassBorderDesc')}
            control={
              <PercentSlider
                label={t('settingsIaGlassBorder')}
                value={value.borderIntensity}
                onChange={(borderIntensity) => onChange({ borderIntensity })}
              />
            }
          />
          <SettingRow
            title={t('settingsIaGlassShadow')}
            description={t('settingsIaGlassShadowDesc')}
            control={
              <PercentSlider
                label={t('settingsIaGlassShadow')}
                value={value.shadowIntensity}
                onChange={(shadowIntensity) => onChange({ shadowIntensity })}
              />
            }
          />
        </div>
      </SettingsReveal>
    </SettingsCard>
  )
}
