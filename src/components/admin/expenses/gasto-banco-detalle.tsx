"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  BOTON_BUSCAR_CARGO,
  BOTON_RECARGAR,
  BOTON_REINTENTAR_BANCO,
  BOTON_VER_EN_CONCILIACION,
  NOTA_CRUZAR_PENDIENTES,
  NOTA_ESPEJO,
  TEXTO_CARGANDO_BANCO,
  TEXTO_DESCARGANDO,
  TEXTO_ESTADO_CAMBIO,
  TITULO_DESCARGAR_ESTADO_CUENTA,
  TITULO_QUE_HACER,
  TITULO_REGISTRO_LIGA,
  TITULO_VER_EN_CONCILIACION,
  accionesPendiente,
  estadoCambio,
  fichaCargoGasto,
  hrefBuscarCargoEnConciliacion,
  mensajeErrorDetalleBanco,
  resumenEstadoBanco,
  textoAlertaConciliacionGasto,
  textoCoberturaImportada,
  type GastoBancoFila,
  type TonoEstadoBanco,
} from "@/lib/admin/gasto-banco";
import { cn } from "@/lib/utils";
import type { ConciliacionDeGasto } from "@/types/conciliacion";

/** Lo que devuelve la server action (misma forma que `ActionResult`). */
interface ResultadoHoja {
  ok: boolean;
  data?: ConciliacionDeGasto;
  error?: string;
  code?: string;
  status?: number;
}

const CLASE_TONO: Record<TonoEstadoBanco, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  aviso: "text-amber-600 dark:text-amber-400",
  pendiente: "text-rose-600 dark:text-rose-400",
  neutro: "text-muted-foreground",
};

/** Toda liga de la hoja: pestaña NUEVA (la hoja y la lista de Gastos se quedan). */
function EnlaceNuevaPestana({
  href,
  title,
  className,
  children,
}: {
  href: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
      title={title}
      className={cn("cursor-pointer text-brand-600 underline-offset-2 hover:underline", className)}
    >
      {children}
    </Link>
  );
}

/**
 * Cuerpo de la hoja «Conciliación con el banco» (13-oct-2026, «conciliación
 * al revés», API 0.0.75). PRESENTACIONAL: sin red ni estado propio (todo
 * llega por props desde `useDetalleBancoGasto`), así se prueba con
 * `renderToStaticMarkup`. Los textos y las URLs salen SOLO de
 * `lib/admin/gasto-banco.ts` y NINGÚN monto se calcula aquí: suma, faltante,
 * aporte, diferencia y T.C. vienen del API. Nunca se pinta número de cuenta
 * ni CLABE (no viajan).
 */
