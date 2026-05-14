"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Select con buscador (Combobox de base-ui). API simple: pasa options +
 * value (string) + onChange (string). Renderiza descripción secundaria
 * si el option la define.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
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
      <ComboboxInput
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        readOnly
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: SearchableSelectOption) => (
            <ComboboxItem value={item} key={item.value}>
              <div className="flex flex-col">
                <span>{item.label}</span>
                {item.description && (
                  <span className="text-[10px] text-muted-foreground">
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
