"use client";

import { useMemo, useState, useTransition } from "react";
import {
  LinkIcon,
  EllipsisHorizontalIcon,
  TagIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buscarCobrosCandidatosAction,
  clasificarMovimientoAction,
  crearClasificacionAction,
  linkMovimientoAction,
  linkMovimientoCobroAction,
  listClasificacionesAction,
  type Clasificacion,
} from "@/app/admin/conciliacion/actions";
import { fmtDate as fmtDateCancun, fmtDateOnly } from "@/lib/datetime";
import type { CobroCandidato, MovimientoBancario } from "@/types/conciliacion";

const fmtMoney = (monto: string | number) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });

interface MovimientoActionsProps {
  movimiento: MovimientoBancario;
  gastos: { value: string; label: string }[];
}

/**
 * Acciones de conciliación manual de un movimiento bancario.
 * CARGO ↔ gasto (opciones precargadas por la página) y
 * ABONO ↔ cobro de vuelo (candidatos buscados al abrir el diálogo,
 * ordenados por cercanía de monto y fecha). Mismo diálogo para ambos.
 */
export function MovimientoActions({ movimiento, gastos }: MovimientoActionsProps) {
  const esAbono = movimiento.tipo === "ABONO";
  const [openLink, setOpenLink] = useState(false);
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false);
  const [seleccion, setSeleccion] = useState("");
  // null = buscando; lista = resultado (solo aplica a ABONOS).
  const [candidatos, setCandidatos] = useState<CobroCandidato[] | null>(null);
  const [pending, startTransition] = useTransition();

  // Qué tiene vinculado realmente el movimiento (manda sobre el tipo al
  // desvincular, por si un dato viejo quedó cruzado distinto).
  const vinculadoACobro = movimiento.cobro_id != null;
  const vinculadoAGastoOCobro =
    movimiento.gasto_id != null || movimiento.cobro_id != null;
  const clasificado = movimiento.clasificacion_id != null;

  // Clasificación "sin vuelo": elegir del catálogo o crear una nueva en el
  // mismo diálogo, con notas. Concilia el movimiento sin gasto/cobro.
  const [openClasificar, setOpenClasificar] = useState(false);
  const [clasificaciones, setClasificaciones] = useState<Clasificacion[] | null>(null);
  const [clasifSel, setClasifSel] = useState("");
  const [clasifNueva, setClasifNueva] = useState("");
  const [clasifNotas, setClasifNotas] = useState("");
  const [confirmarQuitarClasif, setConfirmarQuitarClasif] = useState(false);

  const abrirClasificar = () => {
    setClasifSel(movimiento.clasificacion_id ?? "");
    setClasifNueva("");
    setClasifNotas(movimiento.notas ?? "");
    setOpenClasificar(true);
    setClasificaciones(null);
    void listClasificacionesAction().then((r) => {
      if (r.ok) setClasificaciones(r.data ?? []);
      else {
        setClasificaciones([]);
        toast.error(r.error ?? "No se pudieron cargar las clasificaciones");
      }
    });
  };

  const guardarClasificacion = () => {
    const nueva = clasifNueva.trim();
    if (!nueva && !clasifSel) {
      toast.error("Elige una clasificación o escribe una nueva");
      return;
    }
    startTransition(async () => {
      let clasifId = clasifSel;
      if (nueva) {
        // Crear (o recuperar la existente con ese nombre) en el mismo paso.
        const creada = await crearClasificacionAction(nueva);
        if (!creada.ok || !creada.data) {
          toast.error(creada.error ?? "No se pudo crear la clasificación");
          return;
        }
        clasifId = creada.data.id;
      }
      const r = await clasificarMovimientoAction(movimiento.id, {
        clasificacion_id: clasifId,
        notas: clasifNotas,
      });
      if (r.ok) {
        toast.success("Movimiento clasificado (deja de estar pendiente)");
        setOpenClasificar(false);
      } else {
        toast.error(r.error ?? "Error al clasificar");
      }
    });
  };

  const quitarClasificacion = () => {
    startTransition(async () => {
      const r = await clasificarMovimientoAction(movimiento.id, {
        clasificacion_id: null,
      });
      if (r.ok) {
        toast.success("Clasificación quitada: el movimiento vuelve a Pendiente");
        setConfirmarQuitarClasif(false);
      } else {
        toast.error(r.error ?? "Error");
      }
    });
  };

  const abrirVincular = () => {
    setSeleccion("");
    setOpenLink(true);
    if (!esAbono) return;
    // El API no expone un listado global de cobros: se buscan candidatos
    // cercanos al abrir (vuelos ±60 días → sus cobros bancarios).
    setCandidatos(null);
    void buscarCobrosCandidatosAction({
      fecha: movimiento.fecha,
      monto: movimiento.monto,
      cuenta_bancaria_id: movimiento.cuenta_bancaria_id,
    }).then((r) => {
      if (r.ok) setCandidatos(r.data ?? []);
      else {
        setCandidatos([]);
        toast.error(r.error ?? "No se pudieron buscar cobros");
      }
    });
  };

  const opcionesCobros = useMemo(
    () =>
      (candidatos ?? []).map((c) => ({
        value: c.id,
        label: `Vuelo #${c.folio ?? "—"} · $${fmtMoney(c.monto)} ${c.moneda} · ${c.metodo_cobro.replaceAll("_", " ")}`,
        description:
          [
            c.cliente,
            fmtDateCancun(c.fecha_cobro),
            c.neto !== Number(c.monto) ? `depósito neto $${fmtMoney(c.neto)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      })),
    [candidatos],
  );

  const desvincular = () => {
    startTransition(async () => {
      const r = vinculadoACobro
        ? await linkMovimientoCobroAction(movimiento.id, null)
        : await linkMovimientoAction(movimiento.id, null);
      if (r.ok) {
        toast.success(vinculadoACobro ? "Cobro desvinculado" : "Gasto desvinculado");
        setConfirmarDesvincular(false);
      } else toast.error(r.error ?? "Error");
    });
  };

  const vincular = () => {
    if (!seleccion) {
      toast.error(esAbono ? "Selecciona un cobro" : "Selecciona un gasto");
      return;
    }
    startTransition(async () => {
      const r = esAbono
        ? await linkMovimientoCobroAction(movimiento.id, seleccion)
        : await linkMovimientoAction(movimiento.id, seleccion);
      if (r.ok) {
        toast.success(esAbono ? "Cobro vinculado" : "Gasto vinculado");
        setOpenLink(false);
        setSeleccion("");
      } else {
        toast.error(r.error ?? "Error");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {vinculadoAGastoOCobro ? (
            <DropdownMenuItem
              onClick={() => setConfirmarDesvincular(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <XMarkIcon className="h-4 w-4" />
              {vinculadoACobro ? "Desvincular cobro" : "Desvincular gasto"}
            </DropdownMenuItem>
          ) : clasificado ? (
            <>
              <DropdownMenuItem onClick={abrirClasificar} className="gap-2">
                <TagIcon className="h-4 w-4" />
                Editar clasificación / notas
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmarQuitarClasif(true)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <XMarkIcon className="h-4 w-4" />
                Quitar clasificación
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={abrirVincular} className="gap-2">
                <LinkIcon className="h-4 w-4" />
                {esAbono ? "Vincular cobro" : "Vincular gasto"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={abrirClasificar} className="gap-2">
                <TagIcon className="h-4 w-4" />
                Clasificar (no es de un vuelo)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openLink} onOpenChange={setOpenLink}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{esAbono ? "Vincular cobro" : "Vincular gasto"}</DialogTitle>
            <DialogDescription>
              {esAbono
                ? `Abono de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. Selecciona el cobro de vuelo que corresponde.`
                : `Cargo de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. Selecciona el gasto capturado que corresponde.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{esAbono ? "Cobro" : "Gasto"}</Label>
            {esAbono && candidatos === null ? (
              <p className="text-sm text-muted-foreground">Buscando cobros cercanos…</p>
            ) : (
              <SearchableSelect
                options={esAbono ? opcionesCobros : gastos}
                value={seleccion}
                onChange={setSeleccion}
                placeholder={esAbono ? "Buscar por folio, cliente o monto" : "Buscar gasto"}
                emptyText={
                  esAbono
                    ? "Sin cobros candidatos cerca de la fecha del abono"
                    : "Sin resultados"
                }
              />
            )}
            {esAbono && (
              <p className="text-xs text-muted-foreground">
                Se muestran cobros por transferencia, HSBC link, BillPocket o cheque de
                vuelos con fecha cercana (±60 días), ordenados por cercanía de monto y
                fecha. Los cobros con comisión bancaria se comparan por el depósito neto.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenLink(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={vincular} disabled={pending}>
              {pending ? "Vinculando…" : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clasificar "sin vuelo": catálogo + creación en el mismo espacio. */}
      <Dialog open={openClasificar} onOpenChange={setOpenClasificar}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Clasificar movimiento (no es de un vuelo)</DialogTitle>
            <DialogDescription>
              {`${movimiento.tipo === "ABONO" ? "Abono" : "Cargo"} de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. `}
              Para movimientos del banco que no corresponden a ningún gasto o
              cobro capturado (comisiones del banco, impuestos, personales…).
              Queda conciliado con su clasificación y notas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Clasificación</Label>
              {clasificaciones === null ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : (
                <SearchableSelect
                  options={clasificaciones.map((c) => ({
                    value: c.id,
                    label: c.nombre,
                  }))}
                  value={clasifSel}
                  onChange={(v) => {
                    setClasifSel(v);
                    setClasifNueva("");
                  }}
                  placeholder={
                    clasificaciones.length === 0
                      ? "Aún no hay clasificaciones: crea la primera abajo"
                      : "Selecciona una clasificación"
                  }
                  emptyText="Sin resultados: créala abajo"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`clasif-nueva-${movimiento.id}`} className="text-sm font-medium">
                …o crea una nueva
              </Label>
              <Input
                id={`clasif-nueva-${movimiento.id}`}
                value={clasifNueva}
                onChange={(e) => setClasifNueva(e.target.value)}
                placeholder="Ej. Comisión del banco"
                maxLength={80}
              />
              {clasifNueva.trim() !== "" && (
                <p className="text-[11px] text-muted-foreground">
                  Se creará «{clasifNueva.trim()}» y se usará para este
                  movimiento (si ya existía con ese nombre, se reutiliza).
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`clasif-notas-${movimiento.id}`} className="text-sm font-medium">
                Notas (opcional)
              </Label>
              <Textarea
                id={`clasif-notas-${movimiento.id}`}
                value={clasifNotas}
                onChange={(e) => setClasifNotas(e.target.value)}
                placeholder="Ej. comisión mensual de la cuenta; no es gasto de operación"
                rows={2}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenClasificar(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={guardarClasificacion} disabled={pending}>
              {pending ? "Guardando…" : "Clasificar y conciliar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación antes de quitar la clasificación (vuelve a Pendiente). */}
      <AlertDialog
        open={confirmarQuitarClasif}
        onOpenChange={setConfirmarQuitarClasif}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar la clasificación?</AlertDialogTitle>
            <AlertDialogDescription>
              El movimiento volverá a quedar Pendiente de conciliar. Las notas
              se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                quitarClasificacion();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Quitando…" : "Quitar clasificación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación antes de desvincular (regla permanente del cliente). */}
      <AlertDialog open={confirmarDesvincular} onOpenChange={setConfirmarDesvincular}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {vinculadoACobro ? "¿Desvincular este cobro?" : "¿Desvincular este gasto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              El movimiento bancario volverá a quedar pendiente de conciliar y el{" "}
              {vinculadoACobro ? "cobro" : "gasto"} quedará libre para vincularse con otro
              movimiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                desvincular();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Desvinculando…" : "Desvincular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
