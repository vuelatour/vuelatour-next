"use client";

/**
 * «Vincular N cargos a un gasto» (14-oct-2026, API 0.0.77, invariante 76 del
 * API). Pedido: «Necesitamos poder seleccionar varias filas de conciliaciones
 * pendientes para todo eso ponerlas a un solo gasto…».
 *
 * Lo abre la barra de la selección con 2..50 cargos de UNA moneda (con uno,
 * la tabla abre el «Vincular gasto» de siempre), con la lista CONGELADA al
 * abrir: un refresh de la página no lo desmonta ni le cambia la lista. Se
 * carga con `next/dynamic` (sin SSR) y se monta SOLO al abrirse.
 *
 * Al abrir y con cada búsqueda (300 ms) pide al API los gastos que podrían
 * pagar JUNTOS esos cargos (`gastosCandidatosDeCargosAction`): la SUMA, el
 * orden y si cada gasto queda cubierto, parcial o se pasa los calcula el API;
 * la guía de color NUNCA apaga el botón (decide el API al ligar). Avisos
 * ámbar: cargos que tienen SU propio gasto que cuadra (lo dice el API) y
 * cargos de cuentas distintas. Se elige UN gasto; el resumen visible («Se
 * vincularán 2 cargos ($400.00) al gasto «…»…») y el botón «Vincular los 2
 * cargos» son la confirmación (sin otro AlertDialog, como «Mover a…»). La
 * liga es UNA transacción del API (`ligarCargosAGastoAction`): todo o nada.
 *
 * Éxito ⇒ toast, cerrar, el padre limpia la selección y UN `router.refresh()`
 * (la server action no revalida). 4xx ⇒ caja roja con el texto del API + «No
 * se vinculó ningún cargo.» y la lista se vuelve a pedir sin perder lo
 * elegido; los cargos que ya no están pendientes se quitan de la selección
 * con un clic. Sin respuesta ⇒ «No se pudo confirmar si se vincularon…» +
 * refresh (jamás «no se vinculó»). Todos los textos en
 * `lib/admin/conciliacion-cargos-gasto.ts`.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowPathIcon, LinkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  gastosCandidatosDeCargosAction,
  ligarCargosAGastoAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import { BadgeMedioCandidato, VacioCandidatos } from "@/components/admin/conciliacion/vincular-gasto-dialog";
import { etiquetaCandidatoGasto, tituloDescripcionCandidatoGasto } from "@/lib/admin/conciliacion-auto";
import {
  BOTON_CANCELAR,
  BOTON_REINTENTAR,
  DEBOUNCE_BUSQUEDA_MS,
  LARGO_MAX_BUSQUEDA,
  MSG_SIN_CONEXION,
  TEXTO_VINCULANDO,
  VENTANA_AMPLIADA_DIAS,
  VENTANA_CARGO_DIAS,
  busquedaParaApi,
  fichaCandidatoGasto,
  textoExcluidosCandidatos,
  type AvisoExcluidos,
  type TipoEstadoBuscador,
} from "@/lib/admin/conciliacion-lote";
import {
  BOTON_AMPLIAR_120,
  DESCRIPCION_VINCULAR_CARGOS,
  ETIQUETA_LISTA_CARGOS,
  NOTA_CANDIDATO_PROPIO_NO_VERIFICADO,
  TEXTO_ELIGE_GASTO,
  TEXTO_UN_SOLO_CARGO,
  avisoCargosConCandidatoPropio,
  avisoVariasCuentas,
  botonQuitarNoPendientes,
  botonVincularCargos,
  descripcionCandidatoSuma,
  encabezadoCargos,
  estadoListaSuma,
  guiaResultado,
  hayCandidatoQueCubre,
  lineaCargoVincular,
  marcaCandidatoPropio,
  mensajeErrorCandidatosSuma,
  mensajeErrorCargosGasto,
  notaVentanaSuma,
  placeholderBuscarSuma,
  textoCargosSinSuma,
  textoResumenVincularCargos,
  textoVentanaSuma,
  toastCargosVinculados,
  tituloVincularCargos,
  type ErrorCandidatosSuma,
  type ErrorCargosGasto,
  type TonoGuia,
} from "@/lib/admin/conciliacion-cargos-gasto";
import { MIN_CARGOS_A_GASTO, monedaDeMovimiento } from "@/lib/admin/conciliacion-seleccion";
import { cn } from "@/lib/utils";
import type {
  CandidatoGastoPorSuma,
  CargoConCandidatoPropio,
  CargosGastosCandidatosResponse,
  CargosResumen,
  MovimientoBancario,
} from "@/types/conciliacion";

/** La server action ni siquiera salió (sin red, un deploy de Vercel): nunca lanza. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_SIN_CONEXION });

type Carga = { clave: string; r: ActionResult<CargosGastosCandidatosResponse> };

const CLASE_GUIA: Record<TonoGuia, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  aviso: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "bg-destructive/10 text-destructive",
};

const CLASE_AVISO_AMBAR =
  "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200";

export interface VincularCargosGastoDialogProps {
  /** Copia CONGELADA al abrir: 2..50 cargos de una moneda (la barra ya lo revisó). */
  movimientos: MovimientoBancario[];
  /** Alias por cuenta (el encabezado y, si la selección mezcla cuentas, cada renglón). */
  aliasPorCuenta?: Readonly<Record<string, string>> | null;
  /** Moneda por cuenta (el monto de cada renglón; la suma es la del API). */
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tras vincular: el padre limpia la selección (el diálogo ya cerró y refresca). */
  onVinculados?: (ids: string[]) => void;
  /** Sacar de la selección los que el API dijo que ya no están pendientes. */
  onQuitarDeSeleccion?: (ids: string[]) => void;
}

