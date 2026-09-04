"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowsRightLeftIcon,
  CalculatorIcon,
  EllipsisVerticalIcon,
  LockClosedIcon,
  MinusCircleIcon,
  PaperAirplaneIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import { semaforoCobroHijo } from "@/lib/admin/grupos-ui";
import { fmtDateTime } from "@/lib/datetime";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AvionGrupoDetalle, GrupoDetalle } from "@/types/grupos";
import { GrupoQuitarAvionDialog } from "./grupo-quitar-avion-dialog";
import {
  GrupoReemplazarAvionDialog,
  type AeronaveOpcion,
  type PilotoOpcion,
} from "./grupo-reemplazar-avion-dialog";

/**
 * Tabla de los aviones del grupo (tabla de RESUMEN, ≤20 filas: primitivos
 * de ui/table). Cada fila es un vuelo hijo real con su avión, piloto,
 * salida, tiempo/tarifa, total, cobro (fuente única estadoCobroSemaforo
 * vía semaforoCobroHijo), factura, permiso y candados. Acciones por avión:
 * Quitar (confirmación) y Reemplazar (dialog).
 */
export function GrupoAvionesTable({
  grupo,
  aircraft,
  pilots,
  puedeEditar,
}: {
  grupo: GrupoDetalle;
  aircraft: AeronaveOpcion[];
  pilots: PilotoOpcion[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [quitar, setQuitar] = useState<AvionGrupoDetalle | null>(null);
  const [reemplazar, setReemplazar] = useState<AvionGrupoDetalle | null>(null);

  const esInterno = grupo.cliente?.es_interno === true;
  const grupoTerminal = grupo.estado === "CANCELADO" || grupo.estado === "COMPLETADO";
  const aviones = [...grupo.aviones].sort((a, b) => {
    if (a.cancelado !== b.cancelado) return a.cancelado ? 1 : -1;
    return (a.posicion ?? 999) - (b.posicion ?? 999);
  });

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Avión</TableHead>
              <TableHead className="text-right">Pax</TableHead>
              <TableHead>Tripulación</TableHead>
              <TableHead>Salida</TableHead>
              <TableHead className="text-right">Tiempo</TableHead>
              <TableHead className="text-right">Total USD</TableHead>
              <TableHead className="text-center">Cobro</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {aviones.map((a) => {
              const puedeAccionar = puedeEditar && !a.cancelado && !grupoTerminal;
              const quitable = puedeAccionar && a.estado !== "COMPLETADO";
              return (
                <TableRow
                  key={a.vuelo_id}
                  className={cn(a.cancelado && "opacity-60", a.es_ancla && "bg-muted/20")}
                >
                  <TableCell className="font-mono text-xs">
                    <span className="inline-flex items-center gap-1">
                      {a.posicion ?? "—"}
                      {a.es_ancla && (
                        <StarIcon
                          className="h-3 w-3 text-amber-500"
                          aria-label="Avión ancla"
                        />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col leading-tight">
                      <span className="font-mono font-medium">
                        {a.aeronave?.matricula ?? "Sin avión"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {[
                          a.aeronave?.modelo,
                          a.aeronave?.asientos != null ? `${a.aeronave.asientos} asientos` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="mt-0.5 inline-flex items-center gap-1.5">
                        <Link
                          href={`/admin/quotes/${a.vuelo_id}`}
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                          title="Abrir la cotización de este avión"
                        >
                          <CalculatorIcon className="h-3 w-3" />#{a.folio}
                        </Link>
                        {a.estado !== "SOLICITUD" && (
                          <Link
                            href={`/admin/flights/${a.vuelo_id}`}
                            className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            title="Abrir el detalle del vuelo (tramos, tacómetros, cobros)"
                            aria-label={`Abrir vuelo #${a.folio}`}
                          >
                            <PaperAirplaneIcon className="h-3 w-3" />
                          </Link>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {a.pax ?? a.pasajeros}
                    {a.rotaciones > 1 && (
                      <span
                        className="block text-[10px] text-muted-foreground"
                        title="Este avión da dos vueltas para llevar a todos"
                      >
                        {a.rotaciones} vueltas
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col leading-tight">
                      <span>
                        {a.piloto?.nombre ?? (
                          <span className="text-amber-600 dark:text-amber-400">Sin piloto</span>
                        )}
                      </span>
                      {a.copiloto?.nombre && (
                        <span className="text-[10px] text-muted-foreground">
                          Copiloto: {a.copiloto.nombre}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {fmtDateTime(a.salida_plan ?? a.fecha_vuelo)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                    {fmtDecimal(a.horas_cobrables_hr, 2)} hr
                    <span className="block text-[10px] text-muted-foreground">
                      {fmtUsd(a.tarifa_hora_usd)}/hr
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtUsd(a.total_usd)}
                    {a.precio_desactualizado && (
                      <Badge
                        variant="outline"
                        className="mt-0.5 block w-fit ml-auto border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                        title="Vuela en un avión distinto al cotizado sin recotizar: reemplaza con «recotizar» o revisa el grupo."
                      >
                        Precio desactualizado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <CobroEstadoBadge estado={semaforoCobroHijo(a, { esInterno })} />
                      {a.facturado && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Facturado
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex flex-col items-center gap-1">
                      <Badge variant="outline" className={ESTADO_STYLES[a.estado]}>
                        {ESTADO_LABELS[a.estado]}
                      </Badge>
                      {a.estado_permiso === "pendiente" && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                          title="Un aeropuerto de la ruta requiere permiso de pista y aún no se emite."
                        >
                          Permiso pendiente
                        </Badge>
                      )}
                      {a.estado_permiso === "emitido" && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Permiso emitido
                        </span>
                      )}
                      {a.congelado && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                          title={`Precio congelado (${a.congelado}): no se puede revisar ni quitar desde el grupo sin liberarlo primero.`}
                        >
                          <LockClosedIcon className="h-3 w-3" />
                          {a.congelado}
                        </span>
                      )}
                      {!a.cancelado && a.llegadas_faltantes > 0 && a.estado !== "COTIZADO" && a.estado !== "RESERVA" && a.estado !== "CONFIRMADO" && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          {a.llegadas_faltantes} llegada{a.llegadas_faltantes === 1 ? "" : "s"} sin taco
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label={`Acciones del avión ${a.posicion ?? ""}`}
                      >
                        <EllipsisVerticalIcon className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuItem
                          onClick={() => router.push(`/admin/quotes/${a.vuelo_id}`)}
                          className="gap-2"
                        >
                          <CalculatorIcon className="h-4 w-4" />
                          Abrir cotización #{a.folio}
                        </DropdownMenuItem>
                        {a.estado !== "SOLICITUD" && (
                          <DropdownMenuItem
                            onClick={() => router.push(`/admin/flights/${a.vuelo_id}`)}
                            className="gap-2"
                          >
                            <PaperAirplaneIcon className="h-4 w-4" />
                            Abrir vuelo #{a.folio}
                          </DropdownMenuItem>
                        )}
                        {puedeAccionar && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setReemplazar(a)}
                              className="gap-2"
                              disabled={a.estado === "COMPLETADO" || a.estado === "EN_VUELO"}
                            >
                              <ArrowsRightLeftIcon className="h-4 w-4" />
                              Reemplazar avión…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setQuitar(a)}
                              className="gap-2"
                              disabled={!quitable}
                            >
                              <MinusCircleIcon className="h-4 w-4" />
                              Quitar del grupo…
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="px-4 pb-3 pt-2 text-[10px] text-muted-foreground">
        ★ = avión ancla (recibe el residuo de centavos de los cargos repartidos).
        Los aviones cancelados se muestran atenuados y no suman al total.
      </p>

      <GrupoQuitarAvionDialog grupo={grupo} avion={quitar} onClose={() => setQuitar(null)} />
      <GrupoReemplazarAvionDialog
        key={reemplazar?.vuelo_id ?? "cerrado"}
        grupo={grupo}
        avion={reemplazar}
        aircraft={aircraft}
        pilots={pilots}
        onClose={() => setReemplazar(null)}
      />
    </>
  );
}
