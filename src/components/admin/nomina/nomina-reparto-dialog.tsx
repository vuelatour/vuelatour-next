"use client";

/**
 * «Repartir la nómina entre aviones» (16-oct-2026, API 0.0.90): reparte los
 * pagos de nómina del mes en PARTES IGUALES entre los aviones elegidos, por
 * lotes o todo de una vez (`POST /v1/expenses/reparto-iguales`).
 *
 * Pasos: 1) ¿Qué pagos? (chips «Todo el mes» · «1ª quincena» · «2ª
 * quincena» · «Solo sin repartir» + la lista con casillas); 2) ¿Entre qué
 * aviones? (activos, con «Todos»); 3) vista previa AUTOMÁTICA con
 * `simular: true` (debounce + turno: una respuesta vieja no pisa a la nueva;
 * jamás un `await` desnudo: `.catch`). El panel NO calcula montos: pinta los
 * del API. 4) «Repartir N pagos entre M aviones»: si algún pago ya estaba
 * repartido, confirma el reemplazo (AlertDialog); si no, el resumen y el
 * botón son la confirmación. 5) «Quitar el reparto» SIEMPRE confirma.
 * 6) Resultado: toast y, si hubo errores por pago, se listan aquí (MES_CERRADO
 * con el texto del API).
 *
 * La action NO revalida: el diálogo sigue montado y la página se pone al día
 * con UN `router.refresh()` al CERRAR si algo cambió (o si no se pudo
 * confirmar el resultado). Textos y reglas en `lib/admin/nomina-reparto.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { listAvionesActivosAction } from "@/app/admin/expenses/actions";
import {
  repartoIgualesAction,
  type ResultadoRepartoIgualesAction,
} from "@/app/admin/nomina/actions";
import {
  BOTON_CONFIRMAR_QUITAR_NOMINA,
  BOTON_CONFIRMAR_REEMPLAZO_NOMINA,
  CHIPS_PAGOS_NOMINA,
  CODIGO_SIN_CONEXION,
  ESPERA_VISTA_PREVIA_MS,
  ETIQUETA_CANCELAR,
  ETIQUETA_CERRAR,
  ETIQUETA_QUITAR_REPARTO_NOMINA,
  ETIQUETA_REINTENTAR,
  ETIQUETA_SELECCIONAR_NINGUNO,
  ETIQUETA_SELECCIONAR_TODOS,
  ETIQUETA_TODOS_AVIONES,
  MSG_REPARTO_INCIERTO,
  PASO_AVIONES_NOMINA,
  PASO_PAGOS_NOMINA,
  PASO_VISTA_PREVIA_NOMINA,
  TEXTO_AVIONES_NO_CARGARON,
  TEXTO_CALCULANDO_REPARTO,
  TEXTO_CARGANDO_AVIONES,
  TEXTO_ELIGE_AVIONES,
  TEXTO_ELIGE_PAGOS,
  TEXTO_PAGO_CON_VUELO,
  TEXTO_QUITANDO,
  TEXTO_REPARTIENDO,
  TEXTO_SIN_AVIONES_ACTIVOS,
  TEXTO_SIN_PAGOS_MES,
  TEXTO_VISTA_PREVIA_NO_CARGO,
  TITULO_CONFIRMAR_QUITAR_NOMINA,
  TITULO_CONFIRMAR_REEMPLAZO_NOMINA,
  TITULO_DIALOGO_REPARTO_NOMINA,
  TITULO_ERRORES_REPARTO,
  chipDeSeleccion,
  chipInicialNomina,
  claveVistaPreviaNomina,
  descripcionDialogoRepartoNomina,
  erroresDeRespuestaReparto,
  estadoPagoNomina,
  idsDeChip,
  idsDeClaveVistaPrevia,
  lineaPagoNomina,
  pagosYaRepartidos,
  resultadoEsIncierto,
  textoBotonRepartirNomina,
  textoConfirmarQuitarNomina,
  textoConfirmarReemplazoNomina,
  textoPagosSeleccionados,
  textoParteRepartoNomina,
  textoTotalRepartoNomina,
  toastResultadoRepartoNomina,
  type ErrorPagoReparto,
  type PagoNomina,
} from "@/lib/admin/nomina-reparto";

interface AvionActivo {
  id: string;
  matricula: string;
  modelo: string;
}

/** La server action ni siquiera salió (red, deploy): nunca lanza. */
const sinConexion = (): ResultadoRepartoIgualesAction => ({
  ok: false,
  code: CODIGO_SIN_CONEXION,
  error: MSG_REPARTO_INCIERTO,
});

