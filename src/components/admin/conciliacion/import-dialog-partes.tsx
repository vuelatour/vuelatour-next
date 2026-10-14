import { cn } from "@/lib/utils";
import {
  ETIQUETA_MISMO_DIA,
  MAX_ADVERTENCIAS_PARSE,
  TITULO_ADVERTENCIAS_PARSE,
  lineasDetalleImport,
  textoVistaPreviaImport,
  type ImportJobDetalleLike,
} from "@/lib/admin/conciliacion-importacion";
import type { VistaPreviaImportacion } from "@/types/conciliacion";

/*
 * Piezas del diálogo «Importar estado de cuenta» (13-oct-2026, API 0.0.75).
 * Sin hooks ni red (se prueban con `renderToStaticMarkup`); los textos salen
 * SOLO de `lib/admin/conciliacion-importacion.ts`.
 */

/**
 * «Antes de importar: 98 líneas»: lo que el API simuló sin escribir nada —
 * cuántas ya estaban, a cuántas se les agregará el concepto del banco,
 * cuáles no (gemelos, vínculos) y las nuevas, con «misma fecha y monto»
 * marcado (casi seguro una relectura del mismo movimiento).
 */
export function VistaPreviaImportacionBox({ vp }: { vp: VistaPreviaImportacion }) {
  const t = textoVistaPreviaImport(vp);
  return (
    <div
      data-vista-previa={t.tono}
      role="status"
      className={cn(
        "space-y-1.5 rounded-lg border p-3 text-xs",
        t.tono === "aviso" ? "border-amber-500/40 bg-amber-500/5" : "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <p className="text-sm font-medium">{t.titulo}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
        {t.lineas.map((l, i) => (
          <li key={`${i}-${l}`}>{l}</li>
        ))}
      </ul>
      {t.aviso && <p className="text-amber-700 dark:text-amber-300">{t.aviso}</p>}
      {t.nuevas.length > 0 && (
        <ul className="space-y-0.5 text-[11px]">
          {t.nuevas.map((n, i) => (
            <li key={`${i}-${n.texto}`} className="flex flex-wrap items-center gap-1.5">
              <span>{n.texto}</span>
              {n.mismoDia && (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  {ETIQUETA_MISMO_DIA}
                </span>
              )}
            </li>
          ))}
          {t.masNuevas > 0 && <li className="text-muted-foreground">y {t.masNuevas} más</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * «Revisa antes de importar:» — los avisos de la lectura (saldos que no
 * cuadran, transferencias leídas SIN su concepto…). Ya llegaban del API y se
 * perdían. Hasta 10; sin avisos no se pinta nada.
 */
export function AdvertenciasParse({ advertencias }: { advertencias?: readonly string[] | null }) {
  const lista = (Array.isArray(advertencias) ? advertencias : [])
    .filter((a): a is string => typeof a === "string" && a.trim() !== "")
    .slice(0, MAX_ADVERTENCIAS_PARSE);
  if (lista.length === 0) return null;
  return (
    <div
      data-advertencias-parse=""
      role="status"
      className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
    >
      <p className="font-medium">{TITULO_ADVERTENCIAS_PARSE}</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {lista.map((a, i) => (
          <li key={`${i}-${a}`}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Lo que hay que leer al terminar: filas que se quedaron sin concepto (y
 * cómo resolverlo), las que conservaron su descripción, las líneas que NO se
 * encontraron (y NO se agregaron) y las nuevas con la misma fecha y monto que
 * otras. Sin nada que decir no se pinta nada.
 */
export function DetallesImportacion({ job }: { job: ImportJobDetalleLike | null | undefined }) {
  const bloques = lineasDetalleImport(job);
  if (bloques.length === 0) return null;
  return (
    <div data-detalles-importacion="" className="space-y-2 border-t border-border pt-2">
      {bloques.map((b) => (
        <div key={b.clave} data-bloque={b.clave} className="space-y-0.5">
          {b.titulo && <p className="text-[11px] font-medium">{b.titulo}</p>}
          <ul className="text-[11px] space-y-0.5 text-muted-foreground">
            {b.lineas.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
          {b.pie && <p className="text-[11px] text-amber-700 dark:text-amber-300">{b.pie}</p>}
        </div>
      ))}
    </div>
  );
}
