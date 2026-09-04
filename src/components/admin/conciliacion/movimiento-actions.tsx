"use client";

import { useMemo, useState, useTransition } from "react";
import {
  LinkIcon,
  EllipsisHorizontalIcon,
  TagIcon,
  XMarkIcon,
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
  candidatosCobroAction,
  clasificarMovimientoAction,
  crearClasificacionAction,
  linkMovimientoAction,
  linkMovimientoCobroAction,
  listClasificacionesAction,
  type Clasificacion,
} from "@/app/admin/conciliacion/actions";
import { fmtDate as fmtDateCancun, fmtDateOnly } from "@/lib/datetime";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import type { CandidatoCobro, MovimientoBancario } from "@/types/conciliacion";

const fmtMoney = (monto: string | number) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });

/** Ventana ±días de candidatos (la misma que usaba el panel antes). */
const VENTANA_DIAS = 60;

/** Valor único del select: el mismo uuid no puede confundirse entre tablas. */
const valorCandidato = (c: CandidatoCobro) => `${c.tipo}:${c.id}`;

/** "Grupo G-12 · 7 aviones" (chip del sobre). */
const chipSobre = (c: { grupo_folio: number | null; aviones_n: number }) =>
  `Grupo ${folioTexto(c.grupo_folio)}${
    c.aviones_n > 0 ? ` · ${c.aviones_n} ${c.aviones_n === 1 ? "avión" : "aviones"}` : ""
  }`;

