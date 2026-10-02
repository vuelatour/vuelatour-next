"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import {
  gastosCandidatosAction,
  linkMovimientoAction,
  linkMovimientoGastosAction,
  sugerirMovimientoAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import {
  descripcionCandidatoGasto,
  etiquetaCandidatoGasto,
  motivoPendienteDe,
  textoConfianza,
} from "@/lib/admin/conciliacion-auto";
import {
  BOTON_CANCELAR,
  BOTON_REINTENTAR,
  BOTON_SUGERIR_IA,
  BUSCANDO_SUGERENCIA_IA,
  DEBOUNCE_BUSQUEDA_MS,
  ETIQUETA_SUGERENCIA_IA,
  ETIQUETA_SUGERIDO,
  LARGO_MAX_BUSQUEDA,
  MSG_ELIGE_UN_GASTO,
  MSG_LOTE_API_VIEJO,
  MSG_SIN_CONEXION,
  MSG_TOPE_GASTOS_LOTE,
  MAX_GASTOS_LOTE,
  NOTA_IA_PROPONE,
  NOTA_VENTANA_CARGO,
  PLACEHOLDER_BUSCAR_GASTO,
  TEXTO_IA_NO_DISPONIBLE,
  TEXTO_VINCULANDO,
  TITULO_VINCULAR_GASTO,
  VENTANA_AMPLIADA_DIAS,
  VENTANA_CARGO_DIAS,
  bloqueoDeFila,
  botonVincularGastos,
  busquedaParaApi,
  conSugeridoAlFrente,
  descripcionVincularGasto,
  esApiSinLote,
  estadoBuscadorGastos,
  estadoLoteCargo,
  etiquetaListaCandidatos,
  fichaCandidatoGasto,
  fichaSugerida,
  idsParaVincular,
  listaConMarcadosPrimero,
  mensajeErrorBusquedaGastos,
  mensajeErrorVincularGastos,
  opcionesRespaldoVincular,
  textoAmpliarVentana,
  textoErrorSugerencia,
  textoIaSinPropuesta,
  textoMotivoPendienteDialogo,
  textoSumaLote,
  toastVinculoGastos,
  type TonoSumaLote,
} from "@/lib/admin/conciliacion-lote";
import { cn } from "@/lib/utils";
import type {
  GastoCandidato,
  GastosCandidatosResponse,
  MovimientoBancario,
  SugerenciaConciliacion,
} from "@/types/conciliacion";

