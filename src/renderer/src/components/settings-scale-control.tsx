import type { ReactElement } from 'react'

const stepperButtonClass =
  'flex h-7 w-7 items-center justify-center text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink'

/** A slider with a precise numeric field and ± steps; shared by font size, text width, and blur. */
export function ScaleControl({
  label,
  min,
  max,
  step,
  value,
  displayValue,
  unit,
  minGlyph,
  maxGlyph,
  decreaseLabel,
  increaseLabel,
  bigStep,
  disabled = false,
  onChange,
  onDisplayChange
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  displayValue: number
  unit: string
  minGlyph: ReactElement | string
  maxGlyph: ReactElement | string
  decreaseLabel: string
  increaseLabel: string
  bigStep: number
  disabled?: boolean
  onChange: (value: number) => void
  onDisplayChange: (value: number) => void
}): ReactElement {
  return (
    <div className={`flex w-full min-w-0 items-center gap-3 md:max-w-md ${disabled ? 'opacity-50' : ''}`}>
      <span className="shrink-0 text-[12px] leading-none text-ds-faint" aria-hidden="true">{minGlyph}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        disabled={disabled}
        className="w-full accent-accent disabled:cursor-not-allowed"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="shrink-0 text-[12px] leading-none text-ds-faint" aria-hidden="true">{maxGlyph}</span>
      <div className="inline-flex shrink-0 items-center overflow-hidden rounded-lg border border-ds-border bg-ds-card">
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={disabled}
          className={`${stepperButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => onChange(value - bigStep)}
        >
          −
        </button>
        <div className="flex h-7 min-w-[3.75rem] items-center justify-center border-x border-ds-border px-1.5 tabular-nums">
          <input
            type="number"
            value={displayValue}
            aria-label={label}
            disabled={disabled}
            className="hide-number-spinner w-10 border-0 bg-transparent p-0 text-center text-[13px] font-medium text-ds-ink outline-none disabled:opacity-60"
            onChange={(e) => onDisplayChange(Number(e.target.value))}
          />
          <span className="text-[11px] text-ds-faint">{unit}</span>
        </div>
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={disabled}
          className={`${stepperButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => onChange(value + bigStep)}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** A compact percentage slider (0..1) for glass intensity and background scrim. */
export function PercentSlider({
  label,
  value,
  disabled = false,
  onChange
}: {
  label: string
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}): ReactElement {
  const percent = Math.round(value * 100)
  return (
    <div className={`flex w-full min-w-0 items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label={label}
        disabled={disabled}
        className="w-full accent-accent md:max-w-xs disabled:cursor-not-allowed"
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-ds-muted">{percent}%</span>
    </div>
  )
}