/** El API redondea dif_monto a 2 decimales: 0 = cuadra exacto con el abono. */
const cuadraExacto = (c: CandidatoCobro) => c.dif_monto === 0;

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
  // null = buscando; lista = resultado (solo aplica a ABONOS). Cobros de
  // vuelo Y sobres de grupo, armados por el API.
  const [candidatos, setCandidatos] = useState<CandidatoCobro[] | null>(null);
  const [exactos, setExactos] = useState(0);
  const [pending, startTransition] = useTransition();

  // Qué tiene vinculado realmente el movimiento (manda sobre el tipo al
  // desvincular, por si un dato viejo quedó cruzado distinto). Un ABONO se
  // liga a un cobro de vuelo (cobro_id) O al sobre de un grupo
  // (cobro_grupo_id): ambos son "cobro" para desvincular.
  const vinculadoASobre = movimiento.cobro_grupo_id != null;
  const vinculadoACobro = movimiento.cobro_id != null || vinculadoASobre;
  const vinculadoAGastoOCobro = movimiento.gasto_id != null || vinculadoACobro;
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

  const cargarCandidatos = () => {
    setCandidatos(null);
    setExactos(0);
    void candidatosCobroAction(movimiento.id, VENTANA_DIAS).then((r) => {
      if (r.ok && r.data) {
        setCandidatos(r.data.candidatos);
        setExactos(r.data.exactos);
      } else {
        setCandidatos([]);
        toast.error(r.error ?? "No se pudieron buscar cobros");
      }
    });
  };

  const abrirVincular = () => {
    setSeleccion("");
    setOpenLink(true);
    if (!esAbono) return;
    // Candidatos del API (cobros de vuelo + sobres de grupo, ±60 días,
    // misma moneda que la cuenta, ordenados por cercanía del neto).
    cargarCandidatos();
  };

  const opcionesCobros = useMemo(
    () =>
      (candidatos ?? []).map((c) => {
        const exacto = cuadraExacto(c);
        // Etiqueta es-MX del método (fuente única del panel).
        const metodo = metodoPagoLabel(c.metodo_cobro);
        const label =
          c.tipo === "SOBRE_GRUPO"
            ? `${chipSobre(c)} · $${fmtMoney(c.monto)} ${c.moneda} · ${metodo}`
            : `Vuelo #${c.folio ?? "—"} · $${fmtMoney(c.monto)} ${c.moneda} · ${metodo}`;
        const description =
          [
            c.tipo === "SOBRE_GRUPO" ? c.grupo_nombre : null,
            c.cliente,
            fmtDateCancun(c.fecha_cobro),
            c.neto !== c.monto ? `depósito neto $${fmtMoney(c.neto)}` : null,
            exacto ? "cuadra exacto con el abono" : `diferencia $${fmtMoney(c.dif_monto)}`,
          ]
            .filter(Boolean)
            .join(" · ") || undefined;
        return {
          value: valorCandidato(c),
          label,
          description,
          // Exacto resaltado en verde; el resto en gris (default).
          descriptionClassName: exacto
            ? "truncate text-emerald-600 dark:text-emerald-400 font-medium"
            : undefined,
        };
      }),
    [candidatos],
  );

  const seleccionado = useMemo(
    () => (candidatos ?? []).find((c) => valorCandidato(c) === seleccion) ?? null,
    [candidatos, seleccion],
  );

  const desvincular = () => {
    startTransition(async () => {
      const r = vinculadoACobro
        ? await linkMovimientoCobroAction(movimiento.id, null)
        : await linkMovimientoAction(movimiento.id, null);
      if (r.ok) {
        toast.success(
          vinculadoASobre
            ? "Cobro de grupo desvinculado"
            : vinculadoACobro
              ? "Cobro desvinculado"
              : "Gasto desvinculado",
        );
        setConfirmarDesvincular(false);
      } else toast.error(r.error ?? "Error");
    });
  };

  const vincular = () => {
    if (!seleccion || (esAbono && !seleccionado)) {
      toast.error(esAbono ? "Selecciona un cobro o un sobre de grupo" : "Selecciona un gasto");
      return;
    }
    startTransition(async () => {
      let r;
      if (esAbono && seleccionado) {
        // Cobro de vuelo → {cobro_id}; sobre de grupo → {cobro_grupo_id}.
        r = await linkMovimientoCobroAction(
          movimiento.id,
          seleccionado.tipo === "SOBRE_GRUPO"
            ? { cobro_grupo_id: seleccionado.cobro_grupo_id }
            : { cobro_id: seleccionado.cobro_id },
        );
      } else {
        r = await linkMovimientoAction(movimiento.id, seleccion);
      }
      if (r.ok) {
        toast.success(
          esAbono
            ? seleccionado?.tipo === "SOBRE_GRUPO"
              ? `Cobro de grupo ${folioTexto(seleccionado.grupo_folio)} vinculado`
              : "Cobro vinculado"
            : "Gasto vinculado",
        );
        setOpenLink(false);
        setSeleccion("");
      } else if (r.code === "COBRO_DE_GRUPO") {
        // Candado del API: una PARTE de sobre nunca se concilia; se concilia
        // el sobre del grupo (el mensaje del API ya lo dice).
        const d = r.details as { grupo_folio?: number | null } | undefined;
        toast.error(r.error ?? "Este cobro es parte de un sobre de grupo.", {
          description: `Elige el sobre del grupo ${folioTexto(d?.grupo_folio)} en la lista (aparece como «Grupo …»).`,
        });
        cargarCandidatos();
      } else if (r.status === 409) {
        // Ya conciliado con OTRO movimiento (carrera entre dos personas):
        // se refresca la lista para que desaparezca el ocupado.
        toast.error(r.error ?? "Ya está conciliado con otro movimiento.", {
          description:
            "Desvincúlalo en el otro movimiento si fue un error, o elige otro candidato.",
        });
        setSeleccion("");
        cargarCandidatos();
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
              {vinculadoASobre
                ? "Desvincular cobro de grupo"
                : vinculadoACobro
                  ? "Desvincular cobro"
                  : "Desvincular gasto"}
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
                ? `Abono de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. Selecciona el cobro de vuelo o el sobre de grupo que corresponde.`
                : `Cargo de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. Selecciona el gasto capturado que corresponde.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {esAbono ? "Cobro o sobre de grupo" : "Gasto"}
            </Label>
            {esAbono && candidatos === null ? (
              <p className="text-sm text-muted-foreground">Buscando cobros cercanos…</p>
            ) : (
              <SearchableSelect
                options={esAbono ? opcionesCobros : gastos}
                value={seleccion}
                onChange={setSeleccion}
                placeholder={
                  esAbono ? "Buscar por folio, grupo, cliente o monto" : "Buscar gasto"
                }
                emptyText={
                  esAbono
                    ? "Sin cobros ni sobres candidatos cerca de la fecha del abono"
                    : "Sin resultados"
                }
              />
            )}
            {esAbono && candidatos !== null && exactos > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {exactos === 1
                  ? "1 candidato cuadra exacto con el abono (aparece primero)."
                  : `${exactos} candidatos cuadran exacto con el abono (aparecen primero).`}
              </p>
            )}
            {/* Resumen de lo elegido: chip del sobre (Grupo G-12 · 7 aviones)
                o del vuelo, monto y si cuadra — para confirmar antes de ligar. */}
            {esAbono && seleccionado && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {seleccionado.tipo === "SOBRE_GRUPO" ? (
                    <Badge
                      variant="outline"
                      className="bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30"
                      title={seleccionado.grupo_nombre ?? undefined}
                    >
                      {chipSobre(seleccionado)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Vuelo #{seleccionado.folio ?? "—"}</Badge>
                  )}
                  <span className="font-mono font-semibold">
                    ${fmtMoney(seleccionado.monto)} {seleccionado.moneda}
                  </span>
                  {cuadraExacto(seleccionado) ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    >
                      Cuadra exacto
                    </Badge>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Diferencia ${fmtMoney(seleccionado.dif_monto)} contra el abono
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    seleccionado.tipo === "SOBRE_GRUPO" ? seleccionado.grupo_nombre : null,
                    seleccionado.cliente,
                    fmtDateCancun(seleccionado.fecha_cobro),
                    metodoPagoLabel(seleccionado.metodo_cobro),
                    seleccionado.neto !== seleccionado.monto
                      ? `depósito neto $${fmtMoney(seleccionado.neto)}`
                      : null,
                    seleccionado.referencia ? `ref. ${seleccionado.referencia}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {seleccionado.tipo === "SOBRE_GRUPO" && (
                  <p className="text-[11px] text-muted-foreground">
                    El abono se concilia contra el sobre completo del grupo; las
                    partes por avión quedan conciliadas con él.
                  </p>
                )}
              </div>
            )}
            {esAbono && (
              <p className="text-xs text-muted-foreground">
                Se muestran cobros de vuelo y sobres de grupo por transferencia, HSBC
                link, BillPocket o cheque con fecha cercana (±{VENTANA_DIAS} días) y la
                moneda de la cuenta, ordenados por cercanía de monto y fecha. Los cobros
                con comisión bancaria se comparan por el depósito neto. Las partes por
                avión de un sobre no se ofrecen: se concilia el sobre.
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
              {vinculadoASobre
                ? "¿Desvincular este cobro de grupo?"
                : vinculadoACobro
                  ? "¿Desvincular este cobro?"
                  : "¿Desvincular este gasto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              El movimiento bancario volverá a quedar pendiente de conciliar y el{" "}
              {vinculadoASobre ? "sobre del grupo" : vinculadoACobro ? "cobro" : "gasto"}{" "}
              quedará libre para vincularse con otro movimiento.
              {vinculadoASobre &&
                " Las partes por avión del sobre dejan de verse como conciliadas."}
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
