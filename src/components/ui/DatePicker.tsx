"use client";

import { useState } from "react";
import { DayPicker, type DateRange as DayRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fieldBase } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Button } from "./Button";

// Datas trafegam como string ISO (YYYY-MM-DD) — o mesmo formato das
// colunas date do banco. O calendário é estilizado só com tokens (sem o
// CSS padrão do react-day-picker).

function toIso(date: Date | undefined): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromIso(value: string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatBr(value: string | undefined | null): string {
  const date = fromIso(value);
  return date ? date.toLocaleDateString("pt-BR") : "";
}

const calendarClassNames = {
  root: "text-sm",
  months: "flex flex-col gap-4 sm:flex-row",
  month: "flex flex-col gap-2",
  month_caption: "flex h-8 items-center justify-center text-sm font-medium capitalize",
  nav: "absolute top-3 right-3 left-3 flex items-center justify-between",
  button_previous: "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground",
  button_next: "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground",
  weekdays: "flex",
  weekday: "w-8 text-center text-2xs font-medium text-subtle-foreground uppercase",
  week: "flex",
  day: "h-8 w-8 p-0 text-center",
  day_button:
    "h-8 w-8 rounded-sm tabular-nums hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring",
  today: "font-semibold text-foreground [&>button]:underline [&>button]:underline-offset-4",
  outside: "text-subtle-foreground/60",
  disabled: "opacity-40",
  range_middle: "[&>button]:!bg-muted [&>button]:!text-foreground",
  selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover",
};

function CalendarNav({ orientation }: { orientation?: "left" | "right" | "up" | "down" }) {
  return orientation === "left" ? <ChevronLeft size={15} /> : <ChevronRight size={15} />;
}

type DatePickerProps = {
  value: string | undefined | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
};

export function DatePicker({ value, onChange, placeholder = "dd/mm/aaaa", disabled, invalid, id, className, ...aria }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          data-invalid={invalid || undefined}
          aria-describedby={aria["aria-describedby"]}
          className={cn(fieldBase, "flex h-8 items-center gap-2 px-2.5 text-left tabular-nums data-[invalid]:border-danger", className)}
        >
          <CalendarDays size={14} className="shrink-0 text-subtle-foreground" />
          <span className={cn("flex-1 truncate", !value && "text-subtle-foreground")}>{value ? formatBr(value) : placeholder}</span>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar data"
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
              }}
              className="rounded-xs p-0.5 text-subtle-foreground hover:text-foreground"
            >
              <X size={12} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="relative w-auto p-3">
        <DayPicker
          mode="single"
          locale={ptBR}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(toIso(date));
            setOpen(false);
          }}
          classNames={calendarClassNames}
          components={{ Chevron: CalendarNav }}
        />
      </PopoverContent>
    </Popover>
  );
}

export type DateRangeValue = { from: string; to: string };

type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  presets?: Array<{ label: string; range: DateRangeValue }>;
  className?: string;
  id?: string;
};

export function DateRangePicker({ value, onChange, presets = [], className, id }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const range: DayRange | undefined = value.from ? { from: fromIso(value.from), to: fromIso(value.to) } : undefined;
  const label = value.from ? `${formatBr(value.from)} – ${value.to ? formatBr(value.to) : "…"}` : "Período";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={cn(fieldBase, "flex h-8 w-auto items-center gap-2 px-2.5 text-left tabular-nums", className)}>
          <CalendarDays size={14} className="shrink-0 text-subtle-foreground" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="relative w-auto p-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          {presets.length > 0 && (
            <div className="flex flex-row flex-wrap gap-1 border-border sm:w-36 sm:flex-col sm:border-r sm:pr-3">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="xs"
                  className="justify-start"
                  onClick={() => {
                    onChange(preset.range);
                    setOpen(false);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <DayPicker
            mode="range"
            locale={ptBR}
            selected={range}
            defaultMonth={range?.from}
            numberOfMonths={1}
            onSelect={(next) => onChange({ from: toIso(next?.from), to: toIso(next?.to) })}
            classNames={calendarClassNames}
            components={{ Chevron: CalendarNav }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
