"use client";

import { useId, useState, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

/** The Figma "Input in" / "Select in" box. */
export const controlClass =
  "h-11.5 w-full rounded-lg border border-field bg-inset px-3.5 text-14 font-semibold text-ink placeholder:font-normal placeholder:text-ink-4 aria-invalid:border-high-bar";

export function Field({ id, label, hint, error, children, className }: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-13 leading-17 font-medium text-ink-2">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-12 leading-15 text-high">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-12 leading-15 text-ink-4">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SelectField({ id, value, onChange, options, placeholder, disabled, invalid, describedBy, className }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label?: string }[];
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(controlClass, "data-[size=default]:h-11.5 [&>span]:truncate data-placeholder:font-normal data-placeholder:text-ink-4", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80 border border-line bg-surface">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="py-2 text-13 text-ink-2 focus:bg-chip focus:text-ink">
            {o.label ?? o.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Searchable single choice from a long list (companies). */
export function ComboboxField({ id, value, onChange, options, placeholder, searchPlaceholder, allLabel, invalid, describedBy }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  /** When set, an extra first choice that clears the value ("All companies"). */
  allLabel?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(controlClass, "flex items-center justify-between gap-2 text-left", !value && !allLabel && "font-normal text-ink-4")}
        >
          <span className="truncate">{value || allLabel || placeholder}</span>
          <Icon name="chevron-down" className="h-1.5 w-2.5 text-ink" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 border border-line bg-surface p-1">
        <Command className="bg-surface">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList id={listId} className="max-h-72">
            <CommandEmpty className="py-6 text-center text-13 text-ink-3">No match.</CommandEmpty>
            <CommandGroup>
              {allLabel && (
                <CommandItem value={`__all__ ${allLabel}`} onSelect={() => choose("")} className="text-13 text-ink-2">
                  <CheckIcon className={cn("size-3.5", value ? "opacity-0" : "opacity-100")} />
                  {allLabel}
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => choose(option)} className="text-13 text-ink-2">
                  <CheckIcon className={cn("size-3.5", value === option ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
