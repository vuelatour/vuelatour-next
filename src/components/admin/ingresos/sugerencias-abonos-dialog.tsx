"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  aceptarPropuestaAbonoAction,
  sugerirAbonosAction,
} from "@/app/admin/ingresos/actions";
import {
  RegistrarIngresoDialog,
  type CatalogosIngreso,
} from "@/components/admin/ingresos/registrar-ingreso-dialog";
import {
  aceptableEnLote,
  aceptarEnLote,
  descripcionFichaCandidato,
  lineaConfirmacionLote,
  preseleccionada,
  resumenSugerencias,
  sePuedeAceptar,
  textoAccionPropuesta,
  textoConfianza,
  textoConfirmarLote,
  textoIaNoDisponible,
  textoResultadoLote,
} from "@/lib/admin/ingresos-ui";
import { etiquetaCategoriaIngreso } from "@/lib/admin/categorias-ingreso";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { AbonoPendiente, PropuestaAbono, SugerirAbonosRespuesta } from "@/types/ingresos";

export const AVISO_IA_INGRESOS =
  "La IA propone y tú confirmas: nada se liga solo. Cada consulta consume créditos (Configuración → Consumo de IA).";

interface BaseProps {
  cuentas: { id: string; label: string }[];
  /** Abonos de la vista: de ahí sale la ficha completa para «Registrar». */
  abonos: AbonoPendiente[];
  catalogos: CatalogosIngreso;
  cuentaId?: string;
  desde?: string;
  hasta?: string;
}

