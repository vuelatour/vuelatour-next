"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowTrendingUpIcon,
  ArrowUturnLeftIcon,
  LinkIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  NoSymbolIcon,
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
  quitarReversoAction,
  type ActionResult,
  type Clasificacion,
} from "@/app/admin/conciliacion/actions";
import { ReversoDialog } from "@/components/admin/conciliacion/reverso-dialog";
import { VincularGastoDialog } from "@/components/admin/conciliacion/vincular-gasto-dialog";
import { AbonoAcciones } from "@/components/admin/ingresos/abono-acciones";
import { ConfirmacionVincular } from "@/components/admin/ingresos/vincular-abono-dialog";
import {
  abonoPendienteDeMovimiento,
  esAbonoPendiente,
  type AbonosConciliacion,
} from "@/lib/admin/conciliacion-abonos";
import type { CatalogosGastoDesdeCargo } from "@/lib/admin/gasto-desde-cargo";
import { ligarAbonoIngresoAction } from "@/app/admin/ingresos/actions";
import { fmtDateOnly } from "@/lib/datetime";
import { fechasCandidatoCobro } from "@/lib/admin/ingresos-ui";
import {
  esCargoConLote,
  gastosLigadosDe,
  mensajeErrorBusquedaGastos,
  menuDesvincularGastos,
  numeroGastosDe,
  textoConfirmarDesvincularGastos,
  tieneGastoLigado,
  tituloDesvincularGastos,
  toastDesvinculoGastos,
} from "@/lib/admin/conciliacion-lote";
import { textoDesvincularNoBancario } from "@/lib/admin/conciliacion-no-bancario";
import {
  MENU_DESVINCULAR_ESTE_ABONO,
  MSG_DESVINCULO_INCIERTO,
  TITULO_DESVINCULAR_ESTE_ABONO,
  abonoConOtrosAbonosDelCobro,
  botonVincularAbono,
  guiaAlVincular,
  mensajeErrorVincularCobros,
  menuDesvincularCobros,
  numeroCobrosDe,
  pistaDialogoLegado,
  textoConfirmarDesvincularCobros,
  textoCandidatosCobroNoCargaron,
  textoConfirmarParcial,
  textoExtraDesvincularLote,
  toastDesvinculoCobros,
  toastVinculoCobros,
  tituloDesvincularCobros,
} from "@/lib/admin/conciliacion-cobros-lote";
import { textoCobroVuelveASinBanco, textoConfirmarDesvincularAbono } from "@/lib/admin/cobro-banco";
import {
  BOTON_QUITAR_REVERSO,
  MENU_ABONO_DEVOLUCION,
  MENU_CARGO_DEVUELTO,
  MENU_QUITAR_REVERSO,
  TITULO_QUITAR_REVERSO,
  TOAST_REVERSO_QUITADO,
  esConciliadoPorReverso,
  mensajeErrorReverso,
  textoConfirmarQuitarReverso,
} from "@/lib/admin/conciliacion-reverso";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { MSG_SIN_CONEXION } from "@/lib/admin/conciliacion-lote";
import {
  MENU_OMITIR,
  MENU_QUITAR_OMISION,
  MSG_CLASIFICACIONES_NO_CARGARON,
  apiConOmision,
  esClasificacionOmitida,
  esOmitido,
  esperadoClasificacionDe,
} from "@/lib/admin/conciliacion-omision";
import { esSeleccionable } from "@/lib/admin/conciliacion-seleccion";
import type { CandidatoCobro, MovimientoBancario } from "@/types/conciliacion";

const fmtMoney = (monto: string | number) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });

/**
 * «Omitir la conciliación…» y «Deshacer la omisión…» de UNA fila (14-oct-2026,
 * API 0.0.77): los MISMOS diálogos de la barra de la selección, con
 * `next/dynamic` sin SSR y montados solo al abrirse.
 */
const OmitirMovimientosDialog = dynamic(
  () => import("@/components/admin/conciliacion/omitir-movimientos-dialog").then((m) => m.OmitirMovimientosDialog),
  { ssr: false },
);
const QuitarOmisionDialog = dynamic(
  () => import("@/components/admin/conciliacion/quitar-omision-dialog").then((m) => m.QuitarOmisionDialog),
  { ssr: false },
);

/** La server action ni siquiera salió (sin red, un deploy de Vercel): nunca lanza. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_SIN_CONEXION });

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
  /** Opciones de gasto precargadas por la página (`/v1/expenses`). Desde el
   *  2-oct-2026 son solo el RESPALDO del diálogo de un CARGO con un API
   *  previo (sin candidatos del servidor). */
  gastos: SearchableSelectOption[];
  /** ABONOS sin identificar con el MISMO menú de Ingresos → «Por conciliar»
   *  (12-oct-2026: Vincular, anticipo, otro ingreso, traspaso, devolución,
   *  Sugerir con IA) + «Clasificar». Sin catálogos (null) el menú de siempre. */
  abonos?: AbonosConciliacion | null;
  /** Catálogos del alta de gasto para «¿No está el gasto? Créalo» del
   *  diálogo del CARGO (12-oct-2026). Sin ellos no se ofrece crear. */
  catalogosGasto?: CatalogosGastoDesdeCargo | null;
  /** Alias y moneda por cuenta (14-oct-2026, ADITIVOS): el renglón y el
   *  resumen de «Omitir…» / «Deshacer la omisión…» de esta fila. */
  cuentas?: Readonly<Record<string, string>> | null;
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
}

