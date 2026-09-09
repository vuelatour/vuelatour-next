"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { ATTR_UI, fechaLegibleDeInput } from "@/lib/admin/quote-sheet";

/**
 * Campos INVISIBLES de la hoja editable (form-as-document, 8-sep-2026):
 * cada control se edita en el lugar exacto donde se imprime, con la misma
 * tipografía/tamaño/alineación del PDF (`font: inherit` + clase `cot-in`,
 * ver `styles/cotizacion-hoja-pantalla.css`). En reposo no hay borde, fondo
 * ni label — solo placeholder gris; el fondo aparece en hover y el borde del
 * token de foco al enfocar. Todos llevan `aria-label` y foco visible.
 *
 * Todos marcan su envoltorio con `data-cot-ui`: es CROMA de edición (no se
 * imprime); el test de estructura descarta esos subárboles al comparar la
 * hoja con el HTML del PDF. En `lectura` pintan el texto tal cual.
 */

/** Atributo que marca croma de edición (no impresa). */
export const UI = { [ATTR_UI]: "" } as const;

// ===== Texto de una línea, ancho = contenido =====

export interface CampoHojaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  lectura?: boolean;
  disabled?: boolean;
  id?: string;
  title?: string;
  className?: string;
  /** Alinea a la derecha (números). */
  derecha?: boolean;
  maxLength?: number;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  onEnter?: () => void;
  /** Ancho mínimo en `ch` (para que el placeholder no colapse). */
  minCh?: number;
}

export function CampoHoja({
  value,
  onChange,
  placeholder = "",
  ariaLabel,
  lectura = false,
  disabled = false,
  id,
  title,
  className,
  derecha = false,
  maxLength,
  inputMode,
  onEnter,
  minCh = 1,
}: CampoHojaProps) {
  if (lectura) return <>{value}</>;
  const espejo = value !== "" ? value : placeholder || " ";
  return (
    <span className={cn("cot-auto", className)} {...UI}>
      <span className="cot-auto__espejo" aria-hidden="true" style={{ minWidth: `${minCh}ch` }}>
        {espejo}
      </span>
      <input
        id={id}
        type="text"
        className={cn("cot-in", derecha && "cot-in--der")}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        maxLength={maxLength}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </span>
  );
}

// ===== Número: en reposo se ve FORMATEADO como el PDF; al enfocar, el crudo =====

export interface CampoNumeroProps {
  value: number | null;
  onChange: (v: number | null) => void;
  /** Cómo se pinta en reposo (p. ej. "1,650.00"). */
  formato: (n: number) => string;
  placeholder?: string;
  ariaLabel: string;
  lectura?: boolean;
  disabled?: boolean;
  id?: string;
  title?: string;
  className?: string;
  min?: number;
  max?: number;
  /** Entero (pasajeros, cantidad). */
  entero?: boolean;
  /** Texto de lectura cuando no hay valor. */
  vacioLectura?: string;
  minCh?: number;
  onEnter?: () => void;
}

function parseNumero(raw: string, entero: boolean): number | null | undefined {
  const t = raw.trim().replace(/,/g, "").replace(/^\$/, "");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return entero ? Math.trunc(n) : n;
}

export function CampoNumero({
  value,
  onChange,
  formato,
  placeholder = "",
  ariaLabel,
  lectura = false,
  disabled = false,
  id,
  title,
  className,
  min,
  max,
  entero = false,
  vacioLectura = "",
  minCh = 1,
  onEnter,
}: CampoNumeroProps) {
  // Borrador SOLO mientras el campo tiene foco: se ve lo tecleado ("25.");
  // fuera de foco se ve el número formateado como en el PDF.
  const [draft, setDraft] = useState<string | null>(null);
  if (lectura) return <>{value == null ? vacioLectura : formato(value)}</>;
  const texto = draft ?? (value == null ? "" : formato(value));
  const espejo = texto !== "" ? texto : placeholder || " ";
  const commit = (raw: string) => {
    setDraft(raw);
    const n = parseNumero(raw, entero);
    if (n === undefined) return; // no numérico: no se propaga
    if (n === null) {
      onChange(null);
      return;
    }
    let v = n;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    onChange(v);
  };
  return (
    <span className={cn("cot-auto", className)} {...UI}>
      <span className="cot-auto__espejo" aria-hidden="true" style={{ minWidth: `${minCh}ch` }}>
        {espejo}
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="cot-in cot-in--num"
        value={texto}
        placeholder={placeholder}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onFocus={() => setDraft(value == null ? "" : String(value))}
        onBlur={() => setDraft(null)}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </span>
  );
}

// ===== Texto largo (notas): span editable EN FLUJO tras «Notas:» =====

