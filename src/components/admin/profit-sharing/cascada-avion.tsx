import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { NOTA_PAGO_VENDEDOR_REPARTO } from "@/lib/admin/categorias-gasto";
import { tituloOtrosIngresosAvion } from "@/lib/admin/otros-ingresos-avion";
import {
  ETIQUETAS_CASCADA,
  ETIQUETA_RESERVA_INFORMATIVA,
  ETIQUETA_RESERVA_RETENIDA,
  TEXTO_RESERVA_NO_RESTA,
  TITULO_RESERVA_RETENIDA,
  etiquetaSaldoCascada,
  filasCascadaAvion,
  reservaInformativa,
  saldoCascada,
  type FilaCascada,
} from "@/lib/admin/reparto-avion";
import {
  avisoPesosSinTc,
  pesosIncompletos,
  textoPorCobrarUsd,
  textoUsd,
  tituloOtrosIngresosAvionPesos,
  type MontoDoble,
} from "@/lib/admin/reparto-pesos";
import { fmtUsd } from "@/lib/format";
import type { AvionReparto } from "@/types/profit-sharing";

/**
 * La cascada del saldo de UN avión (20-oct-2026, API 0.0.101): las filas
 * SUMAN exacto el saldo disponible (cobrado, + otros ingresos del avión, −
 * comisiones, − directos, − indirectos, − permisos, − fijos, − provisión
 * AFAC) y, DEBAJO y aparte, la reserva de overhaul marcada «no se resta».
 * Sin la bandera `reparto_como_balance` (API previo) la reserva es la última
 * fila que resta y no hay AFAC. Con el COMBUSTIBLE SEPARADO (23-oct-2026,
 * API 0.0.103) las filas son las del Excel del cliente y en su orden, con el
 * subtotal «Utilidad antes de gastos» y la fila «Combustible»; sin esas
 * llaves, lo de siempre byte a byte. Sin hooks: la pintan la card (servidor)
 * y la pantalla del avión. Los números son del API; las etiquetas y el
 * orden, de `lib/admin/reparto-avion.ts`.
 */
