"use client";

import { useMemo, useState, useTransition } from "react";
import {
  LinkIcon,
  EllipsisHorizontalIcon,
  SparklesIcon,
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
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
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
  sugerirMovimientoAction,
  type Clasificacion,
} from "@/app/admin/conciliacion/actions";
import { fmtDate as fmtDateCancun, fmtDateOnly } from "@/lib/datetime";
import {
  descripcionCandidatoGasto,
  etiquetaCandidatoGasto,
  motivoPendienteDe,
  textoConfianza,
} from "@/lib/admin/conciliacion-auto";
import {
  textoGastoYaCubierto,
  toastVinculoGasto,
} from "@/lib/admin/conciliacion-parcial";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import type {
  CandidatoCobro,
  GastoCandidato,
  MovimientoBancario,
  SugerenciaConciliacion,
} from "@/types/conciliacion";

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
  /** Opciones de gasto precargadas por la página (`/v1/expenses`). La
   *  descripción trae «faltan $X de $Y» en los gastos con pago parcial. */
  gastos: SearchableSelectOption[];
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
  // CARGO (15-sep-2026): candidatos del API + sugerencia de la IA. El
  // selector de gastos precargado son los 200 más recientes de TODA la
  // empresa: con >100 gastos por semana el gasto correcto de un cargo de
  // hace tres semanas simplemente no aparecía.
  const [sugerencia, setSugerencia] = useState<SugerenciaConciliacion | null>(null);
  const [cargandoSug, setCargandoSug] = useState(false);
  const [usarCandidatos, setUsarCandidatos] = useState(false);

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

  /**
   * Candidatos del API para un CARGO + sugerencia de la IA (si está
   * configurada). La IA PROPONE: preselecciona, nunca liga sola.
   */
  const cargarSugerencia = () => {
    setCargandoSug(true);
    void sugerirMovimientoAction(movimiento.id)
      .then((r) => {
        setCargandoSug(false);
        if (!r.ok || !r.data) {
          toast.error(r.error ?? "No se pudieron buscar los gastos candidatos", {
            description:
              r.status === 404
                ? "El servidor todavía no tiene esta ayuda (falta desplegar el API)."
                : r.status === 403
                  ? "El asistente de conciliación es solo para ADMIN; los candidatos sí puedes verlos en «Ver todos los gastos recientes»."
                  : undefined,
          });
          return;
        }
        setSugerencia(r.data);
        setUsarCandidatos(true);
        if (r.data.gasto_id_sugerido) {
          setSeleccion(r.data.gasto_id_sugerido);
        } else if ((r.data.candidatos?.length ?? 0) === 0) {
          toast.info("No hay gastos candidatos cerca de este movimiento", {
            description:
              "Puedes buscar entre todos los gastos recientes o capturar el gasto que falta.",
          });
          setUsarCandidatos(false);
        }
      })
      .catch((err: unknown) => {
        setCargandoSug(false);
        toast.error(err instanceof Error ? err.message : "No se pudieron buscar los gastos");
      });
  };

  const abrirVincular = (conIa = false) => {
    setSeleccion("");
    setOpenLink(true);
    if (!esAbono) {
      setSugerencia(null);
      setUsarCandidatos(false);
      if (conIa) cargarSugerencia();
      return;
    }
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

  /** Candidatos de GASTO (sin repetir) que devolvió el API, sugerido primero. */
  const candidatosGasto = useMemo<GastoCandidato[]>(() => {
    if (!sugerencia) return [];
    const vistos = new Set<string>();
    const unicos: GastoCandidato[] = [];
    // `alternativas` del API son {gasto_id, confianza, razon} y sus ids ya
    // están en `candidatos` (el API los valida contra esa lista): mezclarlas
    // aquí no aportaba nada y escondía el tipo real.
    for (const g of sugerencia.candidatos ?? []) {
      if (!g?.id || vistos.has(g.id)) continue;
      vistos.add(g.id);
      unicos.push(g);
    }
    const sug = sugerencia.gasto_id_sugerido;
    return sug ? [...unicos.filter((g) => g.id === sug), ...unicos.filter((g) => g.id !== sug)] : unicos;
  }, [sugerencia]);

  const opcionesGastoCandidatos = useMemo(
    () =>
      candidatosGasto.map((g) => {
        const esSugerido = g.id === sugerencia?.gasto_id_sugerido;
        const desc = descripcionCandidatoGasto(g);
        return {
          value: g.id,
          label: `${esSugerido ? "★ " : ""}${etiquetaCandidatoGasto(g)}`,
          description:
            [esSugerido ? "Sugerido por la IA" : null, desc].filter(Boolean).join(" · ") ||
            undefined,
          descriptionClassName: esSugerido
            ? "truncate text-emerald-600 dark:text-emerald-400 font-medium"
            : undefined,
        };
      }),
    [candidatosGasto, sugerencia],
  );

  const gastoSeleccionado = useMemo(
    () => candidatosGasto.find((g) => g.id === seleccion) ?? null,
    [candidatosGasto, seleccion],
  );

  /** Por qué quedó pendiente (lo dice el API; null = no lo sabe). */
  const motivo = motivoPendienteDe(movimiento);

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
        if (esAbono) {
          toast.success(
            seleccionado?.tipo === "SOBRE_GRUPO"
              ? `Cobro de grupo ${folioTexto(seleccionado.grupo_folio)} vinculado`
              : "Cobro vinculado",
          );
        } else {
          // Pagos parciales (14-sep-2026): el API dice si el gasto quedó
          // CUBIERTO o si todavía falta — el toast no puede decir "listo"
          // cuando el gasto sigue en «Gastos sin banco».
          const t = toastVinculoGasto(r.data);
          toast.success(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
        }
        setOpenLink(false);
        setSeleccion("");
        setSugerencia(null);
        setUsarCandidatos(false);
      } else if (r.code === "GASTO_YA_CUBIERTO") {
        // Los cargos ya ligados CUBREN el gasto: este cargo no cabe. El
        // mensaje del API ya explica qué hacer si es otro pago de la misma
        // factura (el gasto debe valer la suma de los dos).
        const t = textoGastoYaCubierto(r.error, r.details);
        toast.error(t.titulo, { description: t.descripcion });
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
              <DropdownMenuItem onClick={() => abrirVincular()} className="gap-2">
                <LinkIcon className="h-4 w-4" />
                {esAbono ? "Vincular cobro" : "Vincular gasto"}
              </DropdownMenuItem>
              {/* La IA PROPONE el gasto más probable (descripción del banco,
                  terminación de tarjeta, monto y fecha): abre el mismo
                  diálogo con el candidato preseleccionado. Nunca liga sola. */}
              {!esAbono && (
                <DropdownMenuItem onClick={() => abrirVincular(true)} className="gap-2">
                  <SparklesIcon className="h-4 w-4" />
                  Sugerir con IA
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={abrirClasificar} className="gap-2">
                <TagIcon className="h-4 w-4" />
                Clasificar (no es de un vuelo)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={openLink}
        onOpenChange={(o) => {
          if (!o) {
            setSugerencia(null);
            setUsarCandidatos(false);
            setSeleccion("");
          }
          setOpenLink(o);
        }}
      >
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
            <div className="flex items-end justify-between gap-2 flex-wrap">
              <Label className="text-sm font-medium">
                {esAbono
                  ? "Cobro o sobre de grupo"
                  : usarCandidatos
                    ? `Gastos candidatos (${candidatosGasto.length})`
                    : "Gasto"}
              </Label>
              {/* CARGO: los candidatos del API (misma moneda, ventana de
                  fechas, monto o faltante) en vez de los 200 gastos más
                  recientes de toda la empresa. */}
              {!esAbono &&
                (usarCandidatos ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    onClick={() => setUsarCandidatos(false)}
                  >
                    Ver todos los gastos recientes
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-brand-600 hover:underline underline-offset-2 disabled:opacity-50"
                    onClick={cargarSugerencia}
                    disabled={cargandoSug || pending}
                  >
                    {cargandoSug
                      ? "Buscando candidatos…"
                      : sugerencia
                        ? "Ver solo los candidatos"
                        : "Buscar el gasto que corresponde (IA)"}
                  </button>
                ))}
            </div>
            {/* Por qué quedó pendiente: el mismo dato de la tabla, aquí es
                donde el operador lo necesita. */}
            {!esAbono && motivo && (
              <p className="text-xs text-muted-foreground" title={motivo.detalle}>
                Quedó pendiente: {motivo.etiqueta.toLowerCase()}.
              </p>
            )}
            {(esAbono && candidatos === null) || (!esAbono && cargandoSug) ? (
              <p className="text-sm text-muted-foreground">
                {esAbono ? "Buscando cobros cercanos…" : "Buscando gastos candidatos…"}
              </p>
            ) : (
              <SearchableSelect
                options={
                  esAbono ? opcionesCobros : usarCandidatos ? opcionesGastoCandidatos : gastos
                }
                value={seleccion}
                onChange={setSeleccion}
                placeholder={
                  esAbono ? "Buscar por folio, grupo, cliente o monto" : "Buscar gasto"
                }
                emptyText={
                  esAbono
                    ? "Sin cobros ni sobres candidatos cerca de la fecha del abono"
                    : usarCandidatos
                      ? "Sin gastos candidatos en la ventana de fechas"
                      : "Sin resultados"
                }
              />
            )}
            {/* Propuesta de la IA: razón, confianza y evidencias. Se
                preselecciona, pero vincular lo confirma una persona. */}
            {!esAbono && sugerencia && sugerencia.gasto_id_sugerido && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    Sugerencia de la IA
                  </Badge>
                  <span className="text-muted-foreground">
                    {textoConfianza(sugerencia.confianza).texto}
                  </span>
                </div>
                {sugerencia.razon && <p className="text-muted-foreground">{sugerencia.razon}</p>}
                {(sugerencia.evidencias?.length ?? 0) > 0 && (
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    {sugerencia.evidencias!.map((e) => (
                      <li key={e}>· {e}</li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Revísala antes de vincular: la IA propone, tú confirmas.
                </p>
              </div>
            )}
            {!esAbono && sugerencia && !sugerencia.disponible && (
              <p className="text-xs text-muted-foreground">
                El asistente de IA no está disponible en el servidor: se muestran
                los gastos candidatos para que elijas.
              </p>
            )}
            {/* Contestó y NO propuso ninguno: su motivo vale tanto como una
                propuesta (evita que el operador crea que la IA falló). */}
            {!esAbono &&
              sugerencia &&
              sugerencia.disponible &&
              !sugerencia.gasto_id_sugerido &&
              (sugerencia.motivo_sin_match ?? sugerencia.razon) && (
                <p className="text-xs text-muted-foreground">
                  La IA no propuso ninguno: {sugerencia.motivo_sin_match ?? sugerencia.razon}
                </p>
              )}
            {/* Candidato elegido: terminación de tarjeta, nota/lugar, matrícula
                y pago parcial — lo que de verdad desempata a ojo. */}
            {!esAbono && gastoSeleccionado && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{etiquetaCandidatoGasto(gastoSeleccionado)}</span>
                  {gastoSeleccionado.id === sugerencia?.gasto_id_sugerido && (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    >
                      Sugerido
                    </Badge>
                  )}
                </div>
                {descripcionCandidatoGasto(gastoSeleccionado) && (
                  <p className="text-xs text-muted-foreground">
                    {descripcionCandidatoGasto(gastoSeleccionado)}
                  </p>
                )}
              </div>
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
              {!vinculadoACobro &&
                " Si el gasto se pagó en varios cargos, los demás siguen ligados: el gasto queda como pago parcial hasta que lo cubran."}
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