/**
 * Acciones de conciliación manual de un movimiento bancario.
 * CARGO ↔ uno o VARIOS gastos (`VincularGastoDialog`, candidatos del
 * servidor con casillas, 2-oct-2026) y ABONO ↔ cobro de vuelo o sobre de
 * grupo (candidatos buscados al abrir el diálogo, ordenados por cercanía de
 * monto y fecha).
 */
export function MovimientoActions({
  movimiento,
  gastos,
  abonos,
  catalogosGasto = null,
  cuentas = null,
  monedaPorCuenta = null,
}: MovimientoActionsProps) {
  const esAbono = movimiento.tipo === "ABONO";
  const [openLink, setOpenLink] = useState(false);
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false);
  const [seleccion, setSeleccion] = useState("");
  // null = buscando; lista = resultado (solo aplica a ABONOS). Cobros de
  // vuelo Y sobres de grupo, armados por el API.
  const [candidatos, setCandidatos] = useState<CandidatoCobro[] | null>(null);
  const [exactos, setExactos] = useState(0);
  // La búsqueda de candidatos FALLÓ: se dice con «Reintentar» (jamás la lista
  // vacía «Sin cobros ni sobres candidatos», revisión 2 del 15-oct-2026).
  const [errorCandidatos, setErrorCandidatos] = useState<string | null>(null);
  // `movimiento.cobros_parciales` del API (0.0.78): con `false` un PARCIAL
  // nuevo se apaga (el resto no se podría vincular). null = API previo.
  const [cobrosParciales, setCobrosParciales] = useState<boolean | null>(null);
  // «Vincular como parcial…» del diálogo legado (API 0.0.78): se confirma.
  const [confirmarParcial, setConfirmarParcial] = useState(false);
  // La liga del diálogo legado no tuvo respuesta (no se sabe si quedó): la
  // página se pone al día UNA vez al cerrar el diálogo (revisión del 15-oct-2026).
  const refrescarAlCerrarLinkRef = useRef(false);
  const [pending, startTransition] = useTransition();
  // CARGO (2-oct-2026): su diálogo propio (uno o varios gastos) se monta
  // solo al abrir, como el de devoluciones. `conIa` = se abrió desde
  // «Sugerir con IA».
  const [openVincularGasto, setOpenVincularGasto] = useState(false);
  const [vincularConIa, setVincularConIa] = useState(false);

  // Qué tiene vinculado realmente el movimiento (manda sobre el tipo al
  // desvincular, por si un dato viejo quedó cruzado distinto). Un ABONO se
  // liga a un cobro de vuelo (cobro_id) O al sobre de un grupo
  // (cobro_grupo_id): ambos son "cobro" para desvincular.
  const vinculadoASobre = movimiento.cobro_grupo_id != null;
  // 1 abono ↔ N cobros (12-oct-2026): con 2+ partes `cobro_id` viene NULL y
  // la liga se lee de `cobros_n`.
  const cobrosDelLote = numeroCobrosDe(movimiento);
  const vinculadoACobro = movimiento.cobro_id != null || vinculadoASobre || cobrosDelLote > 0;
  // UN COBRO, VARIOS ABONOS (API 0.0.78, D22): el cobro de este abono tiene
  // OTROS abonos ⇒ «Desvincular este abono del cobro» y la confirmación dice
  // cómo queda (con `faltante_sin_este` del API). Sin el dato, lo de siempre.
  const monedaAbono = monedaPorCuenta?.[movimiento.cuenta_bancaria_id] ?? null;
  const abonoConOtros = vinculadoACobro && !vinculadoASobre && abonoConOtrosAbonosDelCobro(movimiento);
  const textoDesvincularConOtros = abonoConOtros
    ? textoConfirmarDesvincularAbono(movimiento.cobro_conciliacion, {
        monto: movimiento.monto,
        fecha: movimiento.fecha,
        moneda: movimiento.cobro?.moneda ?? monedaAbono,
      })
    : null;
  // «… vuelve a «Cobros sin banco».» SOLO si su método sale ahí (un BillPocket no).
  const extraDesvincularUnico =
    vinculadoACobro && !vinculadoASobre && cobrosDelLote < 2
      ? textoCobroVuelveASinBanco(movimiento.cobro_conciliacion, movimiento.cobro?.metodo_cobro)
      : null;
  const extraDesvincularLote = vinculadoACobro && cobrosDelLote >= 2 ? textoExtraDesvincularLote(movimiento) : null;
  // Ligado a gasto = `gasto_id` (espejo con UNA parte) o `gastos_n > 0`: un
  // cargo que paga VARIOS gastos trae `gasto_id` NULL (2-oct-2026).
  const vinculadoAGastoOCobro = tieneGastoLigado(movimiento) || vinculadoACobro;
  const conLote = !vinculadoACobro && esCargoConLote(movimiento);
  const gastosDelLote = numeroGastosDe(movimiento);
  // Un gasto en efectivo ligado con justificación (6-oct-2026): desvincular
  // borra esa nota del cargo y del gasto, y la confirmación lo dice.
  const notaDesvincularNoBancario = vinculadoACobro ? null : textoDesvincularNoBancario(gastosLigadosDe(movimiento));
  const clasificado = movimiento.clasificacion_id != null;
  // ABONO conciliado contra un INGRESO registrado (24-sep-2026): se suelta
  // con su propia ruta (`PATCH movimientos/:id/ingreso`), no con la del cobro.
  const vinculadoAIngreso = movimiento.ingreso_id != null;
  // Cargo devuelto ↔ su devolución (30-sep-2026): conciliados JUNTOS. Se
  // deshacen juntos (los dos vuelven a pendiente), nunca uno solo.
  const emparejadoPorReverso = esConciliadoPorReverso(movimiento);
  const [openReverso, setOpenReverso] = useState(false);
  const [confirmarQuitarReverso, setConfirmarQuitarReverso] = useState(false);
  const router = useRouter();

  // Clasificación "sin vuelo": elegir del catálogo o crear una nueva en el
  // mismo diálogo, con notas. Concilia el movimiento sin gasto/cobro.
  const [openClasificar, setOpenClasificar] = useState(false);
  const [clasificaciones, setClasificaciones] = useState<Clasificacion[] | null>(null);
  const [clasifSel, setClasifSel] = useState("");
  const [clasifNueva, setClasifNueva] = useState("");
  const [clasifNotas, setClasifNotas] = useState("");
  const [confirmarQuitarClasif, setConfirmarQuitarClasif] = useState(false);
  // La lectura del catálogo FALLÓ (14-oct-2026): se dice, nunca «Aún no hay
  // clasificaciones» (eso es solo cuando el catálogo de verdad está vacío).
  const [errorClasificaciones, setErrorClasificaciones] = useState(false);

  // OMITIR LA CONCILIACIÓN (14-oct-2026, API 0.0.77): solo con un API que ya
  // sabe omitir (la fila trae la llave `omision`) y solo a un pendiente LIBRE
  // de verdad (el MISMO predicado de las casillas de la selección).
  const conOmision = apiConOmision([movimiento]);
  const omitible = conOmision && esSeleccionable(movimiento, "lista");
  const omitido = esOmitido(movimiento);
  const [openOmitir, setOpenOmitir] = useState(false);
  const [openQuitarOmision, setOpenQuitarOmision] = useState(false);
  // Lo que el panel VIO de la clasificación (el API 0.0.77 responde 409
  // MOVIMIENTO_CAMBIO si cambió mientras tanto), CAPTURADO al abrir el diálogo
  // o la confirmación (revisión del 15-oct-2026: tomado del render, un
  // refresh con el diálogo abierto lo cambiaba y el candado no saltaba). Con
  // un API previo, o un conciliado sin clasificación, no viaja
  // (`esperadoClasificacionDe`).
  const esperadoClasificarRef = useRef<ReturnType<typeof esperadoClasificacionDe>>({});
  const esperadoQuitarRef = useRef<ReturnType<typeof esperadoClasificacionDe>>({});

  const abrirQuitarClasificacion = () => {
    esperadoQuitarRef.current = esperadoClasificacionDe(movimiento);
    setConfirmarQuitarClasif(true);
  };

  const abrirClasificar = () => {
    esperadoClasificarRef.current = esperadoClasificacionDe(movimiento);
    setClasifSel(movimiento.clasificacion_id ?? "");
    setClasifNueva("");
    setClasifNotas(movimiento.notas ?? "");
    setOpenClasificar(true);
    setClasificaciones(null);
    setErrorClasificaciones(false);
    void listClasificacionesAction()
      .catch(sinConexion)
      .then((r) => {
        if (r.ok) {
          // La canónica «Omitido de la conciliación» jamás se elige aquí:
          // omitir pide motivo firmado (el API 0.0.77 ya no la manda).
          setClasificaciones((r.data ?? []).filter((c) => !esClasificacionOmitida(c.nombre)));
        } else {
          setClasificaciones([]);
          setErrorClasificaciones(true);
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
        const creada = await crearClasificacionAction(nueva).catch(sinConexion);
        if (!creada.ok || !creada.data) {
          toast.error(creada.error ?? "No se pudo crear la clasificación");
          return;
        }
        clasifId = creada.data.id;
      }
      const r = await clasificarMovimientoAction(movimiento.id, {
        clasificacion_id: clasifId,
        notas: clasifNotas,
        ...esperadoClasificarRef.current,
      }).catch(sinConexion);
      if (r.ok) {
        toast.success("Movimiento clasificado (deja de estar pendiente)");
        setOpenClasificar(false);
      } else {
        toast.error(r.error ?? "Error al clasificar");
        // Alguien lo vinculó, lo clasificó o lo omitió mientras tanto: la
        // fila se pone al día (el texto del API lo dice).
        if (r.code === "MOVIMIENTO_CAMBIO" || r.code === "MOVIMIENTO_OMITIDO") {
          setOpenClasificar(false);
          router.refresh();
        }
      }
    });
  };

  const quitarClasificacion = () => {
    startTransition(async () => {
      const r = await clasificarMovimientoAction(movimiento.id, {
        clasificacion_id: null,
        ...esperadoQuitarRef.current,
      }).catch(sinConexion);
      if (r.ok) {
        toast.success("Clasificación quitada: el movimiento vuelve a Pendiente");
        setConfirmarQuitarClasif(false);
      } else {
        toast.error(r.error ?? "Error");
        if (r.code === "MOVIMIENTO_CAMBIO" || r.code === "MOVIMIENTO_OMITIDO") {
          setConfirmarQuitarClasif(false);
          router.refresh();
        }
      }
    });
  };

  const quitarReverso = () => {
    startTransition(async () => {
      const r = await quitarReversoAction(movimiento.id).catch(sinConexion);
      if (r.ok) {
        toast.success(TOAST_REVERSO_QUITADO);
        setConfirmarQuitarReverso(false);
        router.refresh();
      } else {
        const e = mensajeErrorReverso(r);
        toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
        if (e.recargar) {
          setConfirmarQuitarReverso(false);
          router.refresh();
        }
      }
    });
  };

  const cargarCandidatos = () => {
    setCandidatos(null);
    setExactos(0);
    setErrorCandidatos(null);
    // Con `.catch`: sin red la lista ya no se queda «Buscando…» para siempre.
    void candidatosCobroAction(movimiento.id, VENTANA_DIAS)
      .catch(sinConexion)
      .then((r) => {
        if (r.ok && r.data) {
          setCandidatos(r.data.candidatos);
          setExactos(r.data.exactos);
          const cp = r.data.movimiento?.cobros_parciales;
          setCobrosParciales(typeof cp === "boolean" ? cp : null);
        } else {
          // Falló: «no se pudo» + «Reintentar», nunca la lista vacía.
          setCandidatos([]);
          setErrorCandidatos(textoCandidatosCobroNoCargaron(r));
        }
      });
  };

  /**
   * Cierra «Vincular cobro» por CUALQUIER camino («Cancelar», Esc, la X, el
   * clic fuera o el éxito): suelta lo elegido y la confirmación, y si una liga
   * quedó sin respuesta pone la página al día. Base UI no llama
   * `onOpenChange` cuando cambia el `open` controlado, así que «Cancelar» con
   * cerrar el `open` directo se saltaba el refresco (revisión 2 del
   * 15-oct-2026).
   */
  const cerrarVincular = () => {
    setSeleccion("");
    setConfirmarParcial(false);
    if (refrescarAlCerrarLinkRef.current) {
      refrescarAlCerrarLinkRef.current = false;
      router.refresh();
    }
    setOpenLink(false);
  };

  const abrirVincular = (conIa = false) => {
    if (!esAbono) {
      // CARGO: diálogo propio (candidatos del servidor, uno o varios gastos).
      setVincularConIa(conIa);
      setOpenVincularGasto(true);
      return;
    }
    setSeleccion("");
    setConfirmarParcial(false);
    setOpenLink(true);
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
            fechasCandidatoCobro(c),
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

  /** Sin respuesta al desvincular: no se sabe si quedó (jamás «no se desvinculó»); la fila se pone al día. */
  const desvinculoIncierto = () => {
    toast.error(MSG_DESVINCULO_INCIERTO);
    setConfirmarDesvincular(false);
    router.refresh();
  };

  const desvincular = () => {
    // Cada server action con `.catch(sinConexion)` (revisión del 15-oct-2026):
    // sin red o tras un deploy, un `await` desnudo en `startTransition` mandaba
    // Conciliación entera al error boundary.
    startTransition(async () => {
      if (vinculadoAIngreso) {
        const ri = await ligarAbonoIngresoAction(movimiento.id, null).catch(sinConexion);
        if (ri.ok) {
          toast.success("Ingreso desvinculado: el abono vuelve a quedar pendiente");
          setConfirmarDesvincular(false);
        } else if (ri.code === "SIN_CONEXION") desvinculoIncierto();
        else toast.error(ri.error ?? "Error");
        return;
      }
      const r = vinculadoACobro
        ? await linkMovimientoCobroAction(movimiento.id, null).catch(sinConexion)
        : await linkMovimientoAction(movimiento.id, null).catch(sinConexion);
      if (r.code === "SIN_CONEXION") {
        desvinculoIncierto();
        return;
      }
      if (r.ok) {
        toast.success(
          vinculadoASobre
            ? "Cobro de grupo desvinculado"
            : vinculadoACobro
              ? // Cómo quedó cada cobro DESPUÉS (API 0.0.78: `cobros_liberados`).
                (toastDesvinculoCobros(r.data?.cobros_liberados, movimiento) ?? "Cobro desvinculado")
              : conLote
                ? toastDesvinculoGastos(gastosDelLote)
                : "Gasto desvinculado",
        );
        setConfirmarDesvincular(false);
      } else if (conLote) {
        // Un lote: el error en palabras del operador (un 502 no pinta «Bad Gateway»).
        toast.error(mensajeErrorBusquedaGastos(r));
      } else toast.error(r.error ?? "Error");
    });
  };

  // UN COBRO, VARIOS ABONOS (API 0.0.78): el veredicto del API para ESTE
  // abono con el cobro elegido (sin salidas de un clic: este diálogo elige UNO).
  const opcionSeleccionada = seleccionado ? ({ tipo: "COBRO", c: seleccionado } as const) : null;
  const guiaSeleccionado = opcionSeleccionada
    ? guiaAlVincular(opcionSeleccionada, { monto: movimiento.monto, moneda: monedaAbono }, { conAcciones: false, cobrosParciales })
    : null;
  const confirmacionParcial = opcionSeleccionada
    ? textoConfirmarParcial(opcionSeleccionada, { monto: movimiento.monto, moneda: monedaAbono, fecha: movimiento.fecha })
    : null;

  /** Liga del ABONO (el CARGO vive en `VincularGastoDialog`). */
  const vincular = (confirmado = false) => {
    if (!seleccion || !seleccionado) {
      toast.error("Selecciona un cobro o un sobre de grupo");
      return;
    }
    // El API rechazaría este abono con ese cobro (el botón ya está apagado).
    if (guiaSeleccionado?.bloquea) return;
    // Un abono MENOR que lo que falta deja el cobro PARCIAL: se confirma.
    if (!confirmado && guiaSeleccionado?.parcial && confirmacionParcial) {
      setConfirmarParcial(true);
      return;
    }
    startTransition(async () => {
      // Cobro de vuelo → {cobro_id}; sobre de grupo → {cobro_grupo_id}. Con
      // `.catch`: sin respuesta, «No se pudo confirmar si…» (nunca el error boundary).
      const r = await linkMovimientoCobroAction(
        movimiento.id,
        seleccionado.tipo === "SOBRE_GRUPO"
          ? { cobro_grupo_id: seleccionado.cobro_grupo_id }
          : { cobro_id: seleccionado.cobro_id },
      ).catch(sinConexion);
      if (r.ok) {
        toast.success(
          seleccionado.tipo === "SOBRE_GRUPO"
            ? `Cobro de grupo ${folioTexto(seleccionado.grupo_folio)} vinculado`
            : // API 0.0.78: «… queda conciliado PARCIAL (faltan $X)» / «… completo con 2 abonos».
              toastVinculoCobros([{ tipo: "COBRO", c: seleccionado }], r.data),
        );
        cerrarVincular();
      } else if (r.code === "COBRO_DE_GRUPO") {
        // Candado del API: una PARTE de sobre nunca se concilia; se concilia
        // el sobre del grupo (el mensaje del API ya lo dice).
        const d = r.details as { grupo_folio?: number | null } | undefined;
        toast.error(r.error ?? "Este cobro es parte de un sobre de grupo.", {
          description: `Elige el sobre del grupo ${folioTexto(d?.grupo_folio)} en la lista (aparece como «Grupo …»).`,
        });
        cargarCandidatos();
      } else if (r.status === 409 || r.code === "SIN_CONEXION") {
        // Ya conciliado con OTRO movimiento (carrera entre dos personas) o,
        // con el API 0.0.78, una regla del monto (excede, comisión…): el
        // texto del API y la lista se vuelve a pedir (veredictos frescos).
        // Sin respuesta: «No se pudo confirmar si…» y la página se pone al
        // día al cerrar el diálogo.
        const e = mensajeErrorVincularCobros(r);
        toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
        if (e.incierto) refrescarAlCerrarLinkRef.current = true;
        setSeleccion("");
        cargarCandidatos();
      } else {
        toast.error(r.error ?? "Error");
      }
    });
  };

  // Clasificar "sin vuelo": catálogo + creación en el mismo espacio. Se
  // monta en los dos caminos (menú de Ingresos y menú de siempre).
  const dialogoClasificar = (
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
          ) : errorClasificaciones ? (
            <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
              {MSG_CLASIFICACIONES_NO_CARGARON}
            </p>
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
  );

  // «Omitir la conciliación…» (pendiente) y «Deshacer la omisión…» (omitido)
  // de ESTA fila: se montan en los dos caminos (menú de Ingresos y menú de
  // siempre), como `dialogoClasificar`, y solo al abrirse.
  const dialogosOmision = (
    <>
      {openOmitir && (
        <OmitirMovimientosDialog
          movimientos={[movimiento]}
          aliasPorCuenta={cuentas}
          monedaPorCuenta={monedaPorCuenta}
          open
          onOpenChange={setOpenOmitir}
        />
      )}
      {openQuitarOmision && (
        <QuitarOmisionDialog
          movimientos={[movimiento]}
          aliasPorCuenta={cuentas}
          monedaPorCuenta={monedaPorCuenta}
          open
          onOpenChange={setOpenQuitarOmision}
        />
      )}
    </>
  );

  // ABONO sin identificar con el MISMO menú de Ingresos → «Por conciliar»
  // (12-oct-2026): Vincular (y ahí «¿No está el cobro? Regístralo»),
  // anticipo, otro ingreso, traspaso, devolución de un cargo, Sugerir con
  // IA; más «Clasificar» y «Omitir la conciliación…» (14-oct-2026), que son
  // de Conciliación. Fuente única del menú: `AbonoAcciones`. Sin catálogos
  // (la página no los pudo cargar) sigue el menú de siempre, abajo.
  if (abonos && esAbonoPendiente(movimiento)) {
    return (
      <>
        <AbonoAcciones
          abono={abonoPendienteDeMovimiento(movimiento, abonos.cuentas[movimiento.cuenta_bancaria_id])}
          catalogos={abonos.catalogos}
          cuentasIa={abonos.cuentasIa}
          extras={
            <>
              <DropdownMenuItem onClick={abrirClasificar} className="cursor-pointer gap-2">
                <TagIcon className="h-4 w-4" />
                Clasificar (no es de un vuelo)
              </DropdownMenuItem>
              {omitible && (
                <DropdownMenuItem onClick={() => setOpenOmitir(true)} className="cursor-pointer gap-2">
                  <NoSymbolIcon className="h-4 w-4" />
                  {MENU_OMITIR}
                </DropdownMenuItem>
              )}
            </>
          }
        />
        {dialogoClasificar}
        {dialogosOmision}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {vinculadoAIngreso ? (
            <>
              <DropdownMenuItem
                onClick={() => router.push(`/admin/ingresos?ingreso=${movimiento.ingreso_id}`)}
                className="cursor-pointer gap-2"
              >
                <EyeIcon className="h-4 w-4" />
                Ver el ingreso
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmarDesvincular(true)}
                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
              >
                <XMarkIcon className="h-4 w-4" />
                Desvincular ingreso
              </DropdownMenuItem>
            </>
          ) : vinculadoAGastoOCobro ? (
            <DropdownMenuItem
              onClick={() => setConfirmarDesvincular(true)}
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
            >
              <XMarkIcon className="h-4 w-4" />
              {vinculadoASobre
                ? "Desvincular cobro de grupo"
                : vinculadoACobro
                  ? cobrosDelLote >= 2
                    ? menuDesvincularCobros(cobrosDelLote)
                    : abonoConOtros
                      ? MENU_DESVINCULAR_ESTE_ABONO
                      : "Desvincular cobro"
                  : conLote
                    ? menuDesvincularGastos(gastosDelLote)
                    : "Desvincular gasto"}
            </DropdownMenuItem>
          ) : omitido ? (
            // OMITIDO de la conciliación (14-oct-2026): lo ÚNICO que se ofrece
            // es deshacer la omisión (con confirmación). Nunca «Editar
            // clasificación / notas»: la omisión se firma con su motivo.
            <DropdownMenuItem
              onClick={() => setOpenQuitarOmision(true)}
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              {MENU_QUITAR_OMISION}
            </DropdownMenuItem>
          ) : emparejadoPorReverso ? (
            // Pareja cargo ↔ devolución: editar la clasificación de UNO la
            // rompería; lo único que se ofrece es deshacer la pareja.
            <DropdownMenuItem
              onClick={() => setConfirmarQuitarReverso(true)}
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
            >
              <XMarkIcon className="h-4 w-4" />
              {MENU_QUITAR_REVERSO}
            </DropdownMenuItem>
          ) : clasificado ? (
            <>
              <DropdownMenuItem onClick={abrirClasificar} className="cursor-pointer gap-2">
                <TagIcon className="h-4 w-4" />
                Editar clasificación / notas
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={abrirQuitarClasificacion}
                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
              >
                <XMarkIcon className="h-4 w-4" />
                Quitar clasificación
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => abrirVincular()} className="cursor-pointer gap-2">
                <LinkIcon className="h-4 w-4" />
                {esAbono ? "Vincular cobro" : "Vincular gasto"}
              </DropdownMenuItem>
              {/* La IA PROPONE el gasto más probable (descripción del banco,
                  terminación de tarjeta, monto y fecha): abre el mismo
                  diálogo con el candidato preseleccionado. Nunca liga sola. */}
              {!esAbono && (
                <DropdownMenuItem onClick={() => abrirVincular(true)} className="cursor-pointer gap-2">
                  <SparklesIcon className="h-4 w-4" />
                  Sugerir con IA
                </DropdownMenuItem>
              )}
              {/* Cargo devuelto ↔ su devolución (30-sep-2026): se concilian
                  JUNTOS como «Reverso de un cargo» (no son gasto ni ingreso).
                  Solo a un movimiento PENDIENTE de verdad: uno marcado
                  conciliado sin liga visible (dato viejo) respondería 409
                  MOVIMIENTO_YA_LIGADO al buscar candidatos. */}
              {movimiento.conciliado !== true && (
                <DropdownMenuItem onClick={() => setOpenReverso(true)} className="cursor-pointer gap-2">
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                  {esAbono ? MENU_ABONO_DEVOLUCION : MENU_CARGO_DEVUELTO}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={abrirClasificar} className="cursor-pointer gap-2">
                <TagIcon className="h-4 w-4" />
                Clasificar (no es de un vuelo)
              </DropdownMenuItem>
              {/* «Omitir la conciliación…» (14-oct-2026, API 0.0.77): con
                  motivo firmado y la revisión de riesgos del API; se deshace
                  en la pestaña «Omitidos». Solo con un API que ya sabe omitir. */}
              {omitible && (
                <DropdownMenuItem onClick={() => setOpenOmitir(true)} className="cursor-pointer gap-2">
                  <NoSymbolIcon className="h-4 w-4" />
                  {MENU_OMITIR}
                </DropdownMenuItem>
              )}
              {/* Un ABONO sin identificar se resuelve mejor en Ingresos →
                  «Por conciliar»: ahí están el anticipo, otro ingreso, «Es el
                  pago de un vuelo» y la IA de abonos (24-sep-2026). */}
              {esAbono && (
                <DropdownMenuItem
                  // Con el DÍA y la CUENTA del abono: «Por conciliar» abre por
                  // default en el mes corriente y un abono de otro mes no
                  // aparecía (el operador creía que ya no estaba pendiente).
                  onClick={() =>
                    router.push(
                      `/admin/ingresos?${new URLSearchParams({
                        tab: "por-conciliar",
                        desde: movimiento.fecha.slice(0, 10),
                        hasta: movimiento.fecha.slice(0, 10),
                        cuenta: movimiento.cuenta_bancaria_id,
                      }).toString()}`,
                    )
                  }
                  className="cursor-pointer gap-2"
                >
                  <ArrowTrendingUpIcon className="h-4 w-4" />
                  Conciliar en Ingresos
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ABONO ↔ cobro de vuelo o sobre de grupo. El CARGO tiene su propio
          diálogo (`VincularGastoDialog`, uno o varios gastos). */}
      <Dialog
        open={openLink}
        onOpenChange={(o) => {
          if (o) setOpenLink(true);
          else cerrarVincular();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular cobro</DialogTitle>
            <DialogDescription>
              {`Abono de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. Selecciona el cobro de vuelo o el sobre de grupo que corresponde.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <div className="flex items-end justify-between gap-2 flex-wrap">
              <Label className="text-sm font-medium">Cobro o sobre de grupo</Label>
            </div>
            {errorCandidatos ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-400"
              >
                <span>{errorCandidatos}</span>
                <Button type="button" size="sm" variant="outline" className="cursor-pointer" onClick={cargarCandidatos}>
                  Reintentar
                </Button>
              </div>
            ) : candidatos === null ? (
              <p className="text-sm text-muted-foreground">Buscando cobros cercanos…</p>
            ) : (
              <SearchableSelect
                options={opcionesCobros}
                value={seleccion}
                onChange={(v) => {
                  // Otra elección ⇒ la confirmación del parcial ya no vale.
                  setConfirmarParcial(false);
                  setSeleccion(v);
                }}
                placeholder="Buscar por folio, grupo, cliente o monto"
                emptyText="Sin cobros ni sobres candidatos cerca de la fecha del abono"
              />
            )}
            {candidatos !== null && exactos > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {exactos === 1
                  ? "1 candidato cuadra exacto con el abono (aparece primero)."
                  : `${exactos} candidatos cuadran exacto con el abono (aparecen primero).`}
              </p>
            )}
            {/* Resumen de lo elegido: chip del sobre (Grupo G-12 · 7 aviones)
                o del vuelo, monto y si cuadra — para confirmar antes de ligar. */}
            {seleccionado && (
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
                  ) : guiaSeleccionado ? null : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Diferencia ${fmtMoney(seleccionado.dif_monto)} contra el abono
                    </span>
                  )}
                </div>
                {guiaSeleccionado && (
                  // El veredicto del API para ESTE abono (API 0.0.78), a la vista.
                  <p
                    data-guia-al-vincular={guiaSeleccionado.tono}
                    className={
                      guiaSeleccionado.tono === "verde"
                        ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                        : guiaSeleccionado.tono === "ambar"
                          ? "text-xs font-medium text-amber-700 dark:text-amber-300"
                          : "text-xs font-medium text-destructive dark:text-red-400"
                    }
                  >
                    {guiaSeleccionado.texto}
                    {opcionSeleccionada && pistaDialogoLegado(opcionSeleccionada) && ` ${pistaDialogoLegado(opcionSeleccionada)}`}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {[
                    seleccionado.tipo === "SOBRE_GRUPO" ? seleccionado.grupo_nombre : null,
                    seleccionado.cliente,
                    fechasCandidatoCobro(seleccionado),
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
            <p className="text-xs text-muted-foreground">
              Se muestran cobros de vuelo y sobres de grupo por transferencia, HSBC
              link, BillPocket o cheque con fecha cercana (±{VENTANA_DIAS} días) y la
              moneda de la cuenta, ordenados por cercanía de monto y fecha. Los cobros
              con comisión bancaria se comparan por el depósito neto. Las partes por
              avión de un sobre no se ofrecen: se concilia el sobre.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={cerrarVincular} disabled={pending}>
              Cancelar
            </Button>
            {/* Con el veredicto del API (0.0.78) que rechaza este abono, el
                botón se apaga con la razón (excepción deliberada, D18). */}
            <span className="inline-flex" title={guiaSeleccionado?.bloquea ? (guiaSeleccionado.razon ?? undefined) : undefined}>
              <Button className="cursor-pointer" onClick={() => vincular()} disabled={pending || guiaSeleccionado?.bloquea === true}>
                {pending
                  ? "Vinculando…"
                  : guiaSeleccionado?.parcial && opcionSeleccionada
                    ? botonVincularAbono([opcionSeleccionada])
                    : "Vincular"}
              </Button>
            </span>
          </DialogFooter>

          {/* «Vincular como parcial…» del diálogo legado (D3): la MISMA
              confirmación del diálogo de Ingresos; «Cancelar» solo cierra.
              DENTRO del DialogContent (revisión del 15-oct-2026): Base UI la
              anida y Esc cierra SOLO la de arriba (como hermana del Dialog, un
              Esc con el foco fuera de ella cerraba también «Vincular cobro» y
              se perdía lo elegido). */}
          <ConfirmacionVincular
            abierta={confirmarParcial}
            texto={confirmacionParcial}
            onCancelar={() => setConfirmarParcial(false)}
            onConfirmar={() => {
              setConfirmarParcial(false);
              vincular(true);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* CARGO ↔ uno o VARIOS gastos (2-oct-2026): se monta solo al abrir,
          como el de devoluciones (busca candidatos en el servidor). */}
      {openVincularGasto && (
        <VincularGastoDialog
          movimiento={movimiento}
          gastos={gastos}
          conIa={vincularConIa}
          catalogosGasto={catalogosGasto}
          open
          onOpenChange={setOpenVincularGasto}
        />
      )}

      {/* Emparejar con su pareja: se monta solo al abrir (busca candidatos). */}
      {openReverso && (
        <ReversoDialog
          movimiento={{
            id: movimiento.id,
            tipo: movimiento.tipo,
            cuenta_bancaria_id: movimiento.cuenta_bancaria_id,
            fecha: movimiento.fecha,
            monto: movimiento.monto,
            descripcion: movimiento.descripcion,
          }}
          open
          onOpenChange={setOpenReverso}
        />
      )}

      {/* Deshacer la pareja: confirma y avisa que LOS DOS vuelven a pendiente. */}
      <AlertDialog open={confirmarQuitarReverso} onOpenChange={setConfirmarQuitarReverso}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{TITULO_QUITAR_REVERSO}</AlertDialogTitle>
            <AlertDialogDescription>{textoConfirmarQuitarReverso(movimiento)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                quitarReverso();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Quitando…" : BOTON_QUITAR_REVERSO}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dialogoClasificar}
      {dialogosOmision}

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
            {conLote ? (
              // Cargo que paga VARIOS gastos (2-oct-2026): se sueltan todos.
              <>
                <AlertDialogTitle>{tituloDesvincularGastos(gastosDelLote)}</AlertDialogTitle>
                <AlertDialogDescription>
                  {textoConfirmarDesvincularGastos(gastosDelLote)}
                  {notaDesvincularNoBancario && ` ${notaDesvincularNoBancario}`}
                </AlertDialogDescription>
              </>
            ) : (
              <>
                <AlertDialogTitle>
                  {vinculadoAIngreso
                    ? "¿Desvincular este ingreso?"
                    : vinculadoASobre
                      ? "¿Desvincular este cobro de grupo?"
                      : vinculadoACobro
                        ? cobrosDelLote >= 2
                          ? tituloDesvincularCobros(cobrosDelLote)
                          : abonoConOtros
                            ? TITULO_DESVINCULAR_ESTE_ABONO
                            : "¿Desvincular este cobro?"
                        : "¿Desvincular este gasto?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {vinculadoACobro && cobrosDelLote >= 2
                    ? textoConfirmarDesvincularCobros(cobrosDelLote, movimiento.cobros)
                    : null}
                  {/* Lote (API 0.0.78): los cobros con otros abonos quedan parciales. */}
                  {extraDesvincularLote && ` ${extraDesvincularLote}`}
                  {/* El cobro tiene OTROS abonos (D22): sale ESTE abono y el cobro sigue con los demás. */}
                  {textoDesvincularConOtros}
                  {!(vinculadoACobro && cobrosDelLote >= 2) && !textoDesvincularConOtros && (
                    <>
                      El movimiento bancario volverá a quedar pendiente de conciliar y el{" "}
                      {vinculadoAIngreso
                        ? "ingreso"
                        : vinculadoASobre
                          ? "sobre del grupo"
                          : vinculadoACobro
                            ? "cobro"
                            : "gasto"}{" "}
                      quedará libre para vincularse con otro movimiento.
                    </>
                  )}
                  {vinculadoASobre &&
                    " Las partes por avión del sobre dejan de verse como conciliadas."}
                  {/* El ÚNICO abono del cobro (API 0.0.78): «El cobro del vuelo #315 vuelve a «Cobros sin banco».» */}
                  {!textoDesvincularConOtros && extraDesvincularUnico && ` ${extraDesvincularUnico}`}
                  {!vinculadoACobro && !vinculadoAIngreso &&
                    " Si el gasto se pagó en varios cargos, los demás siguen ligados: el gasto queda como pago parcial hasta que lo cubran."}
                  {!vinculadoAIngreso && notaDesvincularNoBancario && ` ${notaDesvincularNoBancario}`}
                </AlertDialogDescription>
              </>
            )}
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
