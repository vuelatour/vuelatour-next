import { fmtDecimal, fmtUsd } from "@/lib/format";
import type {
  ParticipacionAvion,
  ParticipacionFuente,
} from "@/types/quotes-persisted";

/**
 * Vuelo MULTI-AVIÓN (regla del cliente 28-ago-2026): cuando los tramos los
 * vuelan aviones distintos, la venta del avión se REPARTE entre ellos en
 * partes iguales por tramo vendido (ida/regreso = mitad y mitad; los tramos
 * operativos —ferry/posicionamiento— no reparten). El API calcula el reparto
 * con su fuente única (`participacionPorAeronave` + `repartirUsd`); aquí
 * SOLO se pinta — nada se recalcula: el monto de cada avión viene en
 * `venta_avion_usd` (centavos exactos, Σ == venta del avión). Sin hooks:
 * sirve igual en server components y dentro de client components.
 */

const FUENTE_LABEL: Partial<Record<ParticipacionFuente, string>> = {
  tramos: "partes iguales por tramo vendido",
};

/** Etiqueta es-MX de la fuente del peso; null si no viene, es `unico` o no se conoce. */
export function fuenteParticipacionLabel(
  fuente: string | null | undefined,
): string | null {
  if (!fuente) return null;
  return (FUENTE_LABEL as Record<string, string | undefined>)[fuente] ?? null;
}

/** "50 %" limpio; "33.33 %" cuando la fracción no es entera. */
export function fmtParticipacionPct(factor: number): string {
  const pct = Math.round(factor * 100 * 100) / 100;
  return `${fmtDecimal(pct, Number.isInteger(pct) ? 0 : 2)} %`;
}

/** true si participa MÁS de un avión (con un solo avión no hay nada que decir). */
export function esMultiAvion(
  aviones: ParticipacionAvion[] | null | undefined,
): boolean {
  return (aviones ?? []).filter((a) => a.factor > 0).length > 1;
}

/**
 * Línea discreta "Venta del avión repartida por tramo: N990GG 50 % ($580.00)
 * · N4142R 50 % ($580.00) (partes iguales por tramo vendido)". El monto de
 * cada avión es `venta_avion_usd` tal como lo repartió el API; si el API no
 * lo manda se muestran solo los porcentajes (nunca monto × factor aquí: los
 * centavos no cuadrarían con el Excel). Devuelve null si el vuelo no es
 * multi-avión.
 */
export function ParticipacionAvionesNota({
  aviones,
  fuente,
  className,
}: {
  aviones: ParticipacionAvion[] | null | undefined;
  fuente?: string | null;
  className?: string;
}) {
  if (!esMultiAvion(aviones)) return null;
  const partes = (aviones ?? []).filter((a) => a.factor > 0);
  const fuenteLabel = fuenteParticipacionLabel(fuente);
  return (
    <p
      className={`text-[11px] text-muted-foreground ${className ?? ""}`}
      title="Vuelo con más de un avión: la venta del avión, sus cobros, su pendiente y sus horas cobradas se reparten entre los aviones en partes iguales por tramo vendido (los tramos operativos —ferry/posicionamiento— no reparten). Los gastos NO se reparten: van al avión del tramo al que están ligados. TUAs/extras/pernocta/comisión del vendedor son ingreso de VuelaTour y no se reparten."
    >
      Venta del avión repartida por tramo:{" "}
      {partes.map((a, i) => (
        <span key={a.aeronave_id} className="whitespace-nowrap">
          {i > 0 && " · "}
          <span className="font-mono">{a.matricula ?? "s/matrícula"}</span>{" "}
          {fmtParticipacionPct(a.factor)}
          {a.venta_avion_usd != null && Number.isFinite(a.venta_avion_usd) && (
            <span className="font-mono"> ({fmtUsd(a.venta_avion_usd)})</span>
          )}
        </span>
      ))}
      {fuenteLabel && ` (${fuenteLabel})`}
    </p>
  );
}
