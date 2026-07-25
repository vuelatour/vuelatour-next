"use client";

import { useState, useTransition } from "react";
import { fmtDateTime } from "@/lib/datetime";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImagePreview } from "@/components/admin/image-preview";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmTacoAction,
  fillTacoGapsAction,
  getUltimoTacoAction,
} from "@/app/admin/flights/actions";
import { fmtDecimal } from "@/lib/format";
import type { FlightEscala, TacoPhoto } from "@/types/flights";

interface EscalasCardProps {
  flightId: string;
  escalas: FlightEscala[];
  tacoPhotos?: TacoPhoto[];
  /** Piloto EXTERNO sin app (doc 3.7): la oficina captura las lecturas aquí. */
  pilotoExterno?: boolean;
}

/**
 * Llegada del tramo ANTERIOR (por orden): el horómetro es continuo, así que
 * es la salida esperada de este tramo. null si es el primero o no hay lectura.
 */
function llegadaAnterior(
  escalas: FlightEscala[],
  esc: FlightEscala,
): number | null {
  let mejor: FlightEscala | null = null;
  for (const e of escalas) {
    if (e.orden >= esc.orden || e.taco_llegada == null) continue;
    if (mejor == null || e.orden > mejor.orden) mejor = e;
  }
  return mejor?.taco_llegada != null ? Number(mejor.taco_llegada) : null;
}

