import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { ENLACE_ABRIR_CARDEX, ID_PLEGABLE_CARDEX } from "@/lib/admin/inventario-ficha";
import {
  AYUDA_TARJETA_PRECIOS,
  ETIQUETA_EXISTENCIA_HOY,
  ETIQUETA_PRECIO_VIGENTE,
  ETIQUETA_SE_COBRA,
  SIN_PRECIO_VIGENTE,
  SUB_ETIQUETA_PRECIO_VIGENTE,
  SUB_ETIQUETA_SE_COBRA,
  TITULO_TARJETA_PRECIOS,
  tarjetaPrecios,
  type DatoTarjeta,
} from "@/lib/admin/inventario-precios";
import type { PrecioVigenteFicha, TcHoy } from "@/types/inventory";

/**
 * Tarjeta «Precios de este producto» (27-oct-2026), arriba del cardex: el
 * precio vigente (último precio de compra), a cuánto se cobra la siguiente
 * salida y la existencia de hoy. Server-safe: solo pinta lo que redacta
 * `tarjetaPrecios` (lib/admin/inventario-precios.ts); ninguna cuenta aquí.
 */
export function PrecioVigenteCard(props: {
  pv: PrecioVigenteFicha | null | undefined;
  tcHoy?: TcHoy | null;
  margenPct?: number | null;
  existencia: number | string | null | undefined;
  unidad: string | null | undefined;
  bajoStock?: boolean | null;
  stockMinimo?: number | string | null;
}) {
  const t = tarjetaPrecios(props);
  return (
    <section
      data-tarjeta-precios=""
      className="rounded-xl border border-brand-600/30 bg-card px-4 py-3"
      aria-label={TITULO_TARJETA_PRECIOS}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
          {TITULO_TARJETA_PRECIOS}
        </p>
        <p className="text-xs text-muted-foreground">{AYUDA_TARJETA_PRECIOS}</p>
      </div>
      {t.vigente == null && (
        <div
          className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
          data-sin-precio-vigente=""
        >
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            {SIN_PRECIO_VIGENTE}{" "}
            <a
              href={`#${ID_PLEGABLE_CARDEX}`}
              className="cursor-pointer font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
            >
              {ENLACE_ABRIR_CARDEX}
            </a>
          </span>
        </div>
      )}
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        {t.vigente && (
          <Dato
            etiqueta={ETIQUETA_PRECIO_VIGENTE}
            subEtiqueta={SUB_ETIQUETA_PRECIO_VIGENTE}
            dato={t.vigente}
            destacado
          />
        )}
        {t.venta && <Dato etiqueta={ETIQUETA_SE_COBRA} subEtiqueta={SUB_ETIQUETA_SE_COBRA} dato={t.venta} />}
        <Dato etiqueta={ETIQUETA_EXISTENCIA_HOY} dato={t.existencia} />
      </dl>
    </section>
  );
}

function Dato({
  etiqueta,
  subEtiqueta,
  dato,
  destacado = false,
}: {
  etiqueta: string;
  subEtiqueta?: string;
  dato: DatoTarjeta;
  destacado?: boolean;
}) {
  const ambar = dato.tono === "ambar";
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2",
        destacado ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-muted/40",
      )}
    >
      <dt className="text-xs font-semibold text-foreground">
        {etiqueta}
        {subEtiqueta && <span className="font-normal text-muted-foreground"> · {subEtiqueta}</span>}
      </dt>
      <dd className="mt-0.5">
        <span
          className={cn(
            "block text-xl font-semibold tabular-nums",
            destacado && "text-emerald-700 dark:text-emerald-300",
            ambar && "text-amber-700 dark:text-amber-400",
          )}
        >
          {dato.valor}
        </span>
        {dato.sub.map((s) => (
          <span
            key={s}
            className={cn(
              "block text-xs",
              ambar ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {s}
          </span>
        ))}
      </dd>
    </div>
  );
}
