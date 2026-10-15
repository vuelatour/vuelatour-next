"use client";

import { Fragment } from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ArchivoEstadoCuenta, EnlaceNuevaPestana } from "@/components/admin/banco/partes-hoja";
import { TITULO_VER_ABONO, type PiezaLineaBanco } from "@/lib/admin/cobro-banco";
import {
  BOTON_BUSCAR_ABONO,
  SUFIJO_ESTE_COBRO,
  TEXTO_CARGANDO_ENTRADA,
  TITULO_REGISTRO_LIGA_ENTRADA,
  TITULO_VUELO_DEL_LOTE,
  accionesPendienteEntrada,
  contextoEntrada,
  estadoCambioEntrada,
  fichaAbonoEntrada,
  hrefBuscarDesdeFila,
  lineaComisionEntrada,
  mensajeErrorDetalleEntrada,
  notasEntrada,
  resumenEstadoEntrada,
  textoAlertaConciliacionEntrada,
  type EntradaBancoFila,
} from "@/lib/admin/entrada-banco";
import {
  BOTON_RECARGAR,
  BOTON_REINTENTAR_BANCO,
  BOTON_VER_EN_CONCILIACION,
  TEXTO_ESTADO_CAMBIO,
  TITULO_QUE_HACER,
  type TonoEstadoBanco,
} from "@/lib/admin/hoja-banco";
import { todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { ConciliacionDeEntrada } from "@/types/conciliacion-entrada";

/** Lo que devuelve la server action (misma forma que `ActionResult`). */
interface ResultadoHoja {
  ok: boolean;
  data?: ConciliacionDeEntrada;
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

/** Texto con enlaces intercalados (los vuelos del mismo día): cada enlace en pestaña nueva. */
function Piezas({ piezas }: { piezas: readonly PiezaLineaBanco[] }) {
  return (
    <>
      {piezas.map((p, i) =>
        p.tipo === "texto" ? (
          <Fragment key={i}>{p.texto}</Fragment>
        ) : (
          <EnlaceNuevaPestana key={i} href={p.href} title={p.titulo}>
            {p.texto}
          </EnlaceNuevaPestana>
        ),
      )}
    </>
  );
}

/**
 * Cuerpo de la hoja «Conciliación con el banco» de una ENTRADA de dinero
 * (15-oct-2026, API 0.0.78, invariante 78). PRESENTACIONAL: sin red ni estado
 * propio (todo llega por props desde el hook genérico), así se prueba con
 * `renderToStaticMarkup`. Lo usan la hoja de las tablas / tarjetas y la
 * sección EMBEBIDA del detalle `?ingreso=`. Los textos y las URLs salen SOLO de
 * `lib/admin/entrada-banco.ts` y NINGÚN monto se calcula aquí. Nunca se pinta
 * número de cuenta ni CLABE (no viajan).
 */
export function EntradaBancoDetalle({
  fila,
  resultado,
  descargando,
  onReintentar,
  onRecargar,
  onDescargar,
  hoy,
}: {
  fila: EntradaBancoFila;
  resultado: ResultadoHoja | null;
  descargando: string | null;
  onReintentar: () => void;
  onRecargar: () => void;
  onDescargar: (estadoCuentaId: string) => void;
  /** Día Cancún que acota «Por conciliar» (pruebas); sin él, hoy. */
  hoy?: string;
}) {
  if (!resultado) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {TEXTO_CARGANDO_ENTRADA}
      </p>
    );
  }
  if (!resultado.ok || !resultado.data) {
    const e = mensajeErrorDetalleEntrada(resultado, fila.origen);
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
            <EnlaceNuevaPestana href={hrefBuscarDesdeFila(fila)} className="text-sm">
              {BOTON_BUSCAR_ABONO}
            </EnlaceNuevaPestana>
          )}
        </div>
      </div>
    );
  }

  const r = resultado.data;
  const resumen = resumenEstadoEntrada(r);
  const comision = lineaComisionEntrada(r.entrada);
  const alertas = Array.isArray(r.alertas) ? r.alertas : [];
  const notas = notasEntrada(r);
  const contexto = contextoEntrada(r);
  const acciones = accionesPendienteEntrada(r, hoy ?? todayCancun());
  return (
    <div className="space-y-3" data-hoja-banco="datos">
      {estadoCambioEntrada(r, fila) && (
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
      {comision && <p className="text-xs text-muted-foreground">{comision}</p>}
      {alertas.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {alertas.map((a) => (
            <li key={a}>{textoAlertaConciliacionEntrada(a, r)}</li>
          ))}
        </ul>
      )}
      {notas.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
      {contexto && (
        <p className="text-xs" data-contexto="">
          {contexto.texto}
          {contexto.enlace && (
            <>
              {" "}
              <EnlaceNuevaPestana href={contexto.enlace.href} title={contexto.enlace.titulo} className="font-medium">
                {contexto.enlace.etiqueta}
              </EnlaceNuevaPestana>
            </>
          )}
        </p>
      )}

      {(Array.isArray(r.abonos) ? r.abonos : []).map((a) => {
        const f = fichaAbonoEntrada(a, r);
        return (
          <section key={f.key} className="rounded-lg border p-3 space-y-1.5 text-sm" data-abono={f.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{f.titulo}</span>
              <span className="font-mono tabular-nums">{f.monto}</span>
            </div>
            {f.cuenta && <p className="text-xs text-muted-foreground">{f.cuenta}</p>}
            <p className="text-xs">{f.leyenda}</p>
            {f.aporte && <p className="text-xs">{f.aporte}</p>}
            {f.pasarela && <p className="text-xs text-muted-foreground">{f.pasarela}</p>}
            {f.lote && (
              <div className="space-y-1 text-xs">
                <p className="font-medium">{f.lote.titulo}</p>
                {f.lote.lineas.length > 0 && (
                  <ul className="max-h-60 space-y-1 overflow-y-auto">
                    {f.lote.lineas.map((l) => {
                      const secundaria = (
                        <span className="block text-[11px] text-muted-foreground">
                          {l.secundaria}
                          {l.sufijo && (
                            <span
                              data-estado-cobro-lote={l.sufijo.tono}
                              className={l.sufijo.tono === "aviso" ? "text-amber-700 dark:text-amber-300" : undefined}
                            >
                              {l.sufijo.texto}
                            </span>
                          )}
                        </span>
                      );
                      return (
                        <li key={l.key}>
                          {l.esEste || !l.hrefVuelo ? (
                            <span>
                              {l.principal}
                              {l.esEste && (
                                <>
                                  {" "}
                                  <strong>{SUFIJO_ESTE_COBRO}</strong>
                                </>
                              )}
                              {secundaria}
                            </span>
                          ) : (
                            <EnlaceNuevaPestana href={l.hrefVuelo} title={TITULO_VUELO_DEL_LOTE} className="block">
                              {l.principal}
                              {secundaria}
                            </EnlaceNuevaPestana>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {f.lote.diferencia && <p className="text-amber-700 dark:text-amber-300">{f.lote.diferencia}</p>}
                {f.lote.sinDetalle && <p className="text-amber-700 dark:text-amber-300">{f.lote.sinDetalle}</p>}
              </div>
            )}
            {f.notas && <p className="text-xs text-muted-foreground">{f.notas}</p>}
            <ArchivoEstadoCuenta archivo={f.archivo} descargando={descargando} onDescargar={onDescargar} />
            {f.registro && (
              <p className="text-xs text-muted-foreground" title={TITULO_REGISTRO_LIGA_ENTRADA}>
                {f.registro}
              </p>
            )}
            <EnlaceNuevaPestana
              href={f.href}
              title={TITULO_VER_ABONO}
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
          {acciones.aviso && (
            <div
              className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300"
              data-cruce-no-corrio=""
            >
              <p>{acciones.aviso.texto}</p>
              <EnlaceNuevaPestana href={acciones.aviso.enlace.href} title={acciones.aviso.enlace.titulo} className="font-medium">
                {acciones.aviso.enlace.etiqueta}
              </EnlaceNuevaPestana>
            </div>
          )}
          {acciones.mismoDia && (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2" data-mismo-dia="">
              <p>
                <Piezas piezas={acciones.mismoDia.piezas} />
              </p>
              <EnlaceNuevaPestana
                href={acciones.mismoDia.enlace.href}
                title={acciones.mismoDia.enlace.titulo}
                className="font-medium"
              >
                {acciones.mismoDia.enlace.etiqueta}
              </EnlaceNuevaPestana>
            </div>
          )}
          <p>{acciones.intro}</p>
          {acciones.causas.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {acciones.causas.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {acciones.notas.map((n) => (
            <p key={n} className="text-muted-foreground">
              {n}
            </p>
          ))}
          {acciones.cobertura?.aviso && (
            <p className="text-amber-700 dark:text-amber-300">{acciones.cobertura.aviso}</p>
          )}
          {acciones.cobertura?.detalle && <p className="text-muted-foreground">{acciones.cobertura.detalle}</p>}
          {acciones.enlaces.length > 0 && (
            <div className="flex flex-col gap-1">
              {acciones.enlaces.map((l, i) => (
                <EnlaceNuevaPestana
                  key={`${l.etiqueta}|${l.href}`}
                  href={l.href}
                  title={l.titulo}
                  className={i === 0 ? "font-medium" : undefined}
                >
                  {l.etiqueta}
                </EnlaceNuevaPestana>
              ))}
            </div>
          )}
          {acciones.notaFinal && <p className="text-muted-foreground">{acciones.notaFinal}</p>}
        </section>
      )}
    </div>
  );
}