export function GastoBancoDetalle({
  fila,
  resultado,
  descargando,
  onReintentar,
  onRecargar,
  onDescargar,
}: {
  fila: GastoBancoFila;
  resultado: ResultadoHoja | null;
  descargando: string | null;
  onReintentar: () => void;
  onRecargar: () => void;
  onDescargar: (estadoCuentaId: string) => void;
}) {
  if (!resultado) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {TEXTO_CARGANDO_BANCO}
      </p>
    );
  }
  if (!resultado.ok || !resultado.data) {
    const e = mensajeErrorDetalleBanco(resultado);
    return (
      <div className="space-y-2" data-hoja-banco="error">
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          {e.texto}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {e.reintentable && (
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={onReintentar}>
              {BOTON_REINTENTAR_BANCO}
            </Button>
          )}
          {e.buscarEnConciliacion && (
            <EnlaceNuevaPestana href={hrefBuscarCargoEnConciliacion(fila)} className="text-sm">
              {BOTON_BUSCAR_CARGO}
            </EnlaceNuevaPestana>
          )}
        </div>
      </div>
    );
  }

  const r = resultado.data;
  const resumen = resumenEstadoBanco(r);
  const acciones = accionesPendiente(r);
  const cobertura = acciones ? textoCoberturaImportada(r) : null;
  const alertas = Array.isArray(r.alertas) ? r.alertas : [];
  return (
    <div className="space-y-3" data-hoja-banco="datos">
      {estadoCambio(r, fila) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span>{TEXTO_ESTADO_CAMBIO}</span>
          <Button size="xs" variant="outline" className="cursor-pointer" onClick={onRecargar}>
            {BOTON_RECARGAR}
          </Button>
        </div>
      )}
      <p className={cn("text-sm font-medium", CLASE_TONO[resumen.tono])} data-tono={resumen.tono}>
        {resumen.texto}
      </p>
      {alertas.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {alertas.map((a) => (
            <li key={a}>{textoAlertaConciliacionGasto(a)}</li>
          ))}
        </ul>
      )}
      {r.fuente === "ESPEJO" && <p className="text-xs text-muted-foreground">{NOTA_ESPEJO}</p>}

      {(Array.isArray(r.cargos) ? r.cargos : []).map((c) => {
        const f = fichaCargoGasto(c, r);
        return (
          <section key={f.key} className="rounded-lg border p-3 space-y-1.5 text-sm" data-cargo={f.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{f.titulo}</span>
              <span className="font-mono tabular-nums">{f.monto}</span>
            </div>
            {f.cuenta && <p className="text-xs text-muted-foreground">{f.cuenta}</p>}
            <p className="text-xs">{f.leyenda}</p>
            {f.aporte && <p className="text-xs">{f.aporte}</p>}
            {f.lote && (
              <div className="space-y-1 text-xs">
                <p className="font-medium">{f.lote.titulo}</p>
                {f.lote.lineas.length > 0 && (
                  <ul className="max-h-60 space-y-1 overflow-y-auto">
                    {f.lote.lineas.map((l) => (
                      <li key={l.key}>
                        {l.esEste ? (
                          <span>
                            {l.principal} <strong>(este gasto)</strong>
                            <span className="block text-[11px] text-muted-foreground">{l.secundaria}</span>
                          </span>
                        ) : (
                          <EnlaceNuevaPestana href={l.href} className="block">
                            {l.principal}
                            <span className="block text-[11px] text-muted-foreground">{l.secundaria}</span>
                          </EnlaceNuevaPestana>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {f.lote.diferencia && <p className="text-amber-700 dark:text-amber-300">{f.lote.diferencia}</p>}
                {f.lote.sinDetalle && <p className="text-amber-700 dark:text-amber-300">{f.lote.sinDetalle}</p>}
              </div>
            )}
            {f.justificacion && <p className="text-xs">{f.justificacion}</p>}
            {f.notas && <p className="text-xs text-muted-foreground">{f.notas}</p>}
            {f.archivo.tipo === "ARCHIVO" ? (
              <div className="space-y-1 text-xs">
                <p>
                  Estado de cuenta: <span className="font-medium">{f.archivo.nombre}</span>
                </p>
                <p className="text-muted-foreground">{f.archivo.detalle}</p>
                <Button
                  size="xs"
                  variant="outline"
                  className="cursor-pointer"
                  title={TITULO_DESCARGAR_ESTADO_CUENTA}
                  disabled={descargando === f.archivo.estadoCuentaId}
                  onClick={() => {
                    if (f.archivo.tipo === "ARCHIVO") onDescargar(f.archivo.estadoCuentaId);
                  }}
                >
                  {descargando === f.archivo.estadoCuentaId ? TEXTO_DESCARGANDO : f.archivo.etiquetaDescarga}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{f.archivo.texto}</p>
            )}
            {f.registro && (
              <p className="text-xs text-muted-foreground" title={TITULO_REGISTRO_LIGA}>
                {f.registro}
              </p>
            )}
            <EnlaceNuevaPestana
              href={f.href}
              title={TITULO_VER_EN_CONCILIACION}
              className="inline-flex items-center gap-1 text-xs font-medium"
            >
              {BOTON_VER_EN_CONCILIACION}
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </EnlaceNuevaPestana>
          </section>
        );
      })}

      {acciones && (
        <section className="space-y-2 rounded-lg border border-dashed p-3 text-xs" data-que-hacer="">
          <p className="text-sm font-medium">{TITULO_QUE_HACER}</p>
          <p>{acciones.intro}</p>
          {acciones.causas.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {acciones.causas.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {acciones.extraUsd && <p className="text-muted-foreground">{acciones.extraUsd}</p>}
          {acciones.notaNoBancario && <p className="text-muted-foreground">{acciones.notaNoBancario}</p>}
          {cobertura?.aviso && <p className="text-amber-700 dark:text-amber-300">{cobertura.aviso}</p>}
          {cobertura?.detalle && <p className="text-muted-foreground">{cobertura.detalle}</p>}
          <div className="flex flex-col gap-1">
            <EnlaceNuevaPestana href={acciones.buscar.href} title={acciones.buscar.titulo} className="font-medium">
              {acciones.buscar.etiqueta}
            </EnlaceNuevaPestana>
            <EnlaceNuevaPestana href={acciones.conciliados.href} title={acciones.conciliados.titulo}>
              {acciones.conciliados.etiqueta}
            </EnlaceNuevaPestana>
          </div>
          <p className="text-muted-foreground">{NOTA_CRUZAR_PENDIENTES}</p>
        </section>
      )}
    </div>
  );
}
