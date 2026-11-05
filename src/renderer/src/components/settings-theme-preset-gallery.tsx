import type { AppearancePresetV1, AppearanceLookV1 } from '@shared/app-settings'
import { Check } from 'lucide-react'
import type { ReactElement, CSSProperties } from 'react'
import { findColorPalettePreset, customPaletteSwatches } from '../lib/color-palettes'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** A small live-ish thumbnail built from the preset's palette + background + glass. */
function PresetPreview({ look, dark, t }: { look: AppearanceLookV1; dark: boolean; t: Translate }): ReactElement {
  const palette = look.colorPalette
  const swatch = palette && palette.id !== 'custom'
    ? findColorPalettePreset(palette.id)?.[dark ? 'dark' : 'light'] ?? null
    : palette
      ? customPaletteSwatches(palette, look.darkUiColors)[dark ? 'dark' : 'light']
      : null
  const bg = look.background
  let backgroundStyle: CSSProperties = {}
  if (bg?.type === 'solid') backgroundStyle = { background: bg.solidColor }
  else if (bg?.type === 'gradient') backgroundStyle = { backgroundImage: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom}, ${bg.gradientTo})` }
  const tint = look.glass?.enabled ? look.glass.tint : null
  return (
    <span
      className="ds-settings-palette-preview"
      aria-hidden="true"
      style={{
        background: swatch ? swatch.bg : dark ? '#181818' : '#fcfcfd',
        borderColor: swatch ? swatch.border : '#e7e9ee',
        ...backgroundStyle
      }}
    >
      <span
        className="flex w-[30%] flex-col gap-1.5 border-r px-2 py-2.5"
        style={{
          background: tint ? `${tint}bb` : swatch ? swatch.side : dark ? '#181818' : '#f5f6f8',
          borderColor: swatch ? swatch.border : '#e7e9ee'
        }}
      >
        <span className="block h-[5px] w-[70%] rounded-full" style={{ background: swatch ? swatch.text : '#20242d', opacity: 0.7 }} />
        <span className="block h-[5px] w-[55%] rounded-full" style={{ background: swatch ? swatch.accent : '#5b78ff' }} />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-2.5">
        <span className="self-end rounded-lg px-2 py-[5px]" style={{ background: swatch ? swatch.bubble : '#f5f7fb' }}>
          <span className="block h-[5px] w-[2.75rem] rounded-full" style={{ background: swatch ? swatch.bubbleFg : '#20242d', opacity: 0.7 }} />
        </span>
        <span className="block h-[5px] w-[92%] rounded-full" style={{ background: swatch ? swatch.text : '#20242d', opacity: 0.6 }} />
        <span className="mt-auto block h-[5px] w-[60%] rounded-full" style={{ background: swatch ? swatch.muted : '#687083', opacity: 0.5 }} />
      </span>
      {look.glass?.enabled ? (
        <span className="absolute right-1 top-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] font-medium text-white">
          {t('settingsIaGlassBadge')}
        </span>
      ) : null}
    </span>
  )
}

export function ThemePresetGallery({
  presets,
  activeId,
  dark,
  t,
  onApply,
  onSaveCurrent,
  onDuplicate,
  onRename,
  onDelete
}: {
  presets: AppearancePresetV1[]
  activeId: string
  dark: boolean
  t: Translate
  onApply: (preset: AppearancePresetV1) => void
  onSaveCurrent: () => void
  onDuplicate: (preset: AppearancePresetV1) => void
  onRename: (preset: AppearancePresetV1) => void
  onDelete: (preset: AppearancePresetV1) => void
}): ReactElement {
  return (
    <div className="ds-settings-palette-grid" role="group" aria-label={t('settingsIaPresetCard')}>
      {presets.map((preset) => {
        const active = preset.id === activeId
        return (
          <div
            key={preset.id}
            data-theme-preset={preset.id}
            className={`relative flex flex-col gap-2 rounded-2xl border p-3 text-left transition ${
              active ? 'border-accent ring-1 ring-accent/30' : 'border-ds-border hover:bg-ds-hover/60'
            }`}
          >
            <button type="button" className="block w-full text-left" onClick={() => onApply(preset)}>
              <span className="relative block">
                <PresetPreview look={preset.look} dark={dark} t={t} />
              </span>
              <span className="mt-2 flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-ds-ink">{preset.name}</span>
                {preset.builtIn ? (
                  <span className="shrink-0 rounded-full bg-ds-main px-1.5 py-0.5 text-[10px] text-ds-muted">{t('settingsIaPresetBuiltIn')}</span>
                ) : null}
              </span>
            </button>
            {active ? (
              <span className="ds-settings-option-check" aria-hidden="true">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <button type="button" className="rounded-md px-1.5 py-1 text-ds-muted hover:bg-ds-hover hover:text-ds-ink" onClick={() => onDuplicate(preset)}>
                {t('settingsIaPresetDuplicate')}
              </button>
              {preset.builtIn ? null : (
                <>
                  <button type="button" className="rounded-md px-1.5 py-1 text-ds-muted hover:bg-ds-hover hover:text-ds-ink" onClick={() => onRename(preset)}>
                    {t('settingsIaPresetRename')}
                  </button>
                  <button type="button" className="rounded-md px-1.5 py-1 text-ds-danger hover:bg-ds-danger-soft" onClick={() => onDelete(preset)}>
                    {t('settingsIaPresetDelete')}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
      <button
        type="button"
        onClick={onSaveCurrent}
        className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ds-border text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink"
      >
        <span className="text-[20px] leading-none">+</span>
        <span className="text-[12.5px] font-medium">{t('settingsIaPresetSaveCurrent')}</span>
      </button>
    </div>
  )
}