interface VincularGastoDialogProps {
  /** El CARGO del banco que se va a ligar (uno o varios gastos). */
  movimiento: MovimientoBancario;
  /** Lista precargada de la página: solo es el RESPALDO con un API previo. */
  gastos: SearchableSelectOption[];
  /** Abrir pidiendo la sugerencia de la IA («Sugerir con IA» del menú). */
  conIa?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Vincular gasto» de un CARGO (2-oct-2026, API 0.0.52): UNA lista con
 * casillas de los gastos candidatos del servidor (±30 días, buscador por
 * monto / proveedor / nota) para ligar el cargo con UNO o con VARIOS gastos
 * (los SPEI de SAESA pagan 2 o 3 facturas a la vez). La suma de lo marcado es
 * solo una GUÍA: quien acepta o rechaza es el API. Un API previo (sin la ruta
 * de candidatos) deja la lista precargada de siempre, un solo gasto.
 */
export function VincularGastoDialog({
  movimiento,
  gastos,
  conIa = false,
  open,
  onOpenChange,
}: VincularGastoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{TITULO_VINCULAR_GASTO}</DialogTitle>
          <DialogDescription>{descripcionVincularGasto(movimiento)}</DialogDescription>
        </DialogHeader>
        {open && (
          <SelectorGastos
            movimiento={movimiento}
            gastos={gastos}
            conIa={conIa}
            onCerrar={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Carga = { clave: string; r: ActionResult<GastosCandidatosResponse> };

type EstadoSugerencia =
  | { tipo: "nada" }
  | { tipo: "cargando" }
  | { tipo: "listo"; data: SugerenciaConciliacion };

const CLASE_TONO: Record<TonoSumaLote, string> = {
  verde: "text-emerald-600 dark:text-emerald-400",
  ambar: "text-amber-600 dark:text-amber-400",
  rojo: "text-destructive",
  neutro: "text-muted-foreground",
};

const sinConexion = (err: unknown) => ({
  ok: false as const,
  error: err instanceof Error && err.message ? err.message : MSG_SIN_CONEXION,
});

function SelectorGastos({
  movimiento,
  gastos,
  conIa,
  onCerrar,
}: {
  movimiento: MovimientoBancario;
  gastos: SearchableSelectOption[];
  conIa: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const idBuscar = useId();
  const [pending, start] = useTransition();

  // Buscador: lo tecleado y, 300 ms después, lo que viaja al servidor.
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [dias, setDias] = useState(VENTANA_CARGO_DIAS);
  const [recarga, setRecarga] = useState(0);
  const [carga, setCarga] = useState<Carga | null>(null);
  // Moneda de la CUENTA del cargo: no cambia entre búsquedas, así que se
  // conserva mientras llega la siguiente (las casillas vetadas no parpadean).
  const [monedaCuenta, setMonedaCuenta] = useState<string | null>(null);
  // Turno del pedido: una respuesta vieja (búsqueda anterior) jamás pisa a
  // la nueva.
  const pedidoRef = useRef(0);
  // El API no sabe de lotes (respaldo: lista precargada, un solo gasto).
  const [forzarSinLote, setForzarSinLote] = useState(false);
  // Fichas MARCADAS, en el orden en que se marcaron (suben al principio
  // aunque no coincidan con la búsqueda).
  const [marcados, setMarcados] = useState<GastoCandidato[]>([]);
  // Respaldo: un solo gasto en el selector de siempre.
  const [seleccionUnica, setSeleccionUnica] = useState("");
  const [sug, setSug] = useState<EstadoSugerencia>(conIa ? { tipo: "cargando" } : { tipo: "nada" });

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(busquedaParaApi(texto)), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const clave = `${dias}|${busqueda}|${recarga}`;
  useEffect(() => {
    const turno = ++pedidoRef.current;
    void gastosCandidatosAction(movimiento.id, { q: busqueda, dias })
      .catch(sinConexion)
      .then((r) => {
        if (turno !== pedidoRef.current) return;
        if (r.ok && r.data) setMonedaCuenta(r.data.movimiento.moneda ?? null);
        setCarga({ clave, r });
      });
    return () => {
      pedidoRef.current += 1;
    };
  }, [movimiento.id, busqueda, dias, clave]);

  const cargando = carga === null || carga.clave !== clave;
  const respuesta = !cargando && carga ? carga.r : null;
  const modoRespaldo = forzarSinLote || (respuesta !== null && !respuesta.ok && esApiSinLote(respuesta));
  const data = respuesta?.ok ? (respuesta.data ?? null) : null;
  const errorBusqueda =
    respuesta && !respuesta.ok && !modoRespaldo ? mensajeErrorBusquedaGastos(respuesta) : null;

  const sugerencia = sug.tipo === "listo" ? sug.data : null;
  const sugerido = fichaSugerida(sugerencia);
  const resultados = useMemo(() => data?.candidatos ?? [], [data]);
  const filas = useMemo(
    () => listaConMarcadosPrimero(conSugeridoAlFrente(resultados, sugerido), marcados),
    [resultados, sugerido, marcados],
  );
  const estado = estadoBuscadorGastos({
    cargando,
    error: errorBusqueda,
    q: busqueda,
    resultados: resultados.length,
    truncado: data?.truncado ?? false,
    dias,
  });
  const suma = textoSumaLote(
    estadoLoteCargo({ montoCargo: movimiento.monto, monedaCuenta, gastos: marcados }),
  );
  const motivo = motivoPendienteDe(movimiento);

  /** La IA PROPONE: marca ★ su gasto y lo preselecciona; nunca liga sola. */
  const consultarIa = useCallback(() => {
    void sugerirMovimientoAction(movimiento.id)
      .catch(sinConexion)
      .then((r) => {
        if (!r.ok || !r.data) {
          const t = textoErrorSugerencia(r);
          toast.error(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
          setSug({ tipo: "nada" });
          return;
        }
        const s = r.data;
        setSug({ tipo: "listo", data: s });
        const ficha = fichaSugerida(s);
        if (!ficha) return;
        setSeleccionUnica(ficha.id);
        setMarcados((prev) =>
          prev.some((m) => m.id === ficha.id) || bloqueoDeFila(ficha, null, prev) != null
            ? prev
            : [...prev, ficha],
        );
      });
  }, [movimiento.id]);

  // «Sugerir con IA» desde el menú: se pide UNA vez al abrir.
  const iaPendienteRef = useRef(conIa);
  useEffect(() => {
    if (!iaPendienteRef.current) return;
    iaPendienteRef.current = false;
    consultarIa();
  }, [consultarIa]);

  const pedirIa = () => {
    setSug({ tipo: "cargando" });
    consultarIa();
  };

  const alternar = (c: GastoCandidato) => {
    const yaMarcado = marcados.some((m) => m.id === c.id);
    if (!yaMarcado && marcados.length >= MAX_GASTOS_LOTE) {
      toast.error(MSG_TOPE_GASTOS_LOTE);
      return;
    }
    setMarcados((prev) =>
      yaMarcado ? prev.filter((m) => m.id !== c.id) : prev.some((m) => m.id === c.id) ? prev : [...prev, c],
    );
  };

  const etiquetaDe = (id: string) => {
    const f = marcados.find((m) => m.id === id) ?? resultados.find((m) => m.id === id);
    return f ? etiquetaCandidatoGasto(fichaCandidatoGasto(f)) : null;
  };

  const tras = (r: ActionResult<MovimientoBancario>) => {
    if (r.ok) {
      const t = toastVinculoGastos(r.data);
      toast.success(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
      onCerrar();
      return;
    }
    const e = mensajeErrorVincularGastos(r, etiquetaDe);
    toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
    if (e.apiSinLote) {
      // El API no sabe de lotes: queda el camino de siempre (un gasto).
      setForzarSinLote(true);
      return;
    }
    if (e.recargar) {
      onCerrar();
      router.refresh();
      return;
    }
    // Rechazo legítimo (no cuadra, ya cubierto…): los faltantes pudieron
    // cambiar; se vuelve a pedir la lista sin perder lo marcado.
    setRecarga((n) => n + 1);
  };

  const vincular = () => {
    // Las vetadas (otra moneda, cruzado) NUNCA viajan dentro de un lote.
    const ids = idsParaVincular(marcados, monedaCuenta);
    if (ids.length === 0) {
      toast.error(MSG_ELIGE_UN_GASTO);
      return;
    }
    start(async () => {
      const r =
        ids.length >= 2
          ? await linkMovimientoGastosAction(movimiento.id, ids).catch(sinConexion)
          : await linkMovimientoAction(movimiento.id, ids[0]).catch(sinConexion);
      tras(r);
    });
  };

  const vincularUno = () => {
    if (!seleccionUnica) {
      toast.error(MSG_ELIGE_UN_GASTO);
      return;
    }
    start(async () => {
      const r = await linkMovimientoAction(movimiento.id, seleccionUnica).catch(sinConexion);
      tras(r);
    });
  };

  const opcionesRespaldo = useMemo(
    () => opcionesRespaldoVincular(gastos, sugerencia),
    [gastos, sugerencia],
  );

  return (
    <>
      <div className="space-y-2">
        {motivo && (
          <p className="text-xs text-muted-foreground" title={motivo.detalle}>
            {textoMotivoPendienteDialogo(motivo.etiqueta)}
          </p>
        )}

        {modoRespaldo ? (
          <div className="space-y-1.5">
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-300">
              {MSG_LOTE_API_VIEJO}
            </p>
            <SearchableSelect
              options={opcionesRespaldo}
              value={seleccionUnica}
              onChange={setSeleccionUnica}
              placeholder={PLACEHOLDER_BUSCAR_GASTO}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor={idBuscar}>{etiquetaListaCandidatos(dias)}</Label>
              {dias < VENTANA_AMPLIADA_DIAS && (
                <button
                  type="button"
                  className="cursor-pointer text-xs text-brand-600 underline-offset-2 hover:underline"
                  onClick={() => setDias(VENTANA_AMPLIADA_DIAS)}
                >
                  {textoAmpliarVentana(VENTANA_AMPLIADA_DIAS)}
                </button>
              )}
            </div>
            <Input
              id={idBuscar}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={PLACEHOLDER_BUSCAR_GASTO}
              maxLength={LARGO_MAX_BUSQUEDA}
              autoComplete="off"
            />
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {filas
                .filter((c) => estado.tipo === "lista" || marcados.some((m) => m.id === c.id))
                .map((c) => {
                  const marcado = marcados.some((m) => m.id === c.id);
                  const bloqueo = bloqueoDeFila(c, monedaCuenta, marcados);
                  const ficha = fichaCandidatoGasto(c);
                  const desc = descripcionCandidatoGasto(ficha);
                  const esSugerido = c.id === sugerido?.id;
                  return (
                    <label
                      key={c.id}
                      title={bloqueo ?? undefined}
                      className={cn(
                        "flex items-start gap-2 px-3 py-2 text-sm",
                        bloqueo ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={bloqueo != null}
                        onChange={() => alternar(c)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {esSugerido ? "★ " : ""}
                          {etiquetaCandidatoGasto(ficha)}
                        </span>
                        {desc && <span className="block truncate text-xs text-muted-foreground">{desc}</span>}
                        {esSugerido && (
                          <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {ETIQUETA_SUGERIDO}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              {estado.tipo === "cargando" ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">{estado.texto}</p>
              ) : estado.tipo === "error" ? (
                <div className="space-y-1 px-3 py-3 text-center text-xs">
                  <p className="text-amber-700 dark:text-amber-300">{estado.texto}</p>
                  <button
                    type="button"
                    className="cursor-pointer text-brand-600 underline underline-offset-2 hover:no-underline"
                    onClick={() => setRecarga((n) => n + 1)}
                  >
                    {BOTON_REINTENTAR}
                  </button>
                </div>
              ) : estado.tipo === "vacio_sin_q" || estado.tipo === "vacio_con_q" ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">{estado.texto}</p>
              ) : null}
            </div>
            {estado.tipo === "lista" && estado.texto && (
              <p className="text-[11px] text-muted-foreground">{estado.texto}</p>
            )}
            {suma && <p className={cn("text-xs font-medium", CLASE_TONO[suma.tono])}>{suma.texto}</p>}
          </div>
        )}

        {/* La IA PROPONE (★ dentro de la lista); vincular lo confirma una persona. */}
        <div className="flex flex-wrap items-center gap-2">
          {sug.tipo === "cargando" ? (
            <span className="text-xs text-muted-foreground">{BUSCANDO_SUGERENCIA_IA}</span>
          ) : (
            <button
              type="button"
              className="cursor-pointer text-xs text-brand-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              onClick={pedirIa}
              disabled={pending}
            >
              {BOTON_SUGERIR_IA}
            </button>
          )}
        </div>
        {sugerencia && sugerencia.gasto_id_sugerido && (
          <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                {ETIQUETA_SUGERENCIA_IA}
              </Badge>
              <span className="text-muted-foreground">{textoConfianza(sugerencia.confianza).texto}</span>
            </div>
            {sugerencia.razon && <p className="text-muted-foreground">{sugerencia.razon}</p>}
            {(sugerencia.evidencias?.length ?? 0) > 0 && (
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {sugerencia.evidencias!.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">{NOTA_IA_PROPONE}</p>
          </div>
        )}
        {sugerencia && !sugerencia.disponible && (
          <p className="text-xs text-muted-foreground">{TEXTO_IA_NO_DISPONIBLE}</p>
        )}
        {sugerencia &&
          sugerencia.disponible &&
          !sugerencia.gasto_id_sugerido &&
          (sugerencia.motivo_sin_match ?? sugerencia.razon) && (
            <p className="text-xs text-muted-foreground">
              {textoIaSinPropuesta(sugerencia.motivo_sin_match ?? sugerencia.razon ?? "")}
            </p>
          )}

        {!modoRespaldo && <p className="text-[11px] text-muted-foreground">{NOTA_VENTANA_CARGO(dias)}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={pending}>
          {BOTON_CANCELAR}
        </Button>
        {modoRespaldo ? (
          <Button onClick={vincularUno} disabled={pending || !seleccionUnica}>
            {pending ? TEXTO_VINCULANDO : botonVincularGastos(seleccionUnica ? 1 : 0)}
          </Button>
        ) : (
          <Button onClick={vincular} disabled={pending || marcados.length === 0}>
            {pending ? TEXTO_VINCULANDO : botonVincularGastos(marcados.length)}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