/** Botón «Sugerir con IA (pendientes)» de la barra de «Por conciliar». */
export function SugerenciasAbonosBoton(props: BaseProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <SparklesIcon className="h-4 w-4" />
        Sugerir con IA (pendientes)
      </Button>
      <SugerenciasAbonosDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * «Sugerir con IA» para ABONOS (24-sep-2026). La IA PROPONE (ligar a un cobro
 * o ingreso, registrar como ingreso, clasificar traspaso/reverso) y una
 * persona confirma cada una — o «Aceptar las marcadas» con UNA confirmación.
 * Solo van marcadas de entrada las ligas con MONTO EXACTO (lo calcula el API)
 * y confianza ≥ 85 %, y las clasificaciones por regla; un posible duplicado
 * nunca. Con `movimientoIds` consulta solo esos (menú de la fila) y arranca
 * sola; en lote se pide a mano (cada consulta gasta créditos).
 */
export function SugerenciasAbonosDialog({
  open,
  onOpenChange,
  movimientoIds,
  ...props
}: BaseProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimientoIds?: string[];
}) {
  const [corriendo, setCorriendo] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // No cerrar a media consulta o a medio lote (evita doble gasto).
        if (!o && corriendo) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sugerencias de la IA para los abonos</DialogTitle>
          <DialogDescription>
            La IA lee la descripción del banco (nombre del ordenante, referencia) y los cobros e
            ingresos cercanos, y propone qué es cada abono.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PanelSugerencias
            {...props}
            movimientoIds={movimientoIds}
            onCorriendo={setCorriendo}
            onCerrar={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type EstadoFila = { tipo: "ok"; texto: string } | { tipo: "error"; texto: string };

/** Ficha mínima de un abono cuando la vista no lo trae (consulta dirigida). */
function abonoDePropuesta(p: PropuestaAbono, abonos: AbonoPendiente[]): AbonoPendiente {
  const a = abonos.find((x) => x.id === p.movimiento_id);
  if (a) {
    return {
      ...a,
      categoria_sugerida: p.categoria_sugerida ?? a.categoria_sugerida,
      cliente_sugerido: p.cliente_sugerido ?? a.cliente_sugerido,
    };
  }
  return {
    id: p.movimiento_id,
    cuenta_bancaria_id: "",
    cuenta_alias: p.cuenta_alias,
    cuenta_moneda: p.cuenta_moneda,
    cuenta_tipo: null,
    fecha: p.fecha,
    monto: p.monto,
    monto_bruto: null,
    comision_monto: null,
    descripcion: p.descripcion,
    referencia: p.referencia,
    notas: null,
    patron: null,
    motivo_pendiente: null,
    candidatos_n: null,
    exactos_manual: null,
    posible_duplicado_de: null,
    cliente_sugerido: p.cliente_sugerido,
    categoria_sugerida: p.categoria_sugerida,
  };
}

function PanelSugerencias({
  cuentas,
  abonos,
  catalogos,
  cuentaId,
  desde,
  hasta,
  movimientoIds,
  onCorriendo,
  onCerrar,
}: BaseProps & {
  movimientoIds?: string[];
  onCorriendo: (v: boolean) => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const dirigida = (movimientoIds?.length ?? 0) > 0;
  const [cuenta, setCuenta] = useState(cuentaId ?? "");
  const [ini, setIni] = useState(desde ?? "");
  const [fin, setFin] = useState(hasta ?? "");
  const [buscando, setBuscando] = useState(dirigida);
  const [res, setRes] = useState<SugerirAbonosRespuesta | null>(null);
  const [propuestas, setPropuestas] = useState<PropuestaAbono[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<Record<string, EstadoFila>>({});
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [corriendoLote, setCorriendoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<string | null>(null);
  const [registrar, setRegistrar] = useState<{ p: PropuestaAbono; abono: AbonoPendiente } | null>(null);

  const recibir = (data: SugerirAbonosRespuesta) => {
    setRes(data);
    setPropuestas(data.propuestas);
    setMarcadas(new Set(data.propuestas.filter(preseleccionada).map((p) => p.movimiento_id)));
    setEstado({});
    setResultadoLote(null);
  };

  const consultar = async () => {
    if (!dirigida && ini && fin && ini > fin) {
      toast.error("La fecha «desde» no puede ser posterior a «hasta».");
      return;
    }
    setBuscando(true);
    onCorriendo(true);
    const r = await sugerirAbonosAction(
      dirigida
        ? { movimiento_ids: movimientoIds }
        : {
            ...(cuenta ? { cuenta_bancaria_id: cuenta } : {}),
            ...(ini ? { desde: ini } : {}),
            ...(fin ? { hasta: fin } : {}),
            limite: 20,
          },
    ).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "No se pudo" }));
    setBuscando(false);
    onCorriendo(false);
    if (!r.ok || !("data" in r) || !r.data) {
      toast.error(r.error ?? "No se pudieron pedir las sugerencias.");
      return;
    }
    recibir(r.data);
  };

  // Consulta DIRIGIDA (menú de la fila): el clic ya fue la petición explícita.
  useEffect(() => {
    if (!dirigida) return;
    let vivo = true;
    onCorriendo(true);
    void sugerirAbonosAction({ movimiento_ids: movimientoIds })
      .then((r) => {
        if (!vivo) return;
        setBuscando(false);
        onCorriendo(false);
        if (!r.ok || !r.data) {
          toast.error(r.error ?? "No se pudieron pedir las sugerencias.");
          return;
        }
        recibir(r.data);
      })
      .catch(() => {
        if (!vivo) return;
        setBuscando(false);
        onCorriendo(false);
      });
    return () => {
      vivo = false;
    };
    // Una sola consulta al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marcar = (id: string, v: boolean) =>
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (v) s.add(id);
      else s.delete(id);
      return s;
    });

  const aceptarUna = async (p: PropuestaAbono) => {
    if (p.accion === "REGISTRAR_INGRESO") {
      setRegistrar({ p, abono: abonoDePropuesta(p, abonos) });
      return;
    }
    setTrabajando(p.movimiento_id);
    const r = await aceptarPropuestaAbonoAction(p).catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo",
    }));
    setTrabajando(null);
    if (r.ok) {
      setEstado((e) => ({ ...e, [p.movimiento_id]: { tipo: "ok", texto: "Conciliado" } }));
      marcar(p.movimiento_id, false);
      toast.success("Abono conciliado");
      router.refresh();
    } else {
      setEstado((e) => ({
        ...e,
        [p.movimiento_id]: { tipo: "error", texto: r.error ?? "No se pudo" },
      }));
      toast.error(r.error ?? "No se pudo conciliar");
    }
  };

  const pendientesDeLote = propuestas.filter(
    (p) => marcadas.has(p.movimiento_id) && aceptableEnLote(p) && estado[p.movimiento_id]?.tipo !== "ok",
  );

  const correrLote = async () => {
    setConfirmarLote(false);
    setCorriendoLote(true);
    onCorriendo(true);
    const r = await aceptarEnLote(pendientesDeLote, async (p) => {
      const x = await aceptarPropuestaAbonoAction(p);
      setEstado((e) => ({
        ...e,
        [p.movimiento_id]: x.ok
          ? { tipo: "ok", texto: "Conciliado" }
          : { tipo: "error", texto: x.error ?? "No se pudo" },
      }));
      return { ok: x.ok, error: x.error };
    });
    setCorriendoLote(false);
    onCorriendo(false);
    setMarcadas(new Set());
    const texto = textoResultadoLote(r);
    setResultadoLote(texto);
    if (r.errores.length === 0) toast.success(texto);
    else toast.warning(texto);
    router.refresh();
  };

  const ocupado = buscando || corriendoLote || trabajando !== null;
  const noDisponible = res ? textoIaNoDisponible(res) : null;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">
          <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{AVISO_IA_INGRESOS}</span>
        </div>

        {!dirigida && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Cuenta</Label>
              <SearchableSelect
                options={[{ value: "", label: "Todas las cuentas" }, ...cuentas.map((c) => ({ value: c.id, label: c.label }))]}
                value={cuenta}
                onChange={setCuenta}
                placeholder="Todas las cuentas"
                disabled={ocupado}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sug-abonos-desde" className="text-sm font-medium">
                Desde
              </Label>
              <Input
                id="sug-abonos-desde"
                type="date"
                value={ini}
                onChange={(e) => setIni(e.target.value)}
                disabled={ocupado}
                className="cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sug-abonos-hasta" className="text-sm font-medium">
                Hasta
              </Label>
              <Input
                id="sug-abonos-hasta"
                type="date"
                value={fin}
                onChange={(e) => setFin(e.target.value)}
                disabled={ocupado}
                className="cursor-pointer"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {buscando
              ? "Consultando al asistente… puede tardar hasta dos minutos."
              : res
                ? resumenSugerencias(res)
                : "Hasta 20 abonos pendientes por consulta (los traspasos, reversos y duplicados se resuelven sin gastar IA)."}
          </p>
          {!dirigida && (
            <Button type="button" size="sm" onClick={() => void consultar()} disabled={ocupado}>
              {buscando ? "Consultando…" : res ? "Volver a consultar" : "Buscar sugerencias"}
            </Button>
          )}
        </div>

        {noDisponible && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{noDisponible}</span>
          </div>
        )}

        {res && propuestas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {resultadoLote ??
                `${pendientesDeLote.length} ${pendientesDeLote.length === 1 ? "marcada" : "marcadas"} · solo se marcan solas las que cuadran exacto con confianza alta.`}
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmarLote(true)}
              disabled={ocupado || pendientesDeLote.length === 0}
            >
              {corriendoLote ? "Conciliando…" : `Aceptar las marcadas (${pendientesDeLote.length})`}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {propuestas.map((p) => {
            const conf = textoConfianza(p.confianza);
            const fila = estado[p.movimiento_id];
            const hecho = fila?.tipo === "ok";
            return (
              <div
                key={p.movimiento_id}
                className={cn(
                  "space-y-2 rounded-lg border p-3",
                  hecho ? "border-emerald-500/40 bg-emerald-500/5" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {aceptableEnLote(p) && !hecho && (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 cursor-pointer accent-brand-600"
                        checked={marcadas.has(p.movimiento_id)}
                        onChange={(e) => marcar(p.movimiento_id, e.target.checked)}
                        disabled={ocupado}
                        aria-label="Marcar para aceptar en lote"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {fmtDateOnly(p.fecha)} ·{" "}
                        <span className="font-mono tabular-nums">
                          {fmtMonto(p.monto, p.cuenta_moneda ?? undefined)}
                        </span>
                        {p.cuenta_alias && (
                          <span className="text-xs font-normal text-muted-foreground"> · {p.cuenta_alias}</span>
                        )}
                      </p>
                      <p className="max-w-[460px] truncate text-xs text-muted-foreground">
                        {[p.descripcion, p.referencia ? `ref. ${p.referencia}` : null]
                          .filter(Boolean)
                          .join(" · ") || "Abono del banco"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {p.posible_duplicado && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
                        ¿Duplicado?
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-muted-foreground">
                      {p.origen === "REGLA" ? "Regla" : "IA"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        conf.tono === "alta"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : conf.tono === "media"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : undefined
                      }
                    >
                      {conf.texto}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-sm font-medium">{textoAccionPropuesta(p)}</p>
                  {p.candidato && (
                    <p className="text-xs text-muted-foreground">
                      {descripcionFichaCandidato(p.candidato)}
                      {p.monto_exacto && (
                        <span className="ml-1 font-medium text-emerald-600 dark:text-emerald-400">
                          · monto exacto
                        </span>
                      )}
                    </p>
                  )}
                  {p.accion === "REGISTRAR_INGRESO" && p.cliente_sugerido && (
                    <p className="text-xs text-muted-foreground">Cliente: {p.cliente_sugerido.nombre}</p>
                  )}
                  {p.razon && <p className="mt-1 text-xs text-muted-foreground">{p.razon}</p>}
                  {p.motivo_sin_match && (
                    <p className="mt-1 text-xs text-muted-foreground">{p.motivo_sin_match}</p>
                  )}
                  {p.evidencias.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      {p.evidencias.map((e) => (
                        <li key={e}>· {e}</li>
                      ))}
                    </ul>
                  )}
                  {p.categoria_sugerida && p.accion !== "REGISTRAR_INGRESO" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Si no es ninguno: probablemente «{etiquetaCategoriaIngreso(p.categoria_sugerida)}».
                    </p>
                  )}
                  {p.alternativas.length > 0 && !hecho && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">Otras opciones</p>
                      {p.alternativas.map((a) => (
                        <div
                          key={a.candidato.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1"
                        >
                          <span className="min-w-0 text-xs">
                            {a.candidato.etiqueta}
                            <span className="text-muted-foreground">
                              {" "}
                              · {descripcionFichaCandidato(a.candidato)} · {textoConfianza(a.confianza).texto}
                            </span>
                            {a.razon && <span className="block text-muted-foreground">{a.razon}</span>}
                          </span>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={ocupado}
                            onClick={() => void aceptarUna({ ...p, accion: "LIGAR", candidato: a.candidato })}
                          >
                            Vincular a esta
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {fila ? (
                  <p
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      fila.tipo === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                    )}
                  >
                    {fila.tipo === "ok" ? (
                      <CheckCircleIcon className="h-4 w-4" />
                    ) : (
                      <ExclamationTriangleIcon className="h-4 w-4" />
                    )}
                    {fila.texto}
                  </p>
                ) : null}

                {!hecho && (
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={ocupado}
                      onClick={() => {
                        setPropuestas((prev) => prev.filter((x) => x.movimiento_id !== p.movimiento_id));
                        marcar(p.movimiento_id, false);
                      }}
                    >
                      Descartar
                    </Button>
                    {sePuedeAceptar(p) && (
                      <Button type="button" size="sm" disabled={ocupado} onClick={() => void aceptarUna(p)}>
                        {trabajando === p.movimiento_id ? "Conciliando…" : "Aceptar"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {res && propuestas.length === 0 && !noDisponible && (
          <p className="text-sm text-muted-foreground">
            No quedan propuestas por revisar. Los abonos que siguen pendientes se identifican a mano desde
            el menú de cada fila.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={buscando || corriendoLote}>
          Cerrar
        </Button>
      </DialogFooter>

      <AlertDialog open={confirmarLote} onOpenChange={setConfirmarLote}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aceptar las propuestas marcadas?</AlertDialogTitle>
            <AlertDialogDescription>{textoConfirmarLote(pendientesDeLote)}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {pendientesDeLote.map((p) => (
              <li key={p.movimiento_id}>· {lineaConfirmacionLote(p)}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void correrLote();
              }}
            >
              Conciliar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {registrar && (
        <RegistrarIngresoDialog
          {...catalogos}
          open
          onOpenChange={(o) => !o && setRegistrar(null)}
          abono={registrar.abono}
          onGuardado={() => {
            const id = registrar.p.movimiento_id;
            setEstado((e) => ({ ...e, [id]: { tipo: "ok", texto: "Registrado y conciliado" } }));
            marcar(id, false);
          }}
        />
      )}
    </>
  );
}
