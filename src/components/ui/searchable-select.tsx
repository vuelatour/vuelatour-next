"use client";

import { useMemo } from "react";
import { ChevronUpDownIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { cn } from "@/lib/utils";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Select con buscador (Combobox de base-ui). API simple: pasa options +
 * value (string) + onChange (string). Renderiza descripción secundaria
 * si el option la define.
 *
 * Patrón visual: un Trigger que parece input ("button-as-select") y un
 * popup que contiene una caja "Buscar..." arriba + la lista debajo.
 *
 * Convención del proyecto: usar este componente para TODO dropdown del
 * admin. Nunca usar <select> nativo.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  className,
  disabled,
}: SearchableSelectProps) {
  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(item: SearchableSelectOption | null) => {
        if (item) onChange(item.value);
      }}
    >
      <ComboboxPrimitive.Trigger
        disabled={disabled}
        className={cn(
          "group/searchable-trigger flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none transition-colors",
          "data-[popup-open]:border-ring",
          "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-input/30",
          className,
        )}
      >
        <span
          className={cn(
            "truncate text-left",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      </ComboboxPrimitive.Trigger>

      <ComboboxContent>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <MagnifyingGlassIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <ComboboxPrimitive.Input
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: SearchableSelectOption) => (
            <ComboboxItem value={item} key={item.value} disabled={item.disabled}>
              {/* min-w-0 + truncate: si la opción excede el tope del popup,
                  corta con elipsis en vez de desbordar o partirse. */}
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{item.label}</span>
                {item.description && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {item.description}
                  </span>
                )}
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
