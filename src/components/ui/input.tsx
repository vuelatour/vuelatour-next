"use client";

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import {
  isoDeTexto,
  largoFecha,
  mascaraFecha,
  placeholderFecha,
  textoDeIso,
  type TipoFechaInput,
} from "@/lib/fecha-input";

export const CLASE_INPUT =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

/**
 * El input del admin. Desde el 6-nov-2026, `type="date"` y
 * `type="datetime-local"` se pintan con `FechaInput` (DD/MM/AAAA en todas las
 * máquinas, sin importar el idioma del navegador); el resto, como siempre.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  if (type === "date" || type === "datetime-local") {
    return <FechaInput tipo={type as TipoFechaInput} className={className} {...props} />;
  }
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(CLASE_INPUT, className)}
      {...props}
    />
  );
}

type PropsFecha = Omit<React.ComponentProps<"input">, "type"> & { tipo: TipoFechaInput };

/** El accessor `value` del prototipo: con él React nota el cambio y dispara `onChange`. */
const ACCESOR_VALUE =
  typeof HTMLInputElement !== "undefined"
    ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
    : undefined;

function leerNativo(el: HTMLInputElement): string {
  return (ACCESOR_VALUE?.get ? (ACCESOR_VALUE.get.call(el) as string) : el.value) ?? "";
}

/** Escribe el ISO en el nativo SIN avisar a nadie (es el valor que ya tiene el consumidor). */
function fijarNativo(el: HTMLInputElement, iso: string) {
  if (ACCESOR_VALUE?.set) ACCESOR_VALUE.set.call(el, iso);
  else el.value = iso;
}