export function EscalasCard({
  flightId,
  escalas,
  tacoPhotos = [],
  pilotoExterno = false,
}: EscalasCardProps) {
  const photosByEscala = new Map(tacoPhotos.map((p) => [p.escala_id, p]));

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-sm">Tacómetros por tramo</CardTitle>
            <CardDescription className="text-xs">
              {escalas.length === 0
                ? "Sin tramos registrados todavía."
                : pilotoExterno
                  ? "Piloto EXTERNO (sin app): la oficina captura aquí las lecturas de cada tramo con «Capturar» — el vuelo avanza solo (EN VUELO → COMPLETADO) al guardarlas."
                  : "Lecturas, fotos y revisiones de cada tramo (las captura el piloto). La ruta, fechas y tramos se gestionan arriba en «Asignación por tramo»."}
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            {escalas.length > 0 &&
              escalas.some((e) => !e.taco_salida || !e.taco_llegada) && (
                <FillTacoGapsButton flightId={flightId} />
              )}
          </div>
        </CardHeader>
        <CardContent>
          {escalas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Las escalas se crean al confirmar la cotización o desde
              &ldquo;Asignación por tramo&rdquo; (Agregar tramo).
            </p>
          ) : (
            <ol className="space-y-2">
              {escalas.map((esc, idx) => {
                const photos = photosByEscala.get(esc.id);
                const fotoSalida = photos?.foto_salida_url ?? null;
                const fotoLlegada = photos?.foto_llegada_url ?? null;
                return (
                  <li
                    key={esc.id}
                    className={
                      esc.revision_requerida
                        ? "rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 space-y-1.5"
                        : "rounded-lg border border-border bg-muted/20 p-3 space-y-1.5"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-sm">
                        <span className="text-muted-foreground mr-2">
                          {esc.solo_operativa ? "·" : `${idx + 1}.`}
                        </span>
                        {esc.origen_iata} → {esc.destino_iata}
                        {esc.solo_operativa && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30 align-middle"
                            title="Tramo operativo interno: no se cotiza ni se cobra; no aparece en la cotización del cliente."
                          >
                            Interno
                          </Badge>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {esc.taco_salida || esc.taco_llegada ? (
                          // Lectura parcial visible ("1,572.00 → —"): decir
                          // "Sin tacómetros" con la salida ya propagada
                          // ocultaba que solo falta la llegada.
                          <span className="text-xs font-mono text-muted-foreground">
                            {esc.taco_salida ? fmtDecimal(esc.taco_salida, 2) : "—"} →{" "}
                            {esc.taco_llegada ? fmtDecimal(esc.taco_llegada, 2) : "—"}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Sin tacómetros
                          </Badge>
                        )}
                        {/* Corrección de oficina SIEMPRE disponible (origen
                            OFICINA + nota); el flujo amarillo de abajo es solo
                            para lecturas marcadas por revisar. */}
                        {!esc.revision_requerida && (
                          <TacoConfirmDialog
                            flightId={flightId}
                            escala={esc}
                            modo="correccion"
                            captura={pilotoExterno}
                            // Salida sugerida: la llegada del tramo ANTERIOR
                            // (por orden) — el horómetro es continuo.
                            salidaSugerida={llegadaAnterior(escalas, esc)}
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {esc.es_ferry ? (
                        <Badge variant="outline" className="text-[10px]">
                          Ferry · vacío
                        </Badge>
                      ) : (
                        esc.pasajeros != null && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            title={
                              esc.pasajeros_nombres?.length
                                ? esc.pasajeros_nombres.join(", ")
                                : undefined
                            }
                          >
                            {esc.pasajeros} pax
                          </Badge>
                        )
                      )}
                      {esc.es_sobrevuelo && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30"
                        >
                          Sobrevuelo
                        </Badge>
                      )}
                      {esc.requiere_pernocta && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        >
                          Pernocta
                          {esc.pernocta_costo_usd
                            ? ` · $${fmtDecimal(esc.pernocta_costo_usd, 2)}`
                            : ""}
                        </Badge>
                      )}
                      {esc.tipo_parada === "SERVICIO" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                        >
                          Servicio
                        </Badge>
                      )}
                    </div>

                    {esc.tipo_parada === "SERVICIO" && esc.servicio_notas && (
                      <p className="text-[11px] text-sky-700 dark:text-sky-300">
                        {esc.servicio_notas}
                      </p>
                    )}

                    {esc.valor_ia_propuesto && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <SparklesIcon className="h-3 w-3" />
                        Sugerencia IA: {fmtDecimal(esc.valor_ia_propuesto, 1)}
                      </span>
                    )}

                    {esc.revision_requerida && (
                      <div className="space-y-1.5">
                        <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-px" />
                          <span>
                            {esc.revision_motivo ?? "Lectura por revisar"}
                          </span>
                        </p>
                        <TacoConfirmDialog
                          flightId={flightId}
                          escala={esc}
                          salidaSugerida={llegadaAnterior(escalas, esc)}
                        />
                      </div>
                    )}

                    {(fotoSalida || fotoLlegada) && (
                      <div className="flex gap-2 pt-1">
                        {fotoSalida && (
                          <TacoThumb
                            url={fotoSalida}
                            label={`Escala ${idx + 1} · tacómetro salida`}
                            caption="Salida"
                          />
                        )}
                        {fotoLlegada && (
                          <TacoThumb
                            url={fotoLlegada}
                            label={`Escala ${idx + 1} · tacómetro llegada`}
                            caption="Llegada"
                          />
                        )}
                      </div>
                    )}

                    {(esc.hora_salida || esc.hora_llegada) && (
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {esc.hora_salida
                          ? fmtDateTime(esc.hora_salida)
                          : "—"}
                        {" → "}
                        {esc.hora_llegada
                          ? fmtDateTime(esc.hora_llegada)
                          : "—"}
                      </p>
                    )}
                    {esc.notas && (
                      <p className="text-[11px] text-muted-foreground italic">
                        {esc.notas}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>


    </>
  );
}

/**
 * Botón de cierre operativo: PROPAGA lecturas reales (la llegada de un tramo
 * como salida del siguiente). Política del cliente (25 jul 2026): el sistema
 * ya NO calcula lecturas con promedios — lo que falte queda pendiente con
 * sugerencia en Tacómetros en vivo para que lo confirme un humano.
 */
function FillTacoGapsButton({ flightId }: { flightId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleFill = () => {
    startTransition(async () => {
      const res = await fillTacoGapsAction(flightId);
      if (res.ok) {
        const n = res.data?.escalas_actualizadas ?? 0;
        toast.success(
          n > 0
            ? `${n} ${n === 1 ? "salida propagada" : "salidas propagadas"} desde la llegada del tramo anterior`
            : "Nada que propagar: lo que falta son lecturas reales — captúralas o ajústalas en Tacómetros en vivo",
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al propagar lecturas");
      }
    });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleFill}
      disabled={pending}
      className="gap-1.5"
      title="Copia lecturas reales: la llegada de cada tramo se propaga como salida del siguiente. El sistema ya no inventa valores con promedios."
    >
      <SparklesIcon className="h-3.5 w-3.5" />
      {pending ? "Propagando…" : "Propagar lecturas"}
    </Button>
  );
}

/**
 * Confirmación de oficina de una lectura en amarillo: muestra los valores
 * (editables por si hay que corregir) y una nota opcional. Al confirmar, la
 * escala pasa de amarillo a verde.
 */
function TacoConfirmDialog({
  flightId,
  escala,
  modo = "revision",
  captura = false,
  salidaSugerida = null,
}: {
  flightId: string;
  escala: FlightEscala;
  /** revision: flujo amarillo→verde; correccion: editar una lectura ya guardada. */
  modo?: "revision" | "correccion";
  /** Piloto externo: el botón se vuelve un CTA visible de captura de oficina. */
  captura?: boolean;
  /** Salida sugerida del propio vuelo (llegada del tramo anterior). */
  salidaSugerida?: number | null;
}) {
  const esCorreccion = modo === "correccion";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [salida, setSalida] = useState(escala.taco_salida ?? "");
  const [llegada, setLlegada] = useState(escala.taco_llegada ?? "");
  const [nota, setNota] = useState("");
  // Procedencia de la salida precargada (leyenda bajo el campo). El historial
  // del tacómetro ya lo conoce el sistema: no hay que ir a buscarlo a mano.
  const [sugerenciaOrigen, setSugerenciaOrigen] = useState<string | null>(null);

  const handleOpen = () => {
    setOpen(true);
    // Re-sembrar SIEMPRE desde los props al abrir: el estado local puede ser
    // más viejo que los datos (p.ej. corregir la llegada del tramo anterior
    // propaga la salida de ESTE tramo y refresca la página, pero el useState
    // inicial no se re-ejecuta — el guard veía la salida en el prop y el
    // input pintaba el estado vacío: diálogo en blanco).
    const salidaActual =
      escala.taco_salida != null ? String(escala.taco_salida) : "";
    setSalida(salidaActual);
    setLlegada(escala.taco_llegada != null ? String(escala.taco_llegada) : "");
    setNota("");
    setSugerenciaOrigen(null);
    // Solo se precarga cuando el tramo NO tiene salida capturada.
    if (salidaActual !== "") return;
    if (salidaSugerida != null) {
      setSalida(String(salidaSugerida));
      setSugerenciaOrigen("llegada del tramo anterior");
      return;
    }
    // Primer tramo (o sin llegada previa): último taco histórico del avión.
    void getUltimoTacoAction(flightId).then((res) => {
      if (res.ok && res.data?.ultimo_taco != null) {
        setSalida((prev) =>
          String(prev).trim() === "" ? String(res.data!.ultimo_taco) : prev,
        );
        setSugerenciaOrigen("último tacómetro registrado del avión");
      }
    });
  };

  const handleConfirm = () => {
    const payload: {
      taco_salida?: number;
      taco_llegada?: number;
      nota?: string;
    } = {};
    const s = String(salida).trim();
    const l = String(llegada).trim();
    if (s !== "" && s !== String(escala.taco_salida ?? "")) {
      const n = Number(s);
      if (!Number.isFinite(n)) {
        toast.error("Lectura de salida inválida");
        return;
      }
      payload.taco_salida = n;
    }
    if (l !== "" && l !== String(escala.taco_llegada ?? "")) {
      const n = Number(l);
      if (!Number.isFinite(n)) {
        toast.error("Lectura de llegada inválida");
        return;
      }
      payload.taco_llegada = n;
    }
    if (nota.trim()) payload.nota = nota.trim();

    if (esCorreccion && !payload.taco_salida && !payload.taco_llegada) {
      toast.info("No cambiaste ninguna lectura.");
      return;
    }

    startTransition(async () => {
      const res = await confirmTacoAction(flightId, escala.id, payload);
      if (res.ok) {
        toast.success(esCorreccion ? "Lectura corregida" : "Lectura confirmada");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  };

  return (
    <>
      {esCorreccion ? (
        captura ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpen}
            className="h-6 gap-1 px-2 text-[11px]"
            title="Capturar las lecturas de tacómetro de este tramo (piloto externo: las sube la oficina)"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
            Capturar lecturas
          </Button>
        ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleOpen}
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          title="Corregir las lecturas de tacómetro de este tramo (queda registrado como corrección de oficina)"
        >
          <PencilSquareIcon className="h-3.5 w-3.5" />
          Corregir
        </Button>
        )
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleOpen}
          className="h-7 gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          Confirmar lectura
        </Button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {esCorreccion ? "Corregir tacómetro" : "Confirmar tacómetro"} ·{" "}
              {escala.origen_iata} → {escala.destino_iata}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {esCorreccion
                ? "Ajusta la lectura equivocada contra la foto. La corrección queda con origen OFICINA, se registra quién la hizo, y si cambias la llegada se propaga como salida del siguiente tramo."
                : `${escala.revision_motivo ?? "Lectura marcada para revisión."} Revisa contra la foto; corrige el valor si hace falta y confirma para pasarla de amarillo a verde.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`taco-salida-${escala.id}`}>Salida</Label>
              <Input
                id={`taco-salida-${escala.id}`}
                inputMode="decimal"
                value={salida}
                onChange={(e) => {
                  setSalida(e.target.value);
                  setSugerenciaOrigen(null);
                }}
                placeholder="—"
              />
              {sugerenciaOrigen && (
                <p className="text-[11px] text-muted-foreground">
                  Precargada del historial ({sugerenciaOrigen}). Ajústala si la
                  foto dice otra cosa.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`taco-llegada-${escala.id}`}>Llegada</Label>
              <Input
                id={`taco-llegada-${escala.id}`}
                inputMode="decimal"
                value={llegada}
                onChange={(e) => setLlegada(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`taco-nota-${escala.id}`}>Nota (opcional)</Label>
              <Input
                id={`taco-nota-${escala.id}`}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. verificado contra la foto"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={pending}
            >
              {pending
                ? "Guardando…"
                : esCorreccion
                  ? "Guardar corrección"
                  : "Confirmar lectura"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TacoThumb({
  url,
  label,
  caption,
}: {
  url: string;
  label: string;
  caption: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-md border border-border">
      <ImagePreview
        src={url}
        alt={label}
        thumbClassName="h-14 w-14 object-cover transition-transform hover:scale-105"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[9px] font-medium text-white">
        {caption}
      </span>
    </div>
  );
}
