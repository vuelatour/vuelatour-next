"use client";

/**
 * «Omitir la conciliación» (14-oct-2026, API 0.0.77, invariante 75 del API).
 * Pedido: «Necesitamos una opción de pendientes de conciliar venga una
 * opción de Omitir la conciliación.»
 *
 * Lo abren la barra de la selección (N) y el menú ⋯ de un pendiente (1), con
 * la lista CONGELADA al abrir: un refresh de la página no lo desmonta ni le
 * cambia la lista. Se carga con `next/dynamic` (sin SSR) y se monta SOLO al
 * abrirse.
 *
 * Al abrir pide la REVISIÓN de riesgos al API (solo lectura): de cada
 * pendiente, si podría conciliarse de verdad (gasto o cobro que cuadra,
 * traspaso, devolución, «sin verificar»), y cuáles ya no están pendientes.
 * El API vuelve a revisar al omitir y falla CERRADO: un movimiento con aviso
 * solo se omite si viaja en `aceptar_riesgo_ids` (la casilla «También omitir
 * estos N…»); sin ella, el botón omite SOLO los que no tienen aviso y lo
 * dice. Motivo obligatorio (10–300, chips rápidos); desde 20 movimientos,
 * «Revisé la lista…». El API firma la línea con el usuario y el día Cancún.
 *
 * Éxito ⇒ toast con «Deshacer» (10 s), cerrar, el padre limpia la selección y
 * UN `router.refresh()` (la server action no revalida). 409 con riesgos ⇒ se
 * pintan y se CONSERVAN motivo y selección. Sin respuesta ⇒ «No se pudo
 * confirmar si se omitieron…» + refresh (jamás «no se omitió»). Todos los
 * textos en `lib/admin/conciliacion-omision.ts`.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowPathIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  omitirMovimientosAction,
  quitarOmisionAction,
  revisarOmisionAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import { BOTON_CANCELAR, MSG_SIN_CONEXION } from "@/lib/admin/conciliacion-lote";
import {
  BOTON_DESHACER,
  BOTON_REINTENTAR_REVISION,
  DESCRIPCION_OMITIR,
  ETIQUETA_LISTA_OMITIR,
  ETIQUETA_MOTIVO_OMISION,
  MSG_DESHACER_FALLO,
  NOTA_OMITIDO_NO_SE_CRUZA,
  PLACEHOLDER_MOTIVO_OMISION,
  SUGERENCIAS_MOTIVO_OMISION,
  TEXTO_FALTA_ACEPTAR_RIESGOS,
  TEXTO_OMITIENDO,
  TEXTO_REVISANDO,
  TEXTO_YA_NO_EXISTE,
  avisoAbonosIngresos,
  avisoFaltaRevisarMuchos,
  botonOmitir,
  botonQuitarRiesgos,
  casillaAceptarRiesgos,
  casillaRevisarMuchos,
  estadoMotivoOmision,
  lineaListaOmitir,
  lineaMovimientoAviso,
  mensajeErrorOmision,
  mensajeErrorRevision,
  requiereCasillaMuchos,
  resumenOmitir,
  textoAvisoRiesgos,
  textoIncierto,
  textoNoPendientesRevision,
  toastOmitidos,
  toastRestaurados,
  tituloOmitir,
  type ErrorOmision,
} from "@/lib/admin/conciliacion-omision";
import { monedaDeMovimiento, resumenSeleccion } from "@/lib/admin/conciliacion-seleccion";
import { cn } from "@/lib/utils";
import type { MovimientoBancario, MovimientoEnErrorOmision, RevisionOmision } from "@/types/conciliacion";

/** La server action ni siquiera salió (sin red, un deploy de Vercel): nunca lanza. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_SIN_CONEXION });

/**
 * «Deshacer» del toast: revierte EXACTAMENTE lo que el mismo usuario acaba de
 * omitir, sin otra confirmación (precedente del «Deshacer» de la fecha del
 * gasto). Vive fuera del diálogo: el toast dura más que él.
 */
function deshacerDesdeToast(ids: string[], refrescar: () => void): void {
  void quitarOmisionAction(ids)
    .catch(sinConexion)
    .then((r) => {
      if (r.ok) {
        toast.success(toastRestaurados(r.data?.restaurados ?? ids.length));
      } else {
        const e = mensajeErrorOmision(r, "deshacer");
        if (e.incierto) toast.error(textoIncierto("deshacer"));
        else toast.error(MSG_DESHACER_FALLO, { description: e.titulo });
      }
      refrescar();
    });
}

interface FilaAviso {
  id: string;
  linea: string;
  texto: string;
}

