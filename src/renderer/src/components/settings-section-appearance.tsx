import type { AppSettingsV1, AppearancePresetV1 } from '@shared/app-settings'
import {
  builtinThemePresets,
  CHAT_CONTENT_MAX_WIDTH_MAX,
  CHAT_CONTENT_MAX_WIDTH_MIN,
  createPreset,
  deletePreset,
  duplicatePreset,
  normalizeChatContentMaxWidth,
  normalizeThemePresets,
  normalizeUiFontScale,
  presetLookToPatch,
  renamePreset,
  snapshotCurrentLook,
  UI_FONT_SCALE_MAX,
  UI_FONT_SCALE_MIN
} from '@shared/app-settings'
import { Check } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { SettingRow, SettingsCard, SettingsReveal, Toggle } from './settings-controls'
import { SpotlightColorControl } from './settings-color-controls'
import { ColorPaletteSettingsCard } from './settings-color-palette-card'
import { ScaleControl } from './settings-scale-control'
import { GlassmorphismSettingsCard } from './settings-glassmorphism-card'
import { BackgroundSettingsCard } from './settings-background-card'
import { ThemePresetGallery } from './settings-theme-preset-gallery'

type ThemeChoice = AppSettingsV1['theme']

const THEME_CHOICES: Array<{ value: ThemeChoice; labelKey: string }> = [
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
  { value: 'system', labelKey: 'themeSystem' }
]

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function newPresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Theme, presets, glass, background, text and colour: everything that changes how Kun looks. */
export function AppearanceSettingsSection({ ctx }: { ctx: Record<string, any> }): ReactElement {
  const { t, form, update } = ctx
  const [presetBusy, setPresetBusy] = useState(false)

  const fontScale = normalizeUiFontScale(form.uiFontScale)
  const setFontScale = (value: number): void => update({ uiFontScale: normalizeUiFontScale(value) })
  const chatWidth = normalizeChatContentMaxWidth(form.chatContentMaxWidthPx)
  const setChatWidth = (value: number): void =>
    update({ chatContentMaxWidthPx: normalizeChatContentMaxWidth(value) })
  const spotlightOn = form.cursorSpotlight !== false

  const dark = form.theme === 'dark' || (form.theme === 'system' && systemPrefersDark())
  const userPresets: AppearancePresetV1[] = normalizeThemePresets(form.themePresets)
  const galleryPresets: AppearancePresetV1[] = [...builtinThemePresets(), ...userPresets]

  const applyPreset = (preset: AppearancePresetV1): void => {
    update({ ...presetLookToPatch(preset.look), activePresetId: preset.id })
  }

  const saveCurrentAsPreset = (): void => {
    const look = snapshotCurrentLook({
      theme: form.theme,
      colorPalette: form.colorPalette,
      darkUiColors: form.darkUiColors,
      glass: form.glass,
      background: form.background,
      uiFontScale: form.uiFontScale
    })
    const id = newPresetId()
    const preset = createPreset(id, `${t('settingsIaPresetUntitled')} ${userPresets.length + 1}`, look)
    update({ themePresets: [...userPresets, preset], activePresetId: id })
  }

  const duplicateExistingPreset = (preset: AppearancePresetV1): void => {
    const id = newPresetId()
    const next = duplicatePreset(userPresets, preset.id, id, `${preset.name} ${t('settingsIaPresetCopySuffix')}`)
    update({ themePresets: next, activePresetId: id })
  }

  const renameExistingPreset = (preset: AppearancePresetV1): void => {
    if (typeof window.prompt !== 'function') return
    const name = window.prompt(t('settingsIaPresetRenamePrompt'), preset.name)
    if (name === null) return
    update({ themePresets: renamePreset(userPresets, preset.id, name) })
  }

  const deleteExistingPreset = async (preset: AppearancePresetV1): Promise<void> => {
    setPresetBusy(true)
    try {
      const confirmed = typeof window.kunGui?.confirmDialog === 'function'
        ? await window.kunGui.confirmDialog({
            message: t('settingsIaPresetDeleteTitle'),
            detail: t('settingsIaPresetDeleteDesc', { name: preset.name }),
            confirmLabel: t('settingsIaPresetDelete'),
            cancelLabel: t('settingsIaPresetCancel')
          })
        : true
      if (!confirmed) return
      const activeCleared = form.activePresetId === preset.id ? { activePresetId: '' } : {}
      update({ themePresets: deletePreset(userPresets, preset.id), ...activeCleared })
    } finally {
      setPresetBusy(false)
    }
  }

  return (
    <>
      <SettingsCard title={t('theme')} description={t('themeDesc')}>
        <div className="ds-settings-option-grid" role="radiogroup" aria-label={t('theme')}>
          {THEME_CHOICES.map((choice) => {
            const checked = form.theme === choice.value
            return (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={checked}
                data-theme-choice={choice.value}
                className="ds-settings-option"
                onClick={() => update({ theme: choice.value })}
              >
                <span className="ds-settings-theme-thumb" data-theme-preview={choice.value} aria-hidden="true">
                  <span className="ds-settings-theme-thumb-side" />
                  <span className="ds-settings-theme-thumb-main">
                    <span className="ds-settings-theme-thumb-bar w-3/5" />
                    <span className="ds-settings-theme-thumb-bar w-5/6" />
                    <span className="ds-settings-theme-thumb-bar w-2/5" />
                  </span>
                </span>
                <span className="ds-settings-option-title">{t(choice.labelKey)}</span>
                <span className="ds-settings-option-check" aria-hidden="true">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </button>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard title={t('settingsIaPresetCard')} description={t('settingsIaPresetCardDesc')}>
        <ThemePresetGallery
          presets={galleryPresets}
          activeId={form.activePresetId ?? ''}
          dark={dark}
          t={t}
          onApply={applyPreset}
          onSaveCurrent={presetBusy ? () => undefined : saveCurrentAsPreset}
          onDuplicate={duplicateExistingPreset}
          onRename={renameExistingPreset}
          onDelete={(preset) => void deleteExistingPreset(preset)}
        />
      </SettingsCard>

      <ColorPaletteSettingsCard
        form={form}
        t={t}
        onChange={(colorPalette) => update({ colorPalette })}
        onDarkUiColorsChange={(darkUiColors) => update({ darkUiColors })}
      />

      <GlassmorphismSettingsCard
        glass={form.glass}
        t={t}
        onChange={(glass) => update({ glass })}
      />

      <BackgroundSettingsCard
        background={form.background}
        t={t}
        onChange={(background) => update({ background })}
      />

      <SettingsCard title={t('settingsIaTextLayoutCard')}>
        <SettingRow
          title={t('fontScale')}
          description={t('fontScaleDesc')}
          control={
            <ScaleControl
              label={t('fontScale')}
              min={UI_FONT_SCALE_MIN}
              max={UI_FONT_SCALE_MAX}
              step={0.01}
              value={fontScale}
              displayValue={Math.round(fontScale * 100)}
              unit="%"
              minGlyph="A"
              maxGlyph={<span className="text-[18px]">A</span>}
              decreaseLabel={t('fontScaleSmall')}
              increaseLabel={t('fontScaleLarge')}
              bigStep={0.05}
              onChange={setFontScale}
              onDisplayChange={(percent) => setFontScale(percent / 100)}
            />
          }
        />
        <SettingRow
          title={t('chatContentMaxWidth')}
          description={t('chatContentMaxWidthDesc')}
          control={
            <ScaleControl
              label={t('chatContentMaxWidth')}
              min={CHAT_CONTENT_MAX_WIDTH_MIN}
              max={CHAT_CONTENT_MAX_WIDTH_MAX}
              step={8}
              value={chatWidth}
              displayValue={chatWidth}
              unit="px"
              minGlyph={t('chatContentMaxWidthNarrow')}
              maxGlyph={t('chatContentMaxWidthWide')}
              decreaseLabel={t('chatContentMaxWidthDecrease')}
              increaseLabel={t('chatContentMaxWidthIncrease')}
              bigStep={32}
              onChange={setChatWidth}
              onDisplayChange={setChatWidth}
            />
          }
        />
      </SettingsCard>

      <SettingsCard>
        <SettingRow
          title={t('cursorSpotlight')}
          description={t('cursorSpotlightDesc')}
          control={
            <Toggle
              checked={spotlightOn}
              onChange={(enabled) => update({ cursorSpotlight: enabled })}
            />
          }
        />
        <SettingsReveal open={spotlightOn}>
          <div className="px-3 py-3.5">
            <SpotlightColorControl
              color={form.cursorSpotlightColor}
              disabled={!spotlightOn}
              t={t}
              onChange={(color) => update({ cursorSpotlightColor: color })}
            />
          </div>
        </SettingsReveal>
        <SettingRow
          title={t('homeGlyphRipple')}
          description={t('homeGlyphRippleDesc')}
          control={
            <Toggle
              checked={form.homeGlyphRipple !== false}
              onChange={(enabled) => update({ homeGlyphRipple: enabled })}
            />
          }
        />
      </SettingsCard>

    </>
  )
}