export function VincularCargosGastoDialog(p: VincularCargosGastoDialogProps) {
  const router = useRouter();
  const idBuscar = useId();
  const nombreGrupo = useId();
  const [lista, setLista] = useState<MovimientoBancario[]>(() => p.movimientos);
  // Buscador: lo tecleado y, 300 ms después, lo que viaja al servidor.
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [dias, setDias] = useState(VENTANA_CARGO_DIAS);
  const [recarga, setRecarga] = useState(0);
  const [carga, setCarga] = useState<Carga | null>(null);
  // La última respuesta BUENA para ESTOS cargos: su suma, cuentas y avisos no
  // cambian entre búsquedas (el encabezado no parpadea mientras llega otra).
  const [base, setBase] = useState<{ idsClave: string; data: CargosGastosCandidatosResponse } | null>(null);
  // El gasto elegido (su ficha se conserva aunque la búsqueda lo deje fuera).
  const [elegido, setElegido] = useState<CandidatoGastoPorSuma | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorCargosGasto | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Turno del pedido: una respuesta vieja jamás pisa a la nueva.
  const pedidoRef = useRef(0);
  const enviandoRef = useRef(false);
  const refrescarAlCerrarRef = useRef(false);

  const ids = useMemo(() => lista.map((m) => m.id), [lista]);
  const idsClave = ids.join(",");
  const unSolo = lista.length < MIN_CARGOS_A_GASTO;

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(busquedaParaApi(texto)), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const clave = `${idsClave}|${dias}|${busqueda}|${recarga}`;
  useEffect(() => {
    // Con un solo cargo el API respondería LOTE_INVALIDO: no se pregunta.
    if (unSolo) return;
    const turno = ++pedidoRef.current;
    void gastosCandidatosDeCargosAction(ids, { q: busqueda, dias })
      .catch(sinConexion)
      .then((r) => {
        if (turno !== pedidoRef.current) return;
        if (r.ok && r.data) setBase({ idsClave, data: r.data });
        setCarga({ clave, r });
      });
    return () => {
      pedidoRef.current += 1;
    };
  }, [ids, idsClave, busqueda, dias, clave, unSolo]);

  const cargando = !unSolo && (carga === null || carga.clave !== clave);
  // Solo la respuesta de ESTA lista, búsqueda y ventana (nunca una vieja).
  const respuesta = carga && carga.clave === clave ? carga.r : null;
  const data = respuesta?.ok ? (respuesta.data ?? null) : null;
  const errorLista = respuesta && !respuesta.ok ? mensajeErrorCandidatosSuma(respuesta) : null;
  const vigente = base && base.idsClave === idsClave ? base.data : null;
  const resumen = vigente?.cargos ?? null;
  const resultados = useMemo(() => data?.candidatos ?? [], [data]);
  // La ficha MÁS reciente del elegido (sus faltantes pudieron cambiar).
  const elegidoVigente = elegido ? (resultados.find((c) => c.id === elegido.id) ?? elegido) : null;
  const filas =
    elegidoVigente && !resultados.some((c) => c.id === elegidoVigente.id)
      ? [elegidoVigente, ...resultados]
      : resultados;
  const estado = estadoListaSuma({
    cargando,
    error: errorLista?.texto ?? null,
    q: busqueda,
    resultados: resultados.length,
    truncado: data?.truncado ?? false,
    dias,
  });
  // Los gastos del monto de la suma que NO entraron (en efectivo, ya
  // conciliados, otra moneda, fuera de la ventana): bajo el vacío o cuando
  // ninguno de la lista queda cubierto.
  const avisosExcluidos = useMemo(
    () =>
      data && (resultados.length === 0 || !hayCandidatoQueCubre(resultados))
        ? textoExcluidosCandidatos(data.excluidos, data.cargos?.suma ?? 0, {
            monedaCuenta: data.cargos?.moneda ?? null,
            dias,
            montoBuscado: data.excluidos_monto,
            variosCargos: true,
          })
        : [],
    [data, resultados, dias],
  );
  const n = lista.length;
  const resumenTexto =
    elegidoVigente && resumen && !unSolo
      ? textoResumenVincularCargos({ n, suma: resumen.suma, moneda: resumen.moneda, gasto: elegidoVigente })
      : null;

  const cambiarAbierto = (abierto: boolean) => {
    // Con la liga en curso no se cierra: su resultado se pinta aquí.
    if (!abierto && enviandoRef.current) return;
    // Un 409/404 (o una lectura que dijo que alguno ya no está pendiente): la
    // tabla quedó vieja y se pone al día UNA vez al cerrar.
    if (!abierto && (refrescarAlCerrarRef.current || errorLista?.refrescar)) {
      refrescarAlCerrarRef.current = false;
      router.refresh();
    }
    p.onOpenChange(abierto);
  };

  /**
   * Saca cargos de la lista del diálogo Y de la selección (sin cargos,
   * cierra). Los quitados ya no están pendientes (o no existen): la tabla se
   * pone al día al cerrar.
   */
  const quitar = (quitarIds: string[]) => {
    const fuera = new Set(quitarIds.map((x) => x.toLowerCase()));
    const resto = lista.filter((m) => !fuera.has(m.id.toLowerCase()));
    p.onQuitarDeSeleccion?.(quitarIds);
    refrescarAlCerrarRef.current = true;
    setError(null);
    setAviso(null);
    if (resto.length === 0) {
      cambiarAbierto(false);
      return;
    }
    setLista(resto);
  };

  const elegir = (c: CandidatoGastoPorSuma) => {
    setElegido(c);
    setAviso(null);
    setError(null);
  };

  const vincular = () => {
    // Un doble clic o un clic con el diálogo ya cerrándose no corre dos veces.
    if (!p.open || enviandoRef.current) return;
    if (unSolo) {
      setAviso(TEXTO_UN_SOLO_CARGO);
      return;
    }
    const gasto = elegidoVigente;
    if (!gasto) {
      setAviso(TEXTO_ELIGE_GASTO);
      return;
    }
    // Se congela lo que se ve: ESE gasto y ESTOS cargos.
    const idsEnvio = [...ids];
    setAviso(null);
    setError(null);
    enviandoRef.current = true;
    setEnviando(true);
    void ligarCargosAGastoAction(gasto.id, idsEnvio)
      .catch(sinConexion)
      .then((r) => {
        enviandoRef.current = false;
        setEnviando(false);
        if (r.ok) {
          const t = toastCargosVinculados(r.data, idsEnvio.length);
          toast.success(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
          p.onVinculados?.(idsEnvio);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        const e = mensajeErrorCargosGasto(r);
        if (e.incierto) {
          // No se sabe si quedaron ligados: se dice así y la lista se pone al día.
          toast.error(e.titulo);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        if (e.refrescar) refrescarAlCerrarRef.current = true;
        if (e.soltarGasto) setElegido(null);
        // Nada se escribió y los faltantes pudieron cambiar: la lista se
        // vuelve a pedir sin perder lo elegido.
        if (e.recargarLista) setRecarga((x) => x + 1);
        setError(e);
      });
  };

  const quedanTrasQuitar = error ? n - error.quitarIds.length : n;

  return (
    <Dialog open={p.open} onOpenChange={cambiarAbierto}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tituloVincularCargos(n)}</DialogTitle>
          <DialogDescription>{DESCRIPCION_VINCULAR_CARGOS}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <CargosDelLote
            lista={lista}
            resumen={resumen}
            propios={vigente ? vigente.cargos_con_candidato_propio : undefined}
            aliasPorCuenta={p.aliasPorCuenta}
            monedaPorCuenta={p.monedaPorCuenta}
          />

          {unSolo ? (
            <p role="status" className={CLASE_AVISO_AMBAR}>
              {TEXTO_UN_SOLO_CARGO}
            </p>
          ) : (
            <ListaGastosPorSuma
              idBuscar={idBuscar}
              nombreGrupo={nombreGrupo}
              texto={texto}
              onTexto={setTexto}
              suma={resumen?.suma ?? null}
              dias={dias}
              onAmpliar={() => setDias(VENTANA_AMPLIADA_DIAS)}
              estado={estado}
              filas={filas}
              elegidoId={elegidoVigente?.id ?? null}
              onElegir={elegir}
              errorLista={errorLista}
              onReintentar={() => setRecarga((x) => x + 1)}
              onQuitar={p.onQuitarDeSeleccion ? quitar : undefined}
              avisos={avisosExcluidos}
              disabled={enviando}
            />
          )}

          {resumenTexto && (
            <p data-resumen-vincular="" className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium">
              {resumenTexto}
            </p>
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
              {error.descripcion && <p className="font-medium">{error.descripcion}</p>}
              {p.onQuitarDeSeleccion && error.quitarIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => quitar(error.quitarIds)}
                  className="cursor-pointer rounded-md border border-destructive/40 px-2 py-0.5 font-medium hover:bg-destructive/20"
                >
                  {botonQuitarNoPendientes(error.quitarIds.length)}
                </button>
              )}
              {error.quitarIds.length > 0 && quedanTrasQuitar < MIN_CARGOS_A_GASTO && <p>{TEXTO_UN_SOLO_CARGO}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {/* PUNTO DE ENGANCHE del paso 4 (FASE «crear por la suma»): aquí, a
              la izquierda, va «¿No está el gasto? Créalo por $X»
              (`botonAbrirCrearSuma`, solo con `catalogosGasto` y la suma del
              API); abre el paso «Crear el gasto con la suma» dentro de este
              mismo diálogo. Hoy no se ofrece. */}
          <span />
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => cambiarAbierto(false)}
              disabled={enviando}
            >
              {BOTON_CANCELAR}
            </Button>
            <Button type="button" className="cursor-pointer gap-1.5" onClick={vincular} disabled={enviando}>
              <LinkIcon className="h-4 w-4" aria-hidden />
              {enviando ? TEXTO_VINCULANDO : botonVincularCargos(n)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Los cargos que se vinculan: el encabezado con la SUMA DEL API (mientras no
 * llega, solo el conteo), un renglón por cargo (con la marca ámbar si tiene
 * su propio gasto) y los avisos ámbar del API y de cuentas distintas.
 */
export function CargosDelLote({
  lista,
  resumen,
  propios,
  aliasPorCuenta,
  monedaPorCuenta,
}: {
  lista: readonly MovimientoBancario[];
  /** `cargos` del API (null mientras no responde o si falló). */
  resumen: CargosResumen | null;
  /** `cargos_con_candidato_propio` del API: null = no se pudo revisar; undefined = sin respuesta. */
  propios: readonly CargoConCandidatoPropio[] | null | undefined;
  aliasPorCuenta?: Readonly<Record<string, string>> | null;
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
}) {
  const propioDe = new Map((propios ?? []).map((x) => [x.id, x]));
  const variasCuentas = new Set(lista.map((m) => m.cuenta_bancaria_id)).size > 1;
  const avisoPropio = avisoCargosConCandidatoPropio(propios);
  const avisoCuentas = resumen ? avisoVariasCuentas(resumen.cuentas, aliasPorCuenta) : null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{resumen ? encabezadoCargos(resumen, aliasPorCuenta) : textoCargosSinSuma(lista.length)}</p>
      <ul
        aria-label={ETIQUETA_LISTA_CARGOS}
        className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
      >
        {lista.map((m) => {
          const l = lineaCargoVincular(
            m,
            variasCuentas ? (aliasPorCuenta?.[m.cuenta_bancaria_id] ?? null) : null,
            monedaDeMovimiento(m, monedaPorCuenta) ?? resumen?.moneda ?? null,
          );
          const propio = propioDe.get(m.id);
          return (
            <li key={m.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate" title={m.descripcion ?? undefined}>
                {l.texto}
                {propio && (
                  <span data-cargo-con-propio="" className="text-amber-700 dark:text-amber-300">
                    {` · ${marcaCandidatoPropio(propio)}`}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-foreground">{l.monto}</span>
            </li>
          );
        })}
      </ul>
      {avisoPropio && (
        <p role="status" data-aviso-candidato-propio="" className={CLASE_AVISO_AMBAR}>
          {avisoPropio}
        </p>
      )}
      {propios === null && <p className="text-[11px] text-muted-foreground">{NOTA_CANDIDATO_PROPIO_NO_VERIFICADO}</p>}
      {avisoCuentas && (
        <p role="status" data-aviso-varias-cuentas="" className={CLASE_AVISO_AMBAR}>
          {avisoCuentas}
        </p>
      )}
    </div>
  );
}

/**
 * El buscador y la lista de gastos candidatos (UN gasto con radio), cada uno
 * con su ficha y la guía del `resultado` del API. El error va antes que el
 * vacío (jamás «ningún gasto» cuando la lectura falló).
 */
export function ListaGastosPorSuma(p: {
  idBuscar: string;
  nombreGrupo: string;
  texto: string;
  onTexto: (t: string) => void;
  /** La suma del API (el ejemplo del buscador); null mientras no responde. */
  suma: number | null;
  dias: number;
  onAmpliar: () => void;
  estado: { tipo: TipoEstadoBuscador; texto: string };
  filas: readonly CandidatoGastoPorSuma[];
  elegidoId: string | null;
  onElegir: (c: CandidatoGastoPorSuma) => void;
  errorLista: ErrorCandidatosSuma | null;
  onReintentar: () => void;
  /** Sin él (fuera de la selección) no se ofrece «Quitar…». */
  onQuitar?: (ids: string[]) => void;
  avisos: readonly AvisoExcluidos[];
  disabled: boolean;
}) {
  const { estado } = p;
  const visibles = p.filas.filter((c) => estado.tipo === "lista" || c.id === p.elegidoId);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Label htmlFor={p.idBuscar}>{textoVentanaSuma(p.dias)}</Label>
        {p.dias < VENTANA_AMPLIADA_DIAS && (
          <button
            type="button"
            className="cursor-pointer text-xs text-brand-600 underline-offset-2 hover:underline"
            onClick={p.onAmpliar}
          >
            {BOTON_AMPLIAR_120}
          </button>
        )}
      </div>
      <Input
        id={p.idBuscar}
        value={p.texto}
        onChange={(e) => p.onTexto(e.target.value)}
        placeholder={placeholderBuscarSuma(p.suma)}
        maxLength={LARGO_MAX_BUSQUEDA}
        autoComplete="off"
      />
      <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {visibles.map((c) => {
          const elegido = c.id === p.elegidoId;
          const ficha = fichaCandidatoGasto(c);
          const desc = descripcionCandidatoSuma(c);
          const guia = guiaResultado(c);
          return (
            <label
              key={c.id}
              data-candidato-suma=""
              className={cn(
                "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted/50",
                elegido && "bg-brand-50 dark:bg-brand-900/30",
              )}
            >
              <input
                type="radio"
                name={p.nombreGrupo}
                checked={elegido}
                onChange={() => p.onElegir(c)}
                disabled={p.disabled}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="block min-w-0 truncate font-medium">{etiquetaCandidatoGasto(ficha)}</span>
                  <BadgeMedioCandidato candidato={c} />
                </span>
                {desc && (
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    title={tituloDescripcionCandidatoGasto(ficha) ?? undefined}
                  >
                    {desc}
                  </span>
                )}
                {guia && (
                  <span
                    data-guia={guia.tono}
                    className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", CLASE_GUIA[guia.tono])}
                  >
                    {guia.texto}
                  </span>
                )}
              </span>
            </label>
          );
        })}
        {estado.tipo === "cargando" ? (
          <p role="status" className="px-3 py-4 text-center text-xs text-muted-foreground">
            {estado.texto}
          </p>
        ) : estado.tipo === "error" ? (
          <div role="alert" className="space-y-1.5 px-3 py-3 text-center text-xs">
            <p className="text-amber-700 dark:text-amber-300">{estado.texto}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {p.errorLista?.reintentar && (
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
                  onClick={p.onReintentar}
                >
                  <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
                  {BOTON_REINTENTAR}
                </button>
              )}
              {p.onQuitar && (p.errorLista?.quitarIds.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
                  onClick={() => p.onQuitar?.(p.errorLista?.quitarIds ?? [])}
                >
                  {botonQuitarNoPendientes(p.errorLista?.quitarIds.length ?? 0)}
                </button>
              )}
            </div>
          </div>
        ) : estado.tipo === "vacio_sin_q" || estado.tipo === "vacio_con_q" ? (
          <VacioCandidatos texto={estado.texto} avisos={p.avisos} onVolverABuscar={p.onReintentar} />
        ) : p.avisos.length > 0 ? (
          // Ninguno de la lista queda cubierto: los del monto de la suma que no entraron.
          <VacioCandidatos texto={null} avisos={p.avisos} onVolverABuscar={p.onReintentar} />
        ) : null}
      </div>
      {estado.tipo === "lista" && estado.texto && <p className="text-[11px] text-muted-foreground">{estado.texto}</p>}
      <p className="text-[11px] text-muted-foreground">{notaVentanaSuma(p.dias)}</p>
    </div>
  );
}