export interface NominaRepartoDialogProps {
  pagos: readonly PagoNomina[];
  /** «octubre 2026». */
  etiquetaMes: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NominaRepartoDialog(p: NominaRepartoDialogProps) {
  const router = useRouter();
  const { pagos } = p;

  // ── Paso 1: pagos ─────────────────────────────────────────────────────────
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set(idsDeChip(pagos, chipInicialNomina(pagos))),
  );
  const chipActivo = chipDeSeleccion(pagos, seleccion);
  const repartibles = useMemo(() => pagos.filter((x) => x.repartible).map((x) => x.id), [pagos]);

  // ── Paso 2: aviones activos (lectura con turno y `.catch`) ───────────────
  const [intentoAviones, setIntentoAviones] = useState(0);
  const [carga, setCarga] = useState<{ intento: number; aviones: AvionActivo[] | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    listAvionesActivosAction()
      .catch(() => null)
      .then((r) => {
        if (!vivo) return;
        setCarga({ intento: intentoAviones, aviones: r?.ok ? (r.data ?? []) : null });
      });
    return () => {
      vivo = false;
    };
  }, [intentoAviones]);
  const cargandoAviones = !carga || carga.intento !== intentoAviones;
  const aviones = cargandoAviones ? null : carga.aviones;
  const [avionesSel, setAvionesSel] = useState<Set<string>>(() => new Set());

  // ── Paso 3: vista previa automática (debounce + turno) ───────────────────
  const [version, setVersion] = useState(0);
  const clave = claveVistaPreviaNomina([...seleccion], [...avionesSel], version);
  const [preview, setPreview] = useState<{ clave: string; r: ResultadoRepartoIgualesAction } | null>(null);
  const turnoRef = useRef(0);
  useEffect(() => {
    const { gasto_ids, aeronave_ids } = idsDeClaveVistaPrevia(clave);
    if (gasto_ids.length === 0 || aeronave_ids.length === 0) return;
    const turno = ++turnoRef.current;
    const t = setTimeout(() => {
      repartoIgualesAction({ gasto_ids, aeronave_ids, simular: true })
        .catch(sinConexion)
        .then((r) => {
          if (turno !== turnoRef.current) return;
          setPreview({ clave, r });
        });
    }, ESPERA_VISTA_PREVIA_MS);
    return () => clearTimeout(t);
  }, [clave]);
  const listoParaPrevia = seleccion.size > 0 && avionesSel.size > 0;
  const previaVigente = listoParaPrevia && preview?.clave === clave ? preview.r : null;
  const previa = previaVigente?.ok ? previaVigente.data : null;
  const erroresPrevia = useMemo(() => erroresDeRespuestaReparto(previa, pagos), [previa, pagos]);

  // ── Aplicar / quitar ──────────────────────────────────────────────────────
  const [enviando, setEnviando] = useState<"repartir" | "quitar" | null>(null);
  const enviandoRef = useRef(false);
  const refrescarAlCerrarRef = useRef(false);
  const [confirmar, setConfirmar] = useState<"reemplazo" | "quitar" | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [erroresResultado, setErroresResultado] = useState<ErrorPagoReparto[]>([]);

  const cambiarAbierto = (abierto: boolean) => {
    if (!abierto && enviandoRef.current) return;
    if (!abierto && refrescarAlCerrarRef.current) {
      refrescarAlCerrarRef.current = false;
      router.refresh();
    }
    p.onOpenChange(abierto);
  };

  const ejecutar = (quitar: boolean) => {
    if (enviandoRef.current || seleccion.size === 0) return;
    if (!quitar && avionesSel.size === 0) return;
    enviandoRef.current = true;
    setEnviando(quitar ? "quitar" : "repartir");
    setErrorGeneral(null);
    setErroresResultado([]);
    repartoIgualesAction({
      gasto_ids: [...seleccion],
      aeronave_ids: quitar ? [] : [...avionesSel],
    })
      .catch(sinConexion)
      .then((r) => {
        enviandoRef.current = false;
        setEnviando(null);
        setConfirmar(null);
        if (!r.ok) {
          // Sin respuesta (red, 5xx): pudo escribirse; la lista se pone al día al cerrar.
          if (resultadoEsIncierto(r)) {
            refrescarAlCerrarRef.current = true;
            setErrorGeneral(MSG_REPARTO_INCIERTO);
            toast.error(MSG_REPARTO_INCIERTO);
          } else {
            setErrorGeneral(r.error);
            toast.error(r.error);
          }
          return;
        }
        const t = toastResultadoRepartoNomina(r.data);
        toast[t.tipo](t.texto);
        if (r.data.aplicados > 0) refrescarAlCerrarRef.current = true;
        const errores = erroresDeRespuestaReparto(r.data, pagos);
        if (errores.length === 0) {
          cambiarAbierto(false);
          return;
        }
        setErroresResultado(errores);
        setVersion((v) => v + 1);
      });
  };

  const alPulsarRepartir = () => {
    if (!previa) return;
    if (pagosYaRepartidos(previa) > 0) {
      setConfirmar("reemplazo");
      return;
    }
    ejecutar(false);
  };

  const yaRepartidos = pagosYaRepartidos(previa);

  return (
    <Dialog open={p.open} onOpenChange={cambiarAbierto}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{TITULO_DIALOGO_REPARTO_NOMINA}</DialogTitle>
          <DialogDescription>{descripcionDialogoRepartoNomina(p.etiquetaMes)}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2" aria-labelledby="nomina-reparto-paso-pagos">
          <h3 id="nomina-reparto-paso-pagos" className="text-sm font-semibold">
            {PASO_PAGOS_NOMINA}
          </h3>
          {pagos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{TEXTO_SIN_PAGOS_MES}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={PASO_PAGOS_NOMINA}>
                {CHIPS_PAGOS_NOMINA.map((c) => (
                  <Button
                    key={c.valor}
                    type="button"
                    size="sm"
                    variant={chipActivo === c.valor ? "secondary" : "outline"}
                    aria-pressed={chipActivo === c.valor}
                    className="cursor-pointer"
                    onClick={() => setSeleccion(new Set(idsDeChip(pagos, c.valor)))}
                  >
                    {c.etiqueta}
                  </Button>
                ))}
                <span className="ml-auto flex gap-2 text-xs">
                  <button
                    type="button"
                    className="cursor-pointer text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                    onClick={() => setSeleccion(new Set(repartibles))}
                  >
                    {ETIQUETA_SELECCIONAR_TODOS}
                  </button>
                  <span aria-hidden="true">/</span>
                  <button
                    type="button"
                    className="cursor-pointer text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                    onClick={() => setSeleccion(new Set())}
                  >
                    {ETIQUETA_SELECCIONAR_NINGUNO}
                  </button>
                </span>
              </div>
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border" role="list">
                {pagos.map((pago) => (
                  <li key={pago.id}>
                    <label
                      className={cn(
                        "flex items-start gap-3 px-3 py-2 text-sm",
                        pago.repartible ? "cursor-pointer hover:bg-muted/40" : "cursor-not-allowed opacity-60",
                      )}
                      title={pago.repartible ? undefined : TEXTO_PAGO_CON_VUELO}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
                        checked={seleccion.has(pago.id)}
                        disabled={!pago.repartible}
                        onChange={(e) =>
                          setSeleccion((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(pago.id);
                            else n.delete(pago.id);
                            return n;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block wrap-break-word">{lineaPagoNomina(pago)}</span>
                        <span
                          className={cn(
                            "block text-xs",
                            pago.aviones.length === 0
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground",
                          )}
                        >
                          {pago.repartible ? estadoPagoNomina(pago) : TEXTO_PAGO_CON_VUELO}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{textoPagosSeleccionados(seleccion.size)}</p>
            </>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="nomina-reparto-paso-aviones">
          <h3 id="nomina-reparto-paso-aviones" className="text-sm font-semibold">
            {PASO_AVIONES_NOMINA}
          </h3>
          {cargandoAviones ? (
            <p className="text-sm text-muted-foreground">{TEXTO_CARGANDO_AVIONES}</p>
          ) : aviones == null ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-destructive dark:text-red-400" role="alert">
              <span>{TEXTO_AVIONES_NO_CARGARON}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={() => setIntentoAviones((n) => n + 1)}
              >
                {ETIQUETA_REINTENTAR}
              </Button>
            </div>
          ) : aviones.length === 0 ? (
            <p className="text-sm text-muted-foreground">{TEXTO_SIN_AVIONES_ACTIVOS}</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label={PASO_AVIONES_NOMINA}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-brand-600"
                  checked={avionesSel.size === aviones.length}
                  onChange={(e) =>
                    setAvionesSel(e.target.checked ? new Set(aviones.map((a) => a.id)) : new Set())
                  }
                />
                <span className="font-medium">{ETIQUETA_TODOS_AVIONES}</span>
              </label>
              {aviones.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/40"
                  title={a.modelo}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-brand-600"
                    checked={avionesSel.has(a.id)}
                    onChange={(e) =>
                      setAvionesSel((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(a.id);
                        else n.delete(a.id);
                        return n;
                      })
                    }
                  />
                  <span className="font-mono">{a.matricula}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="nomina-reparto-paso-previa">
          <h3 id="nomina-reparto-paso-previa" className="text-sm font-semibold">
            {PASO_VISTA_PREVIA_NOMINA}
          </h3>
          <div aria-live="polite" className="space-y-2 text-sm">
            {seleccion.size === 0 ? (
              <p className="text-muted-foreground">{TEXTO_ELIGE_PAGOS}</p>
            ) : avionesSel.size === 0 ? (
              <p className="text-muted-foreground">{TEXTO_ELIGE_AVIONES}</p>
            ) : !previaVigente ? (
              <p className="text-muted-foreground">{TEXTO_CALCULANDO_REPARTO}</p>
            ) : !previaVigente.ok ? (
              <p className="text-destructive dark:text-red-400" role="alert">
                {resultadoEsIncierto(previaVigente) ? TEXTO_VISTA_PREVIA_NO_CARGO : previaVigente.error}
              </p>
            ) : (
              <>
                {previaVigente.data.totales.map((t) => (
                  <div key={t.moneda} className="rounded-lg border border-border px-3 py-2" data-total-moneda={t.moneda}>
                    <p className="font-medium">{textoTotalRepartoNomina(t.gastos_n, t.monto, t.moneda)}</p>
                    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" role="list">
                      {t.por_avion.map((a) => (
                        <li key={a.aeronave_id} className="tabular-nums">
                          {textoParteRepartoNomina(a.matricula, a.monto, t.moneda)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {yaRepartidos > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {textoConfirmarReemplazoNomina(yaRepartidos, avionesSel.size)}
                  </p>
                )}
              </>
            )}
          </div>
          {(erroresResultado.length > 0 ? erroresResultado : erroresPrevia).length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" data-errores-reparto>
              <p className="font-medium text-amber-800 dark:text-amber-200">{TITULO_ERRORES_REPARTO}</p>
              <ul className="mt-1 space-y-1" role="list">
                {(erroresResultado.length > 0 ? erroresResultado : erroresPrevia).map((e) => (
                  <li key={e.gasto_id}>
                    <span className="block">{e.pago}</span>
                    <span className="block text-amber-800 dark:text-amber-200">{e.mensaje}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errorGeneral && (
            <p className="text-sm text-destructive dark:text-red-400" role="alert">
              {errorGeneral}
            </p>
          )}
        </section>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={enviando != null || seleccion.size === 0}
            onClick={() => setConfirmar("quitar")}
          >
            {enviando === "quitar" ? TEXTO_QUITANDO : ETIQUETA_QUITAR_REPARTO_NOMINA}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              className="cursor-pointer"
              disabled={enviando != null}
              onClick={() => cambiarAbierto(false)}
            >
              {ETIQUETA_CERRAR}
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={enviando != null || !previa || (previa?.gastos ?? []).every((g) => !g.ok)}
              onClick={alPulsarRepartir}
            >
              {enviando === "repartir"
                ? TEXTO_REPARTIENDO
                : textoBotonRepartirNomina(seleccion.size, avionesSel.size)}
            </Button>
          </div>
        </DialogFooter>

        <AlertDialog
          open={confirmar != null}
          onOpenChange={(abierto) => {
            if (!abierto && !enviandoRef.current) setConfirmar(null);
          }}
        >
          <AlertDialogContent backdropForceRender>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmar === "quitar" ? TITULO_CONFIRMAR_QUITAR_NOMINA : TITULO_CONFIRMAR_REEMPLAZO_NOMINA}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmar === "quitar"
                  ? textoConfirmarQuitarNomina(seleccion.size)
                  : textoConfirmarReemplazoNomina(yaRepartidos, avionesSel.size)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer" disabled={enviando != null}>
                {ETIQUETA_CANCELAR}
              </AlertDialogCancel>
              <AlertDialogAction
                className="cursor-pointer"
                disabled={enviando != null}
                onClick={(e) => {
                  e.preventDefault();
                  ejecutar(confirmar === "quitar");
                }}
              >
                {enviando != null
                  ? confirmar === "quitar"
                    ? TEXTO_QUITANDO
                    : TEXTO_REPARTIENDO
                  : confirmar === "quitar"
                    ? BOTON_CONFIRMAR_QUITAR_NOMINA
                    : BOTON_CONFIRMAR_REEMPLAZO_NOMINA}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
