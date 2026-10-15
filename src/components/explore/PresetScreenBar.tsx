import { PRESET_SCREENS, getPresetScreen } from '@/lib/scoring';
import { cn } from '@/lib/utils';

export interface PresetScreenBarProps {
  /** Active preset id, or null for All. Unknown ids are treated as All. */
  value: string | null;
  onChange: (id: string | null) => void;
}

export function PresetScreenBar({ value, onChange }: PresetScreenBarProps) {
  const active = value ? getPresetScreen(value) : undefined;

  const pill = (selected: boolean) =>
    cn(
      'whitespace-nowrap rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
      selected
        ? 'border-neutral-900 bg-neutral-900 text-white'
        : 'border-border bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preset screens">
        <button type="button" className={pill(!active)} aria-pressed={!active} onClick={() => onChange(null)}>
          All
        </button>
        {PRESET_SCREENS.map((p) => (
          <button
            type="button"
            key={p.id}
            className={pill(active?.id === p.id)}
            aria-pressed={active?.id === p.id}
            onClick={() => onChange(p.id)}
            data-preset={p.id}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground" aria-live="polite">
        {active ? active.description : 'All stocks in the scanner, before any preset screen.'}
      </p>
    </div>
  );
}
