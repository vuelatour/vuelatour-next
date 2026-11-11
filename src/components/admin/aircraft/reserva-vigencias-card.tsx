"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanknotesIcon, TrashIcon } from "@heroicons/react/24/outline";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { eliminarReservaVigenciaAction } from "@/app/admin/aircraft/actions";
import {
  AYUDA_EDITAR_TARIFAS_RESERVA,
  AYUDA_UNICA_TARIFA_RESERVA,
  BOTON_ELIMINAR_TARIFA,
  DESCRIPCION_TARIFAS_RESERVA,
  ETIQUETAS_ESTADO_VIGENCIA,
  TEXTO_FALLO_ELIMINAR_TARIFA,
  TEXTO_SIN_TARIFAS_RESERVA,
  TITULO_TARIFAS_RESERVA,
  TOAST_TARIFA_ELIMINADA,
  confirmacionEliminarVigencia,
  estadoVigencia,
  puedeEliminarVigencia,
  textoDesdeVigencia,
  textoTarifaVigencia,
} from "@/lib/admin/reserva-overhaul";
import type { ReservaOverhaulVigencia } from "@/types/aircraft";

/**
 * «TARIFAS DE LA RESERVA DE OVERHAUL» en la ficha del avión (10-nov-2026, API
 * 0.0.135, invariante 130 del API). Pedido del cliente: «que pudiéramos
 * ponerle desde cuándo entra en vigor esa reserva de overhaul… que dijera ahí
 * "a partir de" y la fecha».
 *
 * La tarifa y su fecha se capturan en el formulario del avión («Editar»);
 * aquí se VEN todas las tarifas guardadas, la más reciente primero — cuál
 * vale hoy, cuáles ya quedaron atrás y cuáles todavía no empiezan — y se
 * puede ELIMINAR una (con confirmación que dice qué pasa con los vuelos de
 * ese periodo). La única tarifa del avión no se elimina (el API la rechaza):
 * se explica cómo dejarlo sin reserva.
 *
 * Solo pinta lo que manda el API; los textos salen de
 * `lib/admin/reserva-overhaul.ts`. La página la monta únicamente cuando
 * `vigenciasDeReserva` devuelve la lista (API 0.0.135 con su migración).
 */
export function ReservaVigenciasCard({
  aeronaveId,
  matricula,
  vigencias,
  puedeEditar,
  className,
}: {
  aeronaveId: string;
  matricula: string;
  /** La más reciente primero (como la deja `vigenciasDeReserva`). */
  vigencias: ReservaOverhaulVigencia[];
  /** Dirección / Administración: ven «Eliminar» y la ayuda para editar. */
  puedeEditar: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [aEliminar, setAEliminar] = useState<ReservaOverhaulVigencia | null>(null);
  const [pendiente, empezar] = useTransition();
  const conEliminar = puedeEditar && puedeEliminarVigencia(vigencias);
  const confirmacion = aEliminar
    ? confirmacionEliminarVigencia(aEliminar, vigencias, matricula)
    : null;

  const eliminar = () => {
    if (!aEliminar) return;
    const id = aEliminar.id;
    empezar(async () => {
      let res: Awaited<ReturnType<typeof eliminarReservaVigenciaAction>>;
      try {
        res = await eliminarReservaVigenciaAction(aeronaveId, id);
      } catch {
        toast.error(TEXTO_FALLO_ELIMINAR_TARIFA);
        return;
      }
      if (res.ok) {
        toast.success(TOAST_TARIFA_ELIMINADA);
        setAEliminar(null);
        router.refresh();
      } else {
        // El mensaje del API ya viene en es-MX (p. ej. «Es la única tarifa…»).
        toast.error(res.error ?? TEXTO_FALLO_ELIMINAR_TARIFA);
      }
    });
  };

  return (
    <Card className={className} id="reserva-overhaul" data-tarifas-reserva>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
          {TITULO_TARIFAS_RESERVA}
        </CardTitle>
        <CardDescription>{DESCRIPCION_TARIFAS_RESERVA}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {vigencias.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-sin-tarifas>
            {TEXTO_SIN_TARIFAS_RESERVA}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {vigencias.map((v) => {
              const estado = estadoVigencia(v);
              return (
                <li
                  key={v.id}
                  className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
                  data-tarifa-reserva={v.id}
                  data-estado-tarifa={estado}
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className={cn("font-medium", estado === "ANTERIOR" && "text-muted-foreground")}>
                        {textoTarifaVigencia(v)}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "px-1.5 py-0 text-[10px]",
                          estado === "VIGENTE" &&
                            "border-emerald-500/50 text-emerald-700 dark:text-emerald-400",
                          estado === "FUTURA" && "border-sky-500/50 text-sky-700 dark:text-sky-300",
                          estado === "ANTERIOR" && "text-muted-foreground",
                        )}
                      >
                        {ETIQUETAS_ESTADO_VIGENCIA[estado]}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">{textoDesdeVigencia(v)}</p>
                    {v.notas && <p className="text-xs text-muted-foreground">{v.notas}</p>}
                  </div>
                  {conEliminar && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 cursor-pointer gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Eliminar la tarifa que vale ${textoDesdeVigencia(v)}`}
                      data-accion="eliminar-tarifa-reserva"
                      onClick={() => setAEliminar(v)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" aria-hidden />
                      {BOTON_ELIMINAR_TARIFA}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {puedeEditar && (
          <p className="text-xs text-muted-foreground" data-ayuda-tarifas-reserva>
            {AYUDA_EDITAR_TARIFAS_RESERVA}
            {vigencias.length === 1 && <> {AYUDA_UNICA_TARIFA_RESERVA}</>}
          </p>
        )}
      </CardContent>

      <Dialog
        open={aEliminar !== null}
        onOpenChange={(abierto) => {
          // Mientras elimina no se cierra: la respuesta decide.
          if (!abierto && !pendiente) setAEliminar(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {confirmacion && (
            <>
              <DialogHeader>
                <DialogTitle>{confirmacion.titulo}</DialogTitle>
                <DialogDescription>{confirmacion.descripcion}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendiente}
                  onClick={() => setAEliminar(null)}
                >
                  Cancelar
                </Button>
                <Button type="button" variant="destructive" disabled={pendiente} onClick={eliminar}>
                  {pendiente ? "Eliminando…" : confirmacion.boton}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