export function CascadaAvion({
  avion,
  enPesos,
  comoBalance,
  compacta = false,
}: {
  avion: AvionReparto;
  enPesos: boolean;
  comoBalance: boolean;
  /** La card: sin sublabels largos. */
  compacta?: boolean;
}) {
  const filas = filasCascadaAvion(avion, { enPesos, comoBalance });
  const saldo = saldoCascada(avion, enPesos);
  const positivo = (saldo.valor ?? avion.saldo_disponible_usd) >= 0;
  const detalle = avion.detalle ?? null;
  const reserva = comoBalance ? reservaInformativa(avion, enPesos) : null;

  return (
    <div className="space-y-1 text-sm" data-cascada-avion={avion.aeronave.id}>
      {filas.map((f) => (
        <FilaCascadaRow
          key={f.clave}
          fila={f}
          title={
            f.clave === "otros_ingresos"
              ? (enPesos
                  ? tituloOtrosIngresosAvionPesos(detalle?.otros_ingresos_avion)
                  : tituloOtrosIngresosAvion(detalle?.otros_ingresos_avion)) ?? f.title
              : f.title
          }
        />
      ))}
      <div
        className="flex items-start justify-between gap-3 border-t border-border pt-1.5 font-semibold"
        data-fila-cascada="saldo"
      >
        <span>{etiquetaSaldoCascada(avion)}</span>
        <span className="text-right">
          <span
            className={`block font-mono tabular-nums ${
              positivo ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            }`}
          >
            {saldo.principal}
          </span>
          {saldo.informativo && (
            <span className="block text-xs font-normal text-muted-foreground tabular-nums">
              {saldo.informativo}
            </span>
          )}
        </span>
      </div>
      {/* Reparto en pesos: dólares que entraron al saldo USD pero no se
          pudieron pasar a pesos (sin ningún T.C.). Se DICE: el saldo en
          pesos está incompleto. */}
      {enPesos && pesosIncompletos(avion) && (
        <p
          data-aviso-pesos-sin-tc=""
          className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs font-normal text-amber-700 dark:text-amber-400"
        >
          <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {avisoPesosSinTc(avion.pesos_sin_tc_usd ?? 0)}
        </p>
      )}
      {/* Reserva de overhaul (cascada del balance): INFORMATIVA, debajo del
          saldo y marcada «no se resta». */}
      {reserva && (
        <div
          data-reserva-informativa=""
          title={TEXTO_RESERVA_NO_RESTA}
          className="mt-2 flex items-start justify-between gap-3 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5"
        >
          <span className="min-w-0 text-muted-foreground">
            <span className="font-medium text-foreground">{ETIQUETAS_CASCADA.reserva}</span>
            <span className="ml-1.5 inline-block rounded border border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
              {ETIQUETA_RESERVA_INFORMATIVA}
            </span>
            {reserva.sublabel && (
              <span className="ml-1.5 text-[11px] text-muted-foreground/70">{reserva.sublabel}</span>
            )}
            {!compacta && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{TEXTO_RESERVA_NO_RESTA}</span>
            )}
            {reserva.retenida && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground" title={TITULO_RESERVA_RETENIDA}>
                {ETIQUETA_RESERVA_RETENIDA} {reserva.retenida.principal}
                {reserva.retenida.informativo ? ` (${reserva.retenida.informativo})` : ""}
              </span>
            )}
          </span>
          <MontoDobleCelda monto={reserva.monto} className="shrink-0 text-right" />
        </div>
      )}
      {/* Informativo (fuera de la cascada): TUAs/extras/pernocta/comisión
          del vendedor/IVA son ingresos de VuelaTour, no del avión — no se
          reparten. Solo si el API ya lo manda. */}
      {avion.ingresos.otros_ingresos_vuelatour_usd != null && (
        <div
          className="flex items-baseline justify-between gap-3 pt-1 text-xs text-muted-foreground"
          title={`Ingresos de VuelaTour cobrados en vuelos de este avión: TUAs, extras, pernocta y comisión del vendedor (con su IVA). No entran al saldo del avión ni al reparto. ${NOTA_PAGO_VENDEDOR_REPARTO}`}
        >
          <span>
            Otros ingresos VuelaTour (TUAs/extras/pernocta/comisión) — no se reparten
            {(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd ?? 0) > 0 && (
              <span className="ml-1.5 text-[11px] text-muted-foreground/70">
                {enPesos ? (
                  textoPorCobrarUsd(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd)
                ) : (
                  <>· por cobrar {fmtUsd(avion.ingresos.otros_ingresos_vuelatour_pendiente_usd)}</>
                )}
              </span>
            )}
          </span>
          <span className="font-mono tabular-nums">
            {enPesos
              ? textoUsd(avion.ingresos.otros_ingresos_vuelatour_usd)
              : fmtUsd(avion.ingresos.otros_ingresos_vuelatour_usd)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Una fila de la cascada: etiqueta (+ sublabel) y el monto a la derecha. El
 * subtotal («Utilidad antes de gastos», API 0.0.103) lleva línea arriba y
 * peso medio, como una línea de total intermedia del Excel.
 */
function FilaCascadaRow({ fila, title }: { fila: FilaCascada; title?: string }) {
  const subtotal = fila.tipo === "subtotal";
  return (
    <div
      className={
        subtotal
          ? "mt-1 flex items-start justify-between gap-3 border-t border-border pt-1.5 font-medium"
          : "flex items-start justify-between gap-3"
      }
      title={title}
      data-fila-cascada={fila.clave}
      data-tipo={fila.tipo}
    >
      <span className={subtotal ? "text-foreground" : "text-muted-foreground"}>
        {fila.etiqueta}
        {fila.sublabel && (
          <span className="ml-1.5 text-[11px] text-muted-foreground/70">{fila.sublabel}</span>
        )}
      </span>
      <MontoDobleCelda
        monto={fila.monto}
        className={`shrink-0 text-right ${
          fila.tipo === "ingreso"
            ? "text-emerald-600 dark:text-emerald-400"
            : subtotal
              ? (fila.monto.valor ?? 0) < 0
                ? "text-destructive"
                : ""
              : fila.monto.valor === 0
                ? "text-muted-foreground"
                : ""
        }`}
      />
    </div>
  );
}

/**
 * Pesos (o dólares sin la bandera) y, si lo hay, el dato informativo debajo.
 * Sin informativo es UN solo `<span>` con la cifra (las clases de color al
 * final, como siempre lo pintó la card).
 */
export function MontoDobleCelda({ monto, className = "" }: { monto: MontoDoble; className?: string }) {
  if (!monto.informativo) {
    return <span className={`font-mono tabular-nums ${className}`.trim()}>{monto.principal}</span>;
  }
  return (
    <span className={className}>
      <span className="block font-mono tabular-nums">{monto.principal}</span>
      <span
        className={`block text-xs font-normal tabular-nums ${
          monto.sinPesos ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
        }`}
      >
        {monto.informativo}
      </span>
    </span>
  );
}