/**
 * Las notas se imprimen como texto corrido a continuación de «Notas:» y
 * los renglones siguientes vuelven al margen del div — un `<textarea>` no
 * puede fluir así (sus renglones quedan sangrados y cortan en otro sitio).
 * Se usa un `<span contenteditable="plaintext-only">` nativo (no es un
 * editor rico): el navegador es dueño del DOM editable, React solo pinta el
 * texto inicial y lo re-sincroniza cuando el valor cambia por fuera
 * (descartar/reset). El PDF colapsa los saltos de línea (`escape(notas)` en
 * un div normal), así que Enter no inserta nada y el CSS es `white-space:
 * normal`: lo que se ve es lo que imprime.
 */
export function CampoTextoLargo({
  value,
  onChange,
  placeholder = "",
  ariaLabel,
  lectura = false,
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  lectura?: boolean;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Texto INICIAL (estado que nunca cambia): React pinta los hijos una vez
  // y no vuelve a tocarlos; el DOM editable es del navegador.
  const [inicial] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (el && (el.textContent ?? "") !== value) el.textContent = value;
  }, [value]);
  // Lectura: texto tal cual (el PDF no conserva saltos: `escape(r.notas)`).
  if (lectura) return <>{value}</>;
  return (
    <span
      ref={ref}
      id={id}
      role="textbox"
      aria-multiline="false"
      aria-label={ariaLabel}
      title="Los saltos de línea no se imprimen en el PDF"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      className={cn("cot-in cot-in--flujo", className)}
      data-placeholder={placeholder}
      onInput={(e) => {
        const el = e.currentTarget;
        const texto = el.textContent ?? "";
        // Al borrar todo, algunos motores dejan un <br>: se vacía para que
        // vuelva el placeholder (`:empty`).
        if (texto === "" && el.childNodes.length > 0) el.replaceChildren();
        onChange(texto);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      onPaste={(e) => {
        // Respaldo donde `plaintext-only` no existe: pegar SIEMPRE texto plano.
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain").replace(/\s+/g, " ");
        document.execCommand("insertText", false, t);
      }}
      {...UI}
    >
      {inicial}
    </span>
  );
}

// ===== Fecha y hora: texto del PDF en reposo, `datetime-local` al enfocar =====

export function CampoFecha({
  value,
  onChange,
  ariaLabel,
  lectura = false,
  id,
  vacio = "Por confirmar",
  className,
}: {
  /** String `datetime-local` ("YYYY-MM-DDTHH:mm") en PARED Cancún, o "". */
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  lectura?: boolean;
  id?: string;
  /** Texto impreso sin fecha (el PDF: «Por confirmar»). */
  vacio?: string;
  className?: string;
}) {
  const texto = value ? fechaLegibleDeInput(value) : vacio;
  if (lectura) return <>{texto}</>;
  return (
    <label className={cn("cot-fecha", className)} {...UI}>
      <span className={cn("cot-fecha__texto", !value && "cot-fecha__texto--vacio")}>{texto}</span>
      <input
        id={id}
        type="datetime-local"
        className="cot-in cot-fecha__input"
        value={value}
        aria-label={`${ariaLabel} (hora de Cancún)`}
        title="Hora de Cancún (UTC−5)"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// ===== Fecha SOLO día (fecha del tramo en el PDF) =====

export function CampoDia({
  value,
  onChange,
  ariaLabel,
  lectura = false,
  texto,
  className,
  disabled,
}: {
  /** "YYYY-MM-DD" o "". */
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  lectura?: boolean;
  /** Texto impreso (ya formateado por el caller, p. ej. "3 sep 2026" / "—"). */
  texto: string;
  className?: string;
  disabled?: boolean;
}) {
  if (lectura) return <>{texto}</>;
  return (
    <label className={cn("cot-fecha", className)} {...UI}>
      <span className={cn("cot-fecha__texto", !value && "cot-fecha__texto--vacio")}>{texto}</span>
      <input
        type="date"
        className="cot-in cot-fecha__input"
        value={value}
        min="2000-01-01"
        max="2100-12-31"
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// ===== Selector con búsqueda (cliente, aeronave, aeropuerto) =====

export interface CampoSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Lo que se IMPRIME en la hoja (default: `label`). Ej. aeronave: solo el modelo. */
  textoImpreso?: string;
}

export function CampoSelect({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  ariaLabel,
  lectura = false,
  disabled = false,
  id,
  className,
  title,
  /** Texto impreso cuando hay valor pero no está en las opciones. */
  textoFallback,
}: {
  options: CampoSelectOption[];
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel: string;
  lectura?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  title?: string;
  textoFallback?: string;
}) {
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const texto = selected ? (selected.textoImpreso ?? selected.label) : value ? (textoFallback ?? value) : "";
  if (lectura) return <>{texto}</>;
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(item: CampoSelectOption | null) => {
        if (item) onChange(item.value);
      }}
    >
      <ComboboxPrimitive.Trigger
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        className={cn("cot-in cot-sel", !texto && "cot-sel--vacio", className)}
        {...UI}
      >
        {texto || placeholder}
      </ComboboxPrimitive.Trigger>
      <ComboboxContent>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <ComboboxPrimitive.Input
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: CampoSelectOption) => (
            <ComboboxItem value={item} key={item.value} disabled={item.disabled}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{item.label}</span>
                {item.description && (
                  <span className="truncate text-[10px] text-muted-foreground">{item.description}</span>
                )}
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// ===== Moneda: monto + select USD/MXN como texto =====

export function CampoMoneda({
  monto,
  moneda,
  onMontoChange,
  onMonedaChange,
  ariaLabel,
  lectura = false,
  disabled = false,
  formato,
  placeholder = "0.00",
  /** La moneda solo se ve con la fila en hover/foco (extras en USD: el PDF no la imprime). */
  monedaFantasma = false,
  id,
}: {
  monto: number | null;
  moneda: "USD" | "MXN";
  onMontoChange: (v: number | null) => void;
  onMonedaChange: (m: "USD" | "MXN") => void;
  ariaLabel: string;
  lectura?: boolean;
  disabled?: boolean;
  formato: (n: number) => string;
  placeholder?: string;
  monedaFantasma?: boolean;
  id?: string;
}) {
  if (lectura) {
    return (
      <>
        {monto == null ? "" : formato(monto)}
        {moneda === "MXN" ? " MXN" : ""}
      </>
    );
  }
  return (
    <>
      <CampoNumero
        id={id}
        value={monto}
        onChange={onMontoChange}
        formato={formato}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        disabled={disabled}
        min={0}
        minCh={4}
      />
      <select
        className={cn("cot-in", monedaFantasma && moneda === "USD" && "cot-fantasma")}
        value={moneda}
        disabled={disabled}
        aria-label={`Moneda de ${ariaLabel}`}
        onChange={(e) => onMonedaChange(e.target.value === "MXN" ? "MXN" : "USD")}
        {...UI}
      >
        <option value="USD">USD</option>
        <option value="MXN">MXN</option>
      </select>
    </>
  );
}

// ===== Popover de detalle de una fila (fuera del papel, por portal) =====

/** Cierra al hacer clic fuera (del popover y de su ancla) o con Escape. */
export function useCerrarFuera(
  abierto: boolean,
  onCerrar: () => void,
  ref: React.RefObject<HTMLElement | null>,
  ancla: HTMLElement | null,
) {
  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (ancla?.contains(t)) return;
      onCerrar();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto, onCerrar, ref, ancla]);
}

/**
 * Foco accesible del popover (va por portal al final del body, fuera del
 * orden natural de tabulación): al abrir, el foco entra al primer control;
 * al cerrar, regresa al «⋯» que lo abrió.
 */
export function useFocoPopover(ref: React.RefObject<HTMLElement | null>, ancla: HTMLElement | null) {
  useEffect(() => {
    const nodo = ref.current;
    const primero = nodo?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="switch"]:not([disabled])',
    );
    primero?.focus();
    return () => {
      // Solo si el foco sigue dentro del popover (o se perdió): no pisar un
      // clic del operador en otro campo de la hoja.
      const activo = document.activeElement;
      if (!activo || activo === document.body || nodo?.contains(activo)) ancla?.focus();
    };
    // Solo al montar/desmontar (el ancla no cambia mientras está abierto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Enfoca el control de la hoja con ese `aria-label` en el siguiente tick
 * (tras pintar la fila nueva): «+ Agregar tramo» → destino del tramo nuevo,
 * «+ Agregar concepto» → concepto del extra nuevo.
 */
export function enfocarPorAriaLabel(label: string) {
  if (typeof document === "undefined") return;
  window.setTimeout(() => {
    const sel = `.cot-hoja [aria-label="${label.replace(/"/g, '\\"')}"]`;
    document.querySelector<HTMLElement>(sel)?.focus();
  }, 0);
}

/** Posición absoluta (coordenadas de página) bajo el ancla del popover. */
export function posicionBajoAncla(ancla: HTMLElement | null): { top: number; left: number } {
  if (!ancla || typeof window === "undefined") return { top: 0, left: 0 };
  const r = ancla.getBoundingClientRect();
  return { top: r.bottom + window.scrollY + 6, left: Math.max(8, r.left + window.scrollX - 8) };
}

/** Fila de un formulario compacto dentro del popover de detalle. */
export function DetalleFila({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <div className="min-w-0" data-detalle-id={id}>
        {children}
      </div>
      {hint && <p className="col-start-2 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Enter en un campo del popover = cerrar (como «listo»). */
export function enterCierra(onCerrar: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      onCerrar();
    }
  };
}