/** Escribe el ISO en el nativo como si lo hubiera cambiado el usuario (React y react-hook-form se enteran). */
function escribirNativo(el: HTMLInputElement, iso: string) {
  fijarNativo(el, iso);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Fecha en DD/MM/AAAA para todas las máquinas (6-nov-2026). Pedido del dueño:
 * «estandarizar todas las fechas al formato DD/MM/AAAA, en todos lados».
 *
 * El `<input type="date">` nativo pinta la fecha con el idioma del navegador
 * (en la oficina: MM/DD/AAAA) y no se puede forzar. Aquí el usuario VE y
 * TECLEA un campo de texto con máscara (`lib/fecha-input.ts`) y, detrás del
 * icono del calendario, sigue el input nativo (`opacity-0`) para elegir con
 * el selector. El nativo es el que lleva `name`, `min`/`max`, el `ref` y el
 * `onChange` del consumidor: el VALOR que viaja sigue siendo el ISO de
 * siempre («YYYY-MM-DD» / «YYYY-MM-DDTHH:mm»), así que formularios, server
 * actions, react-hook-form (`register`) y el API no cambian.
 *
 *  - Controlado (`value`): sin foco, el texto se DERIVA del valor; con foco
 *    el usuario edita y, al completar una fecha válida, se escribe en el
 *    nativo y se dispara su `onChange`.
 *  - No controlado (`defaultValue` o `register`): el texto nace del valor del
 *    nativo y sigue sus escrituras programáticas (`reset` de react-hook-form
 *    hace `el.value = …`): se intercepta el accessor `value` del elemento.
 *  - Texto incompleto o inválido al salir: vuelve al último valor válido.
 *  - `id` (la etiqueta), `aria-*`, `data-*` y `placeholder` van en el campo
 *    visible; `required`/`disabled`/`readOnly`/`aria-invalid` en los dos.
 */
function FechaInput({
  tipo,
  className,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  id,
  name,
  min,
  max,
  step,
  required,
  disabled,
  readOnly,
  placeholder,
  autoFocus,
  ref,
  "aria-invalid": ariaInvalid,
  ...rest
}: PropsFecha) {
  const valorControlado = value === undefined ? null : String(value ?? "");
  const isoInicial = valorControlado ?? String(defaultValue ?? "");
  const nativoRef = React.useRef<HTMLInputElement | null>(null);
  const [texto, setTexto] = React.useState(() => textoDeIso(isoInicial, tipo));
  const [conFoco, setConFoco] = React.useState(false);
  // Controlado y sin foco: lo que se enseña se deriva del valor (sin efectos).
  const textoMostrado =
    valorControlado !== null && !conFoco ? textoDeIso(valorControlado, tipo) : texto;

  const sincronizarTexto = React.useCallback(
    (iso: string) => {
      setTexto((actual) => {
        const nuevo = textoDeIso(iso, tipo);
        return nuevo === actual ? actual : nuevo;
      });
    },
    [tipo],
  );

  // El `ref` del consumidor (react-hook-form, foco) apunta al nativo: valor ISO.
  const asignarRef = React.useCallback(
    (el: HTMLInputElement | null) => {
      nativoRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref && typeof ref === "object") (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    },
    [ref],
  );

  // Controlado: el nativo (sistema externo) sigue al valor del consumidor.
  React.useEffect(() => {
    if (valorControlado === null) return;
    const el = nativoRef.current;
    if (el && leerNativo(el) !== valorControlado) fijarNativo(el, valorControlado);
  }, [valorControlado]);

  // Escrituras programáticas al nativo (`el.value = …` de react-hook-form) y
  // el valor que ya tenía al montar actualizan el texto (vía callbacks).
  React.useEffect(() => {
    const el = nativoRef.current;
    if (!el || !ACCESOR_VALUE?.get || !ACCESOR_VALUE.set) return;
    const get = ACCESOR_VALUE.get;
    const set = ACCESOR_VALUE.set;
    Object.defineProperty(el, "value", {
      configurable: true,
      get() {
        return get.call(el) as string;
      },
      set(v: unknown) {
        set.call(el, v);
        sincronizarTexto(String(v ?? ""));
      },
    });
    const inicial = get.call(el) as string;
    queueMicrotask(() => sincronizarTexto(inicial));
    return () => {
      delete (el as unknown as { value?: unknown }).value;
    };
  }, [sincronizarTexto]);

  const cambioTexto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevo = mascaraFecha(e.target.value, tipo);
    setTexto(nuevo);
    const el = nativoRef.current;
    if (!el) return;
    if (nuevo === "") {
      if (leerNativo(el) !== "") escribirNativo(el, "");
      return;
    }
    const iso = isoDeTexto(nuevo, tipo);
    if (iso && iso !== leerNativo(el)) escribirNativo(el, iso);
  };

  const entrar = (e: React.FocusEvent<HTMLInputElement>) => {
    setConFoco(true);
    // Al empezar a editar un controlado, se parte de su valor actual.
    if (valorControlado !== null) setTexto(textoDeIso(valorControlado, tipo));
    onFocus?.(e);
  };

  const salir = () => {
    setConFoco(false);
    const el = nativoRef.current;
    // Incompleto o inválido: se vuelve al último valor válido (o queda vacío).
    if (texto !== "" && !isoDeTexto(texto, tipo)) sincronizarTexto(el ? leerNativo(el) : "");
    // El `onBlur` del consumidor (react-hook-form valida «al salir» por `name`) va sobre el nativo.
    if (el && onBlur) el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  };

  const desdeNativo = () => {
    const el = nativoRef.current;
    if (el) sincronizarTexto(leerNativo(el));
  };

  return (
    <div className={cn("relative w-full", className)} data-slot="input-fecha">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        placeholder={placeholder ?? placeholderFecha(tipo)}
        value={textoMostrado}
        onChange={cambioTexto}
        onFocus={entrar}
        onBlur={salir}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        aria-invalid={ariaInvalid}
        maxLength={largoFecha(tipo)}
        className={cn(CLASE_INPUT, "pr-9", className)}
        data-slot="input"
        data-fecha-texto={tipo}
        {...rest}
      />
      <CalendarDaysIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={asignarRef}
        type={tipo}
        name={name}
        defaultValue={isoInicial}
        min={min}
        max={max}
        step={step}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={ariaInvalid}
        tabIndex={-1}
        aria-label={tipo === "date" ? "Abrir el calendario" : "Abrir el calendario y la hora"}
        onChange={onChange}
        onBlur={onBlur}
        onInput={desdeNativo}
        className="absolute inset-y-0 right-0 w-9 cursor-pointer opacity-0"
        data-fecha-nativo={tipo}
      />
    </div>
  );
}

export { Input, FechaInput };