export interface OmitirMovimientosDialogProps {
  /** Copia CONGELADA al abrir: 1 (menú ⋯) o N (barra de la selección). */
  movimientos: MovimientoBancario[];
  /** Alias por cuenta (la lista dice de qué cuenta es cada línea). */
  aliasPorCuenta?: Readonly<Record<string, string>> | null;
  /** Moneda por cuenta (el resumen por tipo y moneda; sin ella la dice la revisión). */
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tras omitir: el padre limpia la selección (el diálogo ya cerró y refresca). */
  onOmitidos?: (ids: string[]) => void;
  /** Solo desde la barra: sacar de la selección los que tienen aviso o ya no están pendientes. */
  onQuitarDeSeleccion?: (ids: string[]) => void;
}

export function OmitirMovimientosDialog(p: OmitirMovimientosDialogProps) {
  const router = useRouter();
  const idMotivo = useId();
  const idContador = useId();
  const [lista, setLista] = useState<MovimientoBancario[]>(() => p.movimientos);
  // Revisión de riesgos: al abrir y con «Reintentar» (sobre la lista de ESE momento).
  const [revision, setRevision] = useState(() => ({ n: 0, ids: p.movimientos.map((m) => m.id) }));
  const [carga, setCarga] = useState<{ n: number; r: ActionResult<RevisionOmision> } | null>(null);
  const pedidoRef = useRef(0);
  const [motivo, setMotivo] = useState("");
  // Las casillas valen para LO QUE SE VIO al marcarlas: si cambian los avisos
  // o el número a omitir, hay que volver a marcarlas.
  const [riesgosAceptados, setRiesgosAceptados] = useState<string | null>(null);
  const [revisoMuchosN, setRevisoMuchosN] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorOmision | null>(null);
  const [riesgosApi, setRiesgosApi] = useState<MovimientoEnErrorOmision[]>([]);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const refrescarAlCerrarRef = useRef(false);

  useEffect(() => {
    const turno = ++pedidoRef.current;
    void revisarOmisionAction(revision.ids)
      .catch(sinConexion)
      .then((r) => {
        if (turno !== pedidoRef.current) return;
        setCarga({ n: revision.n, r });
      });
    return () => {
      pedidoRef.current += 1;
    };
  }, [revision]);

  const revisando = carga === null || carga.n !== revision.n;
  const datos = !revisando && carga?.r.ok ? (carga.r.data ?? null) : null;
  const errorRevision = !revisando && carga && !carga.r.ok ? mensajeErrorRevision(carga.r) : null;

  const porId = useMemo(() => new Map(lista.map((m) => [m.id, m])), [lista]);
  const revisadoPorId = useMemo(() => new Map((datos?.movimientos ?? []).map((m) => [m.id, m])), [datos]);
  // Moneda por cuenta: la de la página y, si faltaba, la que dice la revisión.
  const monedas = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [cuenta, moneda] of Object.entries(p.monedaPorCuenta ?? {})) {
      if (typeof moneda === "string" && moneda) out[cuenta] = moneda;
    }
    for (const r of datos?.movimientos ?? []) {
      const local = porId.get(r.id);
      if (local && r.moneda && !out[local.cuenta_bancaria_id]) out[local.cuenta_bancaria_id] = r.moneda;
    }
    return out;
  }, [p.monedaPorCuenta, datos, porId]);

  const riesgos = useMemo<FilaAviso[]>(() => {
    const mapa = new Map<string, FilaAviso>();
    for (const m of datos?.movimientos ?? []) {
      if (m.estado === "PENDIENTE" && m.riesgo && porId.has(m.id)) {
        mapa.set(m.id, { id: m.id, linea: lineaMovimientoAviso(m), texto: m.texto_riesgo ?? "" });
      }
    }
    // El 409 OMITIR_CON_RIESGO manda: el API volvió a revisar al omitir.
    for (const x of riesgosApi) {
      if (porId.has(x.id)) mapa.set(x.id, { id: x.id, linea: lineaMovimientoAviso(x), texto: x.texto ?? "" });
    }
    return lista.filter((m) => mapa.has(m.id)).map((m) => mapa.get(m.id) as FilaAviso);
  }, [datos, riesgosApi, porId, lista]);

  const noPendientes = useMemo<FilaAviso[]>(() => {
    const out: FilaAviso[] = [];
    const noExisten = new Set(datos?.no_existen ?? []);
    for (const m of lista) {
      const r = revisadoPorId.get(m.id);
      if (r && r.estado !== "PENDIENTE") {
        out.push({ id: m.id, linea: lineaMovimientoAviso(r), texto: r.texto_estado ?? "" });
      } else if (noExisten.has(m.id)) {
        out.push({
          id: m.id,
          linea: lineaMovimientoAviso({ ...m, moneda: monedaDeMovimiento(m, monedas) }),
          texto: TEXTO_YA_NO_EXISTE,
        });
      }
    }
    return out;
  }, [datos, lista, revisadoPorId, monedas]);

  const n = lista.length;
  const idsRiesgo = riesgos.map((r) => r.id);
  const claveRiesgos = idsRiesgo.join("|");
  const aceptaRiesgos = idsRiesgo.length > 0 && riesgosAceptados === claveRiesgos;
  const conRiesgo = new Set(idsRiesgo);
  const aEnviar = aceptaRiesgos ? lista.map((m) => m.id) : lista.filter((m) => !conRiesgo.has(m.id)).map((m) => m.id);
  const nSinRiesgo = n - idsRiesgo.length;
  const muchos = requiereCasillaMuchos(aEnviar.length);
  const revisoMuchos = revisoMuchosN === aEnviar.length;
  const estadoMotivo = estadoMotivoOmision(motivo);
  const abonos = lista.filter((m) => m.tipo === "ABONO").length;
  const resumen = resumenSeleccion(lista, monedas);
  const conSeleccion = typeof p.onQuitarDeSeleccion === "function";

  const cambiarAbierto = (abierto: boolean) => {
    // Con la petición en curso no se cierra: su resultado se pinta aquí.
    if (!abierto && enviandoRef.current) return;
    // Un 409/404 o una revisión que encontró filas que ya no están pendientes:
    // la tabla quedó vieja y se pone al día UNA vez al cerrar.
    if (!abierto && (refrescarAlCerrarRef.current || noPendientes.length > 0)) {
      refrescarAlCerrarRef.current = false;
      router.refresh();
    }
    p.onOpenChange(abierto);
  };

  /** Saca movimientos de la lista del diálogo Y de la selección (sin lista, cierra). */
  const quitar = (ids: string[]) => {
    const fuera = new Set(ids);
    const resto = lista.filter((m) => !fuera.has(m.id));
    p.onQuitarDeSeleccion?.(ids);
    setError(null);
    setAviso(null);
    if (resto.length === 0) {
      cambiarAbierto(false);
      return;
    }
    setLista(resto);
  };

  const omitir = () => {
    // Un doble clic o un clic con el diálogo ya cerrándose no corre dos veces.
    if (!p.open || enviandoRef.current) return;
    if (!estadoMotivo.valido) {
      setAviso(estadoMotivo.texto);
      return;
    }
    if (aEnviar.length === 0) {
      setAviso(TEXTO_FALTA_ACEPTAR_RIESGOS);
      return;
    }
    if (muchos && !revisoMuchos) {
      setAviso(avisoFaltaRevisarMuchos(aEnviar.length));
      return;
    }
    const ids = [...aEnviar];
    const aceptar = aceptaRiesgos ? [...idsRiesgo] : [];
    setAviso(null);
    setError(null);
    enviandoRef.current = true;
    setEnviando(true);
    void omitirMovimientosAction({ ids, motivo, aceptarRiesgoIds: aceptar })
      .catch(sinConexion)
      .then((r) => {
        enviandoRef.current = false;
        setEnviando(false);
        if (r.ok) {
          const t = toastOmitidos(r.data?.omitidos ?? ids.length);
          toast.success(t.titulo, {
            description: t.descripcion,
            duration: 10000,
            action: { label: BOTON_DESHACER, onClick: () => deshacerDesdeToast(ids, () => router.refresh()) },
          });
          p.onOmitidos?.(ids);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        const e = mensajeErrorOmision(r, "omitir");
        if (e.incierto) {
          // No se sabe si quedaron omitidos: se dice así y la lista se pone al día.
          toast.error(e.titulo);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        if (e.refrescar) refrescarAlCerrarRef.current = true;
        if (e.riesgos && e.riesgos.length > 0) {
          // Se pintan los avisos del API; motivo y selección se conservan.
          setRiesgosApi(e.riesgos);
          setRiesgosAceptados(null);
          setError(null);
          return;
        }
        setError(e);
      });
  };

  return (
    <Dialog open={p.open} onOpenChange={cambiarAbierto}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tituloOmitir(n)}</DialogTitle>
          <DialogDescription>{DESCRIPCION_OMITIR}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm font-medium">{resumenOmitir(resumen)}</p>
          <ul
            className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
            aria-label={ETIQUETA_LISTA_OMITIR}
          >
            {lista.map((m) => (
              <li key={m.id} className="truncate" title={m.descripcion ?? undefined}>
                {lineaListaOmitir(
                  m,
                  revisadoPorId.get(m.id)?.cuenta_alias ?? p.aliasPorCuenta?.[m.cuenta_bancaria_id] ?? null,
                  monedaDeMovimiento(m, monedas),
                )}
              </li>
            ))}
          </ul>

          {revisando ? (
            <p role="status" className="text-xs text-muted-foreground">
              {TEXTO_REVISANDO}
            </p>
          ) : errorRevision ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
              <span>{errorRevision}</span>
              <button
                type="button"
                onClick={() => setRevision((r) => ({ n: r.n + 1, ids: lista.map((m) => m.id) }))}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium text-foreground hover:bg-muted"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
                {BOTON_REINTENTAR_REVISION}
              </button>
            </div>
          ) : null}

          {riesgos.length > 0 && (
            <div
              role="status"
              data-riesgos-omision=""
              className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
            >
              <p className="font-medium">{textoAvisoRiesgos(riesgos.length)}</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {riesgos.map((r) => (
                  <li key={r.id}>
                    {r.linea}
                    {r.texto ? ` — ${r.texto}` : ""}
                  </li>
                ))}
              </ul>
              {conSeleccion && (
                <button
                  type="button"
                  onClick={() => quitar(idsRiesgo)}
                  className="cursor-pointer rounded-md border border-amber-500/50 px-2 py-0.5 font-medium hover:bg-amber-500/20"
                >
                  {botonQuitarRiesgos(riesgos.length)}
                </button>
              )}
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600"
                  checked={aceptaRiesgos}
                  onChange={(e) => setRiesgosAceptados(e.target.checked ? claveRiesgos : null)}
                />
                <span>{casillaAceptarRiesgos(riesgos.length)}</span>
              </label>
            </div>
          )}

          {noPendientes.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{textoNoPendientesRevision(noPendientes.length)}</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {noPendientes.map((r) => (
                  <li key={r.id}>
                    {r.linea}
                    {r.texto ? ` (${r.texto})` : ""}
                  </li>
                ))}
              </ul>
              {conSeleccion && (
                <button
                  type="button"
                  onClick={() => quitar(noPendientes.map((r) => r.id))}
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 font-medium text-foreground hover:bg-muted"
                >
                  {botonQuitarRiesgos(noPendientes.length)}
                </button>
              )}
            </div>
          )}

          {abonos > 0 && <p className="text-xs text-muted-foreground">{avisoAbonosIngresos(abonos)}</p>}

          <div className="space-y-1.5">
            <Label htmlFor={idMotivo} className="text-sm font-medium">
              {ETIQUETA_MOTIVO_OMISION}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGERENCIAS_MOTIVO_OMISION.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setMotivo(s);
                    setAviso(null);
                  }}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                    motivo.trim() === s ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200" : "border-border",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Textarea
              id={idMotivo}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setAviso(null);
              }}
              placeholder={PLACEHOLDER_MOTIVO_OMISION}
              rows={2}
              aria-describedby={idContador}
              aria-invalid={estadoMotivo.tono === "error" || undefined}
            />
            <p
              id={idContador}
              className={cn(
                "text-[11px]",
                estadoMotivo.tono === "error"
                  ? "text-destructive"
                  : estadoMotivo.tono === "aviso"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
              )}
            >
              {estadoMotivo.texto}
            </p>
            <p className="text-[11px] text-muted-foreground">{NOTA_OMITIDO_NO_SE_CRUZA}</p>
          </div>

          {muchos && (
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600"
                checked={revisoMuchos}
                onChange={(e) => {
                  setRevisoMuchosN(e.target.checked ? aEnviar.length : null);
                  setAviso(null);
                }}
              />
              <span>{casillaRevisarMuchos(aEnviar.length)}</span>
            </label>
          )}

          {aviso && (
            <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {aviso}
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <p>{error.titulo}</p>
              {error.descripcion && <p>{error.descripcion}</p>}
              {conSeleccion && error.quitarIds && error.quitarIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => quitar(error.quitarIds ?? [])}
                  className="cursor-pointer rounded-md border border-destructive/40 px-2 py-0.5 font-medium hover:bg-destructive/20"
                >
                  {botonQuitarRiesgos(error.quitarIds.length)}
                </button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            onClick={() => cambiarAbierto(false)}
            disabled={enviando}
          >
            {BOTON_CANCELAR}
          </Button>
          <Button type="button" className="cursor-pointer gap-1.5" onClick={omitir} disabled={enviando}>
            <NoSymbolIcon className="h-4 w-4" aria-hidden />
            {enviando ? TEXTO_OMITIENDO : botonOmitir({ n, nSinRiesgo, aceptaRiesgos })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
