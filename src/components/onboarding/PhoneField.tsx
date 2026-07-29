import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES, splitPhone } from "./country-codes";

/**
 * Country-code selector + local number. The answer is stored as one string ("+91 98765 43210")
 * so nothing downstream has to know the field is composite.
 */
export function PhoneField({
  id,
  value,
  placeholder,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  const { country, number } = useMemo(() => splitPhone(value), [value]);

  const emit = (dial: string, local: string) => {
    const cleaned = local.replace(/[^\d\s-]/g, "").trim();
    onChange(cleaned ? `${dial} ${cleaned}` : "");
  };

  return (
    <div className="flex gap-2">
      <Select
        value={country.code}
        onValueChange={(code) => {
          const next = COUNTRIES.find((c) => c.code === code);
          if (next) emit(next.dial, number);
        }}
      >
        <SelectTrigger
          aria-label="Country code"
          className="w-[7.5rem] shrink-0 bg-white/80 tabular-nums dark:bg-slate-900/60"
        >
          <SelectValue>
            <span className="flex items-center gap-1.5">
              <span aria-hidden>{country.flag}</span>
              <span>{country.dial}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-2">
                <span aria-hidden>{c.flag}</span>
                <span>{c.name}</span>
                <span className="text-muted-foreground tabular-nums">{c.dial}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder ?? "98765 43210"}
        value={number}
        onChange={(e) => emit(country.dial, e.target.value)}
        className={[
          "h-10 w-full rounded-lg border bg-white/80 px-3 text-sm tabular-nums shadow-sm transition-all",
          "placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30",
          "dark:bg-slate-900/60",
          invalid ? "border-red-400 focus:border-red-400" : "border-input focus:border-primary",
        ].join(" ")}
      />
    </div>
  );
}
