import { forwardRef, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';

interface InlineLocationSearchInputProps {
  roleLabel: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

const InlineLocationSearchInput = forwardRef<HTMLInputElement, InlineLocationSearchInputProps>(function InlineLocationSearchInput(
  {
    roleLabel,
    value,
    placeholder,
    onChange,
    onKeyDown,
  },
  ref,
) {
  return (
    <div className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-sky-300/60 bg-slate-950/90 px-2 text-left shadow-[0_0_0_1px_rgba(56,189,248,0.12)]">
      <Search className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
      <label className="shrink-0 text-[11px] font-semibold leading-none text-slate-400" htmlFor={`scenario-${roleLabel.toLowerCase()}-search`}>
        {roleLabel}:
      </label>
      <input
        ref={ref}
        id={`scenario-${roleLabel.toLowerCase()}-search`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold leading-none text-slate-100 outline-none placeholder:text-slate-600"
        placeholder={placeholder}
        autoComplete="off"
        aria-label={`Search ${roleLabel.toLowerCase()} location`}
      />
    </div>
  );
});

export default InlineLocationSearchInput;
