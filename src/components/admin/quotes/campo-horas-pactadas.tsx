"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  HORAS_MAXIMO,
  fmtHorasDecimal,
  fmtHorasMinutos,
  horasATexto,
  parseHorasPactadas,
} from "@/lib/admin/horas";
import { moneyPdf } from "@/lib/admin/quote-sheet";
import { moneyTarifa } from "@/lib/admin/tarifa";
import { cn } from "@/lib/utils";

/**
 * CAMPO DE HORAS PACTADAS (22-sep-2026) — «Cobrable pactado», grupo.
 *
 * Antes era un `type="number" step="0.1"`: para pactar 1,400 USD a $600/hr
 * había que teclear «2.333333333» y el panel lo mandaba tal cual, pero lo
 * PERSISTIDO se recortaba a 2.3333 — al reabrir la cotización el motor
 * recalculaba 2.3333 × 600 = 1,399.98 (cotización #322 contra la #302, que
 * seguía en 1,400.00 porque alguien volvió a teclear los decimales).
 *
 * Aquí se captura como el operador piensa el tiempo: DECIMAL («2.3333»,
 * «2,5») u HORAS:MINUTOS («2:20» ⇒ 2.33333333, ocho decimales, los que el
 * API persiste desde hoy). Debajo, una línea viva dice en voz alta lo que se
 * está pactando y en cuánto sale — con el importe que devolvió el MOTOR,
 * nunca con una multiplicación local (invariante: el panel solo pinta dinero
 * que calculó el motor).
 *
 * El texto tecleado NO se normaliza mientras se escribe (nada de saltos del
 * cursor): solo se re-sincroniza cuando el valor cambia desde FUERA
 * (rehidratación, «Descartar», borrador `?d=`).
 */
export interface CampoHorasPactadasProps {
  /** Id del `input` (ligado por `Field`). */
  id?: string;
  /** Horas pactadas actuales del formulario; `null` = vacío (regla del motor). */
  valor: number | null;
  /** Se llama SOLO con un valor interpretable (o `null` al vaciar). */
  onChange: (valor: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Tope de captura (default 48 hr). */
  maximo?: number;
  className?: string;
  title?: string;
  "aria-label"?: string;
  /** Tarifa USD/hr del breakdown: completa la línea viva. */
  tarifaUsdHr?: number | null;
  /** Importe que devolvió el motor para esas horas (subtotal del servicio aéreo). */
  importeUsd?: number | null;
  /**
   * `false` mientras el motor aún no responde para las horas tecleadas: la
   * línea viva dice «calculando…» en vez de enseñar un importe viejo.
   */
  importeVigente?: boolean;
}

export function CampoHorasPactadas({
  id,
  valor,
  onChange,
  placeholder,
  disabled,
  maximo = HORAS_MAXIMO,
  className,
  title,
  "aria-label": ariaLabel,
  tarifaUsdHr,
  importeUsd,
  importeVigente = true,
}: CampoHorasPactadasProps) {
  const [texto, setTexto] = useState(() => horasATexto(valor));
  const [error, setError] = useState<string | null>(null);
  // Último valor que ESTE campo emitió o adoptó: distingue «cambió desde
  // fuera» de «lo acabo de escribir yo» (sin esto, cada tecla se reescribiría
  // con el texto canónico y el cursor saltaría).
  const valorRef = useRef<number | null>(valor);

  useEffect(() => {
    if (valor === valorRef.current) return;
    valorRef.current = valor;
    setTexto(horasATexto(valor));
    setError(null);
  }, [valor]);

  const escribir = (t: string) => {
    setTexto(t);
    const r = parseHorasPactadas(t, { maximo });
    if (r.parcial) {
      setError(null);
      return;
    }
    if (!r.valido) {
      setError(r.error);
      return;
    }
    setError(null);
    if (r.valor === valorRef.current) return;
    valorRef.current = r.valor;
    onChange(r.valor);
  };

  // Al salir del campo se deja el texto CANÓNICO del valor aceptado («2:20»,
  // «2.5»): lo tecleado a medias o con errata no se queda a la vista como si
  // contara. Un campo vacío se queda vacío (= vuelve a la regla).
  const salir = () => {
    setTexto(horasATexto(valorRef.current));
    setError(null);
  };

  const decimal = fmtHorasDecimal(valor, 4);
  const reloj = fmtHorasMinutos(valor);
  const conTarifa = Number(tarifaUsdHr) > 0;

  return (
    <div className="space-y-1">
      <Input
        id={id}
        // `type="text"` SIN `inputMode` numérico a propósito: los teclados
        // «decimal»/«numeric» de tableta no traen «:» y «2:20» quedaría
        // imposible de escribir justo en el dispositivo donde más se usa.
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        title={title}
        className={cn("font-mono", className)}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onBlur={salir}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        valor !== null && (
          <p className="text-xs text-muted-foreground font-mono">
            = {reloj} · {decimal} hr
            {conTarifa && (
              <>
                {" × "}
                {/* La tarifa va con TODOS sus decimales (22-sep-2026, #105):
                    con «$989.58» esta línea enseñaba una cuenta que no
                    cuadraba por un centavo. Con tarifas de 2 decimales el
                    texto es idéntico al de siempre. */}
                {moneyTarifa(tarifaUsdHr)}
                {importeVigente && importeUsd != null ? (
                  <> = {moneyPdf(importeUsd)}</>
                ) : (
                  <span className="font-sans"> · calculando…</span>
                )}
              </>
            )}
          </p>
        )
      )}
    </div>
  );
}
