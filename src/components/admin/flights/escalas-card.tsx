"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EscalaFormSheet } from "./escala-form-sheet";
import { deleteEscalaAction } from "@/app/admin/flights/actions";
import { fmtDecimal } from "@/lib/format";
import type { FlightEscala, TacoPhoto } from "@/types/flights";
import type { EstadoVuelo } from "@/types/quotes-persisted";

interface AirportOption {
  iata: string;
  nombre: string;
}

interface EscalasCardProps {
  flightId: string;
  flightFolio: number;
  flightEstado: EstadoVuelo;
  escalas: FlightEscala[];
  tacoPhotos?: TacoPhoto[];
  airports: AirportOption[];
}

export function EscalasCard({
  flightId,
  flightFolio,
  flightEstado,
  escalas,
  tacoPhotos = [],
  airports,
}: EscalasCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<FlightEscala | undefined>();
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(
    null,
  );

  const photosByEscala = new Map(tacoPhotos.map((p) => [p.escala_id, p]));

  const canManage =
    flightEstado !== "CANCELADO" && flightEstado !== "COMPLETADO";

  const takenOrdenes = escalas.map((e) => e.orden);

  const openCreate = () => {
    setEditing(undefined);
    setSheetOpen(true);
  };

  const openEdit = (esc: FlightEscala) => {
    setEditing(esc);
    setSheetOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-sm">Escalas e itinerario</CardTitle>
            <CardDescription className="text-xs">
              {escalas.length === 0
                ? "Sin escalas registradas todavía."
                : `${escalas.length} ${escalas.length === 1 ? "tramo registrado" : "tramos registrados"}. Tacómetros se capturan desde la app móvil del piloto.`}
            </CardDescription>
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={openCreate}
              className="gap-1.5 shrink-0"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Añadir
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {escalas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Las escalas del plan se crean automáticamente al confirmar una
              cotización multiescala. Para vuelos simples o ajustes manuales,
              usa el botón &ldquo;Añadir&rdquo;.
            </p>
          ) : (
            <ol className="space-y-2">
              {escalas.map((esc) => {
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
                          {esc.orden}.
                        </span>
                        {esc.origen_iata} → {esc.destino_iata}
                      </span>
                      <div className="flex items-center gap-2">
                        {esc.taco_salida && esc.taco_llegada ? (
                          <span className="text-xs font-mono text-muted-foreground">
                            {fmtDecimal(esc.taco_salida, 2)} →{" "}
                            {fmtDecimal(esc.taco_llegada, 2)}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Sin tacómetros
                          </Badge>
                        )}
                        {canManage && (
                          <EscalaRowMenu
                            flightId={flightId}
                            escala={esc}
                            onEdit={() => openEdit(esc)}
                          />
                        )}
                      </div>
                    </div>

                    {esc.valor_ia_propuesto && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <SparklesIcon className="h-3 w-3" />
                        Sugerencia IA: {fmtDecimal(esc.valor_ia_propuesto, 1)}
                      </span>
                    )}

                    {esc.revision_requerida && (
                      <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-px" />
                        <span>
                          {esc.revision_motivo ?? "Lectura por revisar"}
                        </span>
                      </p>
                    )}

                    {(fotoSalida || fotoLlegada) && (
                      <div className="flex gap-2 pt-1">
                        {fotoSalida && (
                          <TacoThumb
                            url={fotoSalida}
                            label={`Escala ${esc.orden} · tacómetro salida`}
                            caption="Salida"
                            onOpen={setLightbox}
                          />
                        )}
                        {fotoLlegada && (
                          <TacoThumb
                            url={fotoLlegada}
                            label={`Escala ${esc.orden} · tacómetro llegada`}
                            caption="Llegada"
                            onOpen={setLightbox}
                          />
                        )}
                      </div>
                    )}

                    {(esc.hora_salida || esc.hora_llegada) && (
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {esc.hora_salida
                          ? new Date(esc.hora_salida).toLocaleString("es-MX", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                        {" → "}
                        {esc.hora_llegada
                          ? new Date(esc.hora_llegada).toLocaleString("es-MX", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
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

      <EscalaFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        flightId={flightId}
        flightFolio={flightFolio}
        airports={airports}
        takenOrdenes={takenOrdenes}
        initialEscala={editing}
      />

      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="text-sm">{lightbox?.label}</DialogTitle>
          {lightbox && (
            <Image
              src={lightbox.url}
              alt={lightbox.label}
              width={1200}
              height={1200}
              unoptimized
              className="h-auto w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TacoThumb({
  url,
  label,
  caption,
  onOpen,
}: {
  url: string;
  label: string;
  caption: string;
  onOpen: (v: { url: string; label: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen({ url, label })}
      className="group relative overflow-hidden rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Image
        src={url}
        alt={label}
        width={64}
        height={64}
        unoptimized
        className="h-14 w-14 object-cover transition-transform group-hover:scale-105"
      />
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[9px] font-medium text-white">
        {caption}
      </span>
    </button>
  );
}

function EscalaRowMenu({
  flightId,
  escala,
  onEdit,
}: {
  flightId: string;
  escala: FlightEscala;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasTacos = !!(escala.taco_salida || escala.taco_llegada);

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteEscalaAction(flightId, escala.id);
      if (res.ok) {
        toast.success("Escala eliminada");
        setOpenDelete(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al eliminar");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones de la escala</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setOpenDelete(true)}
            className="gap-2 text-destructive focus:text-destructive"
            disabled={hasTacos}
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar escala {escala.orden} · {escala.origen_iata}→
              {escala.destino_iata}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Solo se puede eliminar si no hay
              tacómetros capturados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
