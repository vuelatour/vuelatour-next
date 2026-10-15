"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  InformationCircleIcon,
  PlusIcon,
  ShoppingCartIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  listCardsOptionsAction,
  type CardOption,
} from "@/app/admin/users/actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  assignVueloGastoAction,
  buscarVuelosCercanosAction,
  getRepartoAction,
  guardarGastoConRepartoAction,
  listAvionesActivosAction,
  reanalizarComprobanteAction,
  saveRepartoAction,
  sugerirAsignacionGastoAction,
  verifyGastoAction,
  type ActionResult,
  type GastoTicketIA,
  type SugerenciaAsignacion,
  type VueloCercano,
} from "@/app/admin/expenses/actions";
import {
  RepartoAvionesEditor,
  RepartoResumen,
} from "@/components/admin/expenses/reparto-aviones-editor";
import { estadoBancoGasto } from "@/lib/admin/conciliacion-estado";
import {
  ARIA_MODO_AVION,
  AVISO_REPARTO_FIJO,
  AYUDA_RECHAZO_POR_REPARTO,
  BOTON_REGRESAR,
  BOTON_REGRESAR_BANNER,
  BOTON_REINTENTAR,
  BOTON_REVISAR,
  ETIQUETA_CAMPO_AVION_MODOS,
  ETIQUETA_MODO_REPARTO,
  ETIQUETA_MODO_SIN_AVION,
  GUARDANDO,
  HINT_AVION_PERSONAL,
  HINT_VUELO_EN_REPARTO,
  NOTA_DINERO_BLOQUEADO,
  OPCION_SIN_AVION_VUELATOUR,
  TEXTO_FALLO_LECTURA_REPARTO,
  TEXTO_LEYENDO_REPARTO,
  TEXTO_RETIRAR_SIN_RESPUESTA,
  TEXTO_SIN_RESPUESTA_GUARDAR,
  TEXTO_VUELO_SIN_RESPUESTA,
  TITULO_MODO_REPARTO,
  TITULO_REGRESAR_REPARTO,
  TOAST_AVISO_MS,
  TOAST_LARGO_MS,
  avisoMatriculaFueraDeReparto,
  avisoRepartoSeQuita,
  ayudaModoUno,
  centavosDe,
  configAvionGasto,
  confirmacionRepartoAlGuardar,
  debePrellenarAvionPorMatricula,
  descripcionVerificarGasto,
  dineroCambia,
  errorQuitarRepartoSinAvion,
  errorRepartoEnPantalla,
  esRechazoPorReparto,
  estadoRepartoInicial,
  etiquetaCampoAvionSinModos,
  filasRepartoEditor,
  hojaDestinoReparto,
  iaConsumidaPorReparto,
  iaRespetaReparto,
  itemsDePartes,
  itemsDeSeleccion,
  lineaCategoriaQuitaReparto,
  lineaTotalPagadoReparto,
  llamarSinLanzar,
  mensajeResultadoGastoReparto,
  mesesTerminados,
  mismoReparto,
  notaCategoriaEntreRepartibles,
  notaIaConReparto,
  notaMontoConReparto,
  notaRepartoMesTerminado,
  partesDeGasto,
  partesDeRespuesta,
  resumenDeRespuesta,
  resumenReparto,
  resumenRepartoTexto,
  seleccionDesdePartes,
  seleccionInicialAlRepartir,
  techoRepartoCents,
  textoConfirmarRegresar,
  textoExitoGastoReparto,
  textoFalloCargaAviones,
  textoQueCambiaAlRepartir,
  textoRegresadoOk,
  textoRegresarError,
  textoRepartoActualizado,
  textoRepartoDescubierto,
  textoRepartoMoneda,
  tituloModoUno,
  type AvionReparto,
  type ConfirmacionReparto,
  type ContextoResultadoReparto,
  type EstadoRepartoDialogo,
  type MensajeResultadoReparto,
  type ModoAvion,
  type ParteReparto,
  type SeleccionReparto,
} from "@/lib/admin/reparto-gasto";
import type { RepartoResponse } from "@/types/expenses";
import { fmtDate, fmtDateTime, todayCancun } from "@/lib/datetime";
import {
  capturadoEnDe,
  llegoAlServidorDistinto,
  origenCapturaLabel,
} from "@/lib/admin/gastos-captura";
import { hintFolioGasto } from "@/lib/admin/gasto-folio";
import {
  fechaGastoAntigua,
  fechaGastoDistancia,
  fechaGastoLegible,
  fechaGastoSospechosa,
} from "@/lib/admin/fecha-gasto";
import { avionPorMatricula } from "@/lib/admin/matricula";
import { tieneDiscrepanciaIa } from "@/lib/admin/notas-gasto";
import {
  ETIQUETA_TIPO_COMBUSTIBLE,
  PLACEHOLDER_TIPO_COMBUSTIBLE,
  TIPOS_COMBUSTIBLE,
  avisoCombustibleDistinto,
  camposCargaParaPatch,
  combustibleDeAeronave,
  eleccionManualCombustible,
  pasoPrellenadoCombustible,
  type AvionCatalogoGasto,
} from "@/lib/admin/combustibles";
import {
  AYUDA_COMISARIATO,
  AYUDA_RECLASIFICAR_COMISION,
  CATEGORIA_COMISARIATO,
  CATEGORIAS_CAPTURA,
  CATEGORIAS_REPARTIBLES,
  HINT_VUELO_COMISION,
  VENTANA_VUELOS_COMISION,
  ayudaComisionVendedor,
  categoriaExigeVueloSiempre,
  categoriaGastoLabel,
  errorVueloObligatorio,
  iaPuedeCambiarCategoria,
  opcionCategoriaGasto,
} from "@/lib/admin/categorias-gasto";
import { CategoriaDestinoHint } from "@/components/admin/expenses/categoria-destino-hint";
import {
  BOTON_CONFIRMAR_BORRAR_TUA,
  BOTON_REVISAR_TUA,
  COLA_CONFIRMAR_BORRAR_TUA,
  ETIQUETA_TUA_INCLUIDA,
  TITULO_CONFIRMAR_BORRAR_TUA,
  apiConTuaIncluida,
  ayudaTuaIncluida,
  categoriaAdmiteTuaIncluida,
  errorTuaIncluida,
  notaTuaMonedaNueva,
  notaTuaVigente,
  placeholderTuaIncluida,
  tuaIncluidaParaPatch,
  tuaLeidaIa,
  tuaQueSeBorra,
  valorFormTuaIncluida,
} from "@/lib/admin/tua-incluida";
import type { GastoVerifyValues } from "@/app/admin/expenses/schema";
import { verificadorNombre, type Gasto } from "@/types/expenses";
import { COMPRA_ESTADO_LABELS, COMPRA_ROL_LABELS } from "@/types/compras";
import { Field } from "@/components/admin/form-field";
import {
  ayudaMedioPago,
  medioPagoAceptadoPorApi,
  opcionesMedioVerificacion,
} from "@/lib/admin/medios-pago";
import {
  AYUDA_COMPROBANTE,
  opcionesComprobante,
} from "@/lib/admin/comprobante-badge";
import { opcionesFacturacionForm } from "@/lib/admin/facturacion-estatus";
import {
  VueloCanceladoHint,
  esVueloCancelado,
  vueloCercanoLabel,
} from "@/components/admin/expenses/vuelo-cancelado-hint";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { uploadGastoComprobante } from "@/lib/storage/gasto-fotos";
import { pedirUrlFirmada } from "@/lib/storage/url-firmada";
import {
  AYUDA_AGREGAR_HOJAS,
  BOTON_AGREGAR_COMPROBANTE,
  BOTON_QUITAR_HOJA,
  ETIQUETA_AGREGAR_HOJAS,
  MAX_HOJAS_COMPROBANTE,
  TEXTO_NUEVA_HOJA,
  TEXTO_QUITAR_HOJA,
  TITULO_HOJAS_COMPROBANTE,
  TITULO_QUITAR_HOJA,
  aceptarArchivosComprobante,
  etiquetaHoja,
  hojasCambiaron,
  hojasDe,
  nombreCorto,
  valorIaConHojas,
} from "@/lib/admin/comprobante-hojas";

// Opciones desde la FUENTE ÚNICA (@/lib/admin/categorias-gasto): orden de
// captura + ATERRIZAJE (solo se reclasifica aquí, tras GAS), etiqueta y
// destino por default en verde. El API exige sin vuelo y sin avión para
// GASOLINA/VISITA/PERSONAL_DUENO (400 con mensaje claro si el gasto los
// tiene: quitarlos primero). FIJO y VISITA son LEGADO: no se ofrecen para
// reclasificar, pero un gasto histórico que las traiga se agrega a sus
// opciones (ver categoriaOptions).
const CATEGORIAS = CATEGORIAS_CAPTURA.flatMap((c) =>
  c === "GAS" ? [c, "ATERRIZAJE"] : [c],
).map(opcionCategoriaGasto);

// Medios de pago: FUENTE ÚNICA en @/lib/admin/medios-pago. Las opciones son
// POR GASTO (`opcionesMedioVerificacion`): los de captura y «Bodega
// (inventario)» SOLO si el gasto ya es de bodega (para no perder su medio al
// verificarlo). El PATCH nunca manda BODEGA: el API no lo acepta y omitirlo
// conserva el guardado (`verifyGastoAction`, verificación del 14-oct-2026).

// Seguimiento de oficina "¿ya lo facturé?" — independiente del comprobante
// que entregó el piloto (semáforo pedido por el cliente, ago 2026; ⚪ No
// requiere factura desde el 14-sep-2026). FUENTE ÚNICA:
// @/lib/admin/facturacion-estatus.
const FACTURACION = opcionesFacturacionForm();

/** Botones «Un avión» / «Repartir entre aviones» (patrón del destino de la
 *  refacción en el alta): `aria-pressed`, manita y deshabilitado sin ella. */
const claseModoAvion = (activo: boolean) =>
  cn(
    "inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    activo ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground",
  );

/** Lo que trae la carga del editor del reparto: aviones activos y, con
 *  reparto guardado, el reparto vigente (null = no se pidió). */
type CargaEditorReparto =
  | {
      ok: true;
      valor: [
        ActionResult<Array<{ id: string; matricula: string; modelo: string }>>,
        ActionResult<RepartoResponse> | null,
      ];
    }
  | { ok: false; error: string };

/** Lectura del reparto de un gasto sin embed (o tras un rechazo del API). */
type LecturaReparto =
  | { ok: true; valor: ActionResult<RepartoResponse> }
  | { ok: false; error: string };

/** Banner del bloque «Avión»: falla parcial, reparto que otra persona
 *  cambió, reparto descubierto… (`data-reparto-aviso`). */
interface AvisoRepartoDialogo {
  codigo: string;
  texto: string;
  tipo: "error" | "aviso";
  /** Con «Regresar el reparto anterior» (lo que había antes de guardar). */
  anterior?: ParteReparto[];
}

interface ExpenseVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: Gasto;
  aircraft: AvionCatalogoGasto[];
  providers: { id: string; nombre: string }[];
  /** URL firmada de la foto del comprobante para validar contra el dato. */
  fotoUrl?: string;
}

export function ExpenseVerifyDialog({
  open,
  onOpenChange,
  gasto,
  aircraft,
  providers,
  fotoUrl,
}: ExpenseVerifyDialogProps) {
  const [pending, startTransition] = useTransition();
  // Candado de fechas (auditoría 29-ago): valores esperando confirmación
  // explícita cuando la oficina CAMBIÓ la fecha a una sospechosa.
  const [confirmarFecha, setConfirmarFecha] = useState<GastoVerifyValues | null>(
    null,
  );
  // «TUA incluida» (revisión del lote 2, 14-oct-2026): la oficina tecleó en
  // el campo durante ESTE diálogo (con moneda nueva, solo entonces viaja la
  // cifra) y los valores esperando confirmar el BORRADO de la TUA de oficina
  // (reclasificar fuera de Operaciones/Aterrizaje/FBO o cambiar la moneda sin
  // reescribirla: el API la limpia; regla del cliente, lo destructivo confirma).
  const [tuaEditada, setTuaEditada] = useState(false);
  const [confirmarTua, setConfirmarTua] = useState<{
    values: GastoVerifyValues;
    texto: string;
  } | null>(null);
  // Sugerencia IA/regla de a qué vuelo pertenece (solo gastos sin avión).
  const [sugerencia, setSugerencia] = useState<SugerenciaAsignacion | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  // Avión PRELLENADO desde la matrícula que la IA leyó en el comprobante
  // (caso Paywise: capturas de oficina donde piloto+fecha da cero
  // candidatos). Solo propone en el form; el humano revisa y guarda.
  const [prefillAvion, setPrefillAvion] = useState<{
    id: string;
    matricula: string;
  } | null>(null);
  // Vuelo elegido (sugerencia aplicada O selección manual). Sin match
  // automático, la oficina lo asigna a mano de esta lista (±15 días).
  const [vueloSel, setVueloSel] = useState<string>(gasto.vuelo_id ?? "");
  const [vuelos, setVuelos] = useState<VueloCercano[]>([]);
  // Reanálisis IA del comprobante guardado (gastos con lectura vieja pegada,
  // p. ej. de antes de la separación TUA/FBO en el prompt).
  const [reanalizando, setReanalizando] = useState(false);
  const [aiRaw, setAiRaw] = useState<GastoTicketIA | null>(null);
  // El usuario LIMPIÓ el avión a mano ("Sin avión"): ni el prellenado por
  // matrícula, ni aplicarIA (Reanalizar), lo re-imponen — sin esto, el avión
  // "volvía solo" al verificar. El chip "Usar este avión" y elegir un vuelo
  // con avión son los caminos de vuelta explícitos. Ref (no state): lo leen
  // closures y el effect del prefill siempre al día, sin re-render ni
  // dependencias extra.
  const avionLimpiado = useRef(false);
  // Tipo de combustible PRELLENADO por el sistema (venía vacío y se llenó con
  // el del avión o la IA): si cambia el avión se vuelve a prellenar. El tipo
  // GUARDADO o elegido a mano manda y, si no es el del avión, se avisa.
  const tipoAuto = useRef(false);
  // ===== Reparto entre aviones DESDE AQUÍ (14-oct-2026, caso STARLINK) =====
  // Todo nace del embed `repartos` de la lista (inicializadores perezosos: el
  // render estático ya pinta el modo, el resumen y las filas) y se reinicia
  // UNA vez por apertura en el efecto de `sesionRef`. Reglas y textos:
  // `lib/admin/reparto-gasto.ts`.
  const [modoAvion, setModoAvion] = useState<ModoAvion>(() =>
    partesDeGasto(gasto).length > 0 ? "REPARTO" : "UNO",
  );
  const [estadoRep, setEstadoRep] = useState<EstadoRepartoDialogo>(() =>
    estadoRepartoInicial(gasto),
  );
  // Las partes GUARDADAS que conoce el diálogo (embed, GET o lo que devolvió
  // un guardado) y lo tecleado en el editor.
  const [repartoBase, setRepartoBase] = useState<ParteReparto[]>(() => partesDeGasto(gasto));
  const [repartoSel, setRepartoSel] = useState<SeleccionReparto>(() =>
    seleccionDesdePartes(partesDeGasto(gasto)),
  );
  // Con reparto guardado: false = resumen de solo lectura; true = editor.
  const [editandoReparto, setEditandoReparto] = useState(false);
  // La PRIMERA vez que se reparte (sin reparto guardado) la selección arranca
  // con el avión del formulario; después se conserva lo tecleado.
  const [repartoIniciado, setRepartoIniciado] = useState(false);
  const [repartoTocado, setRepartoTocado] = useState(false);
  // Aviones ACTIVOS del editor (NUNCA la prop aircraft: trae inactivos y el
  // PUT los rechaza). «Cargando» y «falló» se DERIVAN de la clave.
  const [avionesReparto, setAvionesReparto] = useState<AvionReparto[] | null>(null);
  const [cargaAviones, setCargaAviones] = useState<{ key: string | null; error: boolean }>({
    key: null,
    error: false,
  });
  const [intentoAviones, setIntentoAviones] = useState(0);
  const [intentoRep, setIntentoRep] = useState(0);
  // La relectura viene de un rechazo del API por reparto (R23): si aparece un
  // reparto, se dice con un banner.
  const [lecturaPorRechazo, setLecturaPorRechazo] = useState(false);
  const [avisoReparto, setAvisoReparto] = useState<AvisoRepartoDialogo | null>(null);
  const [confirmarReparto, setConfirmarReparto] = useState<
    (ConfirmacionReparto & { values: GastoVerifyValues }) | null
  >(null);
  // «Sí, guardar» de la confirmación: el cuadro sigue abierto con «Guardando…»
  // mientras dura el guardado y se cierra solo al terminar (derivado).
  const [guardandoReparto, setGuardandoReparto] = useState(false);
  const [confirmarRegresar, setConfirmarRegresar] = useState<ParteReparto[] | null>(null);
  // Sesión = una apertura del diálogo. Un refresh (RefreshOnFocus, «Retirar
  // confirmación», la revalidación de un guardado parcial) entrega un `gasto`
  // NUEVO (mismo dato, otro objeto): el formulario se reinicia UNA vez por
  // apertura (patrón de item-form-dialog) y no borra lo capturado ni reimpone
  // el avión. `sesionN` (estado) y `sesionNRef` (ref) dejan que los efectos
  // del reparto esperen al render que ya trae el estado de la apertura nueva.
  const sesionRef = useRef<string | null>(null);
  const sesionNRef = useRef(0);
  const [sesionN, setSesionN] = useState(0);
  // Prellenado por matrícula y sugerencia de vuelo: a lo más UNA vez por sesión.
  const prefillSesion = useRef<string | null>(null);
  const sugerenciaSesion = useRef<string | null>(null);
  // BASE del formulario (revisión del 14-oct-2026): el gasto con que se abrió
  // ESTA sesión (o lo que devolvió un guardado propio a medias). Los candados
  // «viaja SOLO si se cambió en ESTE diálogo» —fecha, facturación, TUA, tipo/
  // lugar/hora de la carga, hojas y la autocorrección R14— comparan contra
  // ella y NUNCA contra el `gasto` VIVO: el formulario conserva lo de la
  // apertura y un refresh (RefreshOnFocus, una revalidación) trae lo que otro
  // corrigió; compararlo con el vivo tomaba ese cambio como del usuario y lo
  // REVERTÍA en silencio (la fecha que corrigió Conciliación, la factura que
  // amarró el trigger, la hoja de otra sesión…). Se lee solo en manejadores.
  const baseFormRef = useRef<Gasto>(gasto);
  // Botones de modo y bloque «Avión»: a dónde va el foco cuando la acción del
  // usuario desmonta el botón que pulsó (Base UI lo regresaba al contenedor
  // del diálogo, arriba del formulario).
  const botonUnoRef = useRef<HTMLButtonElement>(null);
  const botonRepartoRef = useRef<HTMLButtonElement>(null);
  const bloqueAvionRef = useRef<HTMLDivElement>(null);
  // Clave de la última carga de aviones pedida (no se repite al cambiar de modo).
  const avionesClaveRef = useRef<string | null>(null);
  const idAvion = useId();
  const idReparto = useId();
  // Sello de confirmación del panel: retirarlo pide confirmación breve
  // (regla de la casa para acciones que quitan algo) y se oculta optimista
  // mientras la revalidación refresca la fila.
  const [openRetirar, setOpenRetirar] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [selloRetirado, setSelloRetirado] = useState(false);
  // Tarjetas del catálogo para "con cuál se pagó" (solo medio TARJETA_CORP).
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  // Hojas 2..N del comprobante (12-oct-2026): las GUARDADAS (paths de
  // `valor_ia_extraido.fotos_adicionales`), las que se agregan aquí (se
  // suben al guardar) y las URLs firmadas de las guardadas, pedidas al abrir
  // (la página solo firma la hoja principal). Quitar una guardada confirma.
  const [hojas, setHojas] = useState<string[]>(() => hojasDe(gasto));
  const [hojasNuevas, setHojasNuevas] = useState<File[]>([]);
  const [urlsHojas, setUrlsHojas] = useState<Record<string, string>>({});
  const [hojaAQuitar, setHojaAQuitar] = useState<string | null>(null);
  const hojasRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const faltan = hojas.filter((p) => !urlsHojas[p]);
    if (faltan.length === 0) return;
    let cancel = false;
    void Promise.all(
      faltan.map((p) => pedirUrlFirmada("gasto-fotos", p).then((u) => [p, u] as const)),
    ).then((pares) => {
      if (cancel) return;
      const nuevas: Record<string, string> = {};
      for (const [p, u] of pares) if (u) nuevas[p] = u;
      if (Object.keys(nuevas).length > 0) setUrlsHojas((prev) => ({ ...prev, ...nuevas }));
    });
    return () => {
      cancel = true;
    };
  }, [open, hojas, urlsHojas]);
  // Numeración: la hoja principal es la 1 (si existe); luego las guardadas y
  // las nuevas. Sin principal, la primera que se agregue pasará a serlo.
  const primeraHoja = gasto.foto_url ? 2 : 1;
  const totalHojas = (gasto.foto_url ? 1 : 0) + hojas.length + hojasNuevas.length;
  const agregarHojas = (archivos: File[]) => {
    if (archivos.length === 0) return;
    const v = aceptarArchivosComprobante(archivos, totalHojas);
    if (!v.ok) toast.error(v.mensaje);
    if (v.archivos.length > 0) setHojasNuevas((prev) => [...prev, ...v.archivos]);
  };
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void listCardsOptionsAction().then((res) => {
      if (!cancel && res.ok && res.data) setCardOptions(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open]);

  const { handleSubmit, reset, watch, setValue, getValues, register } =
    useForm<GastoVerifyValues>({
      defaultValues: defaults(gasto),
    });

  // Categorías LEGADO (FIJO/VISITA): ya no se ofrecen para capturas nuevas,
  // pero un gasto histórico que las traiga debe pintarse con su etiqueta y
  // poder guardarse sin cambiar de categoría — se agrega la suya a la lista.
  const categoriaOptions = useMemo(
    () =>
      CATEGORIAS.some((c) => c.value === gasto.categoria)
        ? CATEGORIAS
        : [
            ...CATEGORIAS,
            opcionCategoriaGasto(gasto.categoria),
          ],
    [gasto.categoria],
  );

  // Reinicio UNA vez por apertura (14-oct-2026): con `[open, gasto]` a
  // secas, cualquier refresh (objeto `gasto` nuevo) borraba lo capturado y
  // el prellenado reimponía el avión de la IA (caso STARLINK).
  useEffect(() => {
    if (!open) sesionRef.current = null;
    if (open && sesionRef.current !== gasto.id) {
      sesionRef.current = gasto.id;
      baseFormRef.current = gasto;
      reset(defaults(gasto));
      setAiRaw(null);
      setSelloRetirado(false);
      setTuaEditada(false);
      // Hojas del comprobante: las guardadas de ESTE gasto, sin pendientes.
      setHojas(hojasDe(gasto));
      setHojasNuevas([]);
      // Reparto: lo que dice el embed de la lista, sin nada de la apertura
      // anterior (banners, confirmaciones, aviones, prellenado).
      const partes = partesDeGasto(gasto);
      setRepartoBase(partes);
      setRepartoSel(seleccionDesdePartes(partes));
      setEstadoRep(estadoRepartoInicial(gasto));
      setModoAvion(partes.length > 0 ? "REPARTO" : "UNO");
      setEditandoReparto(false);
      setRepartoIniciado(false);
      setRepartoTocado(false);
      setAvionesReparto(null);
      setLecturaPorRechazo(false);
      setAvisoReparto(null);
      setConfirmarReparto(null);
      setGuardandoReparto(false);
      setConfirmarRegresar(null);
      setSugerencia(null);
      setSugiriendo(false);
      setPrefillAvion(null);
      // Abrió repartido: la matrícula de la IA y la sugerencia de vuelo NO
      // corren en esta apertura, ni aunque un guardado a medias deje el gasto
      // sin reparto (R9/R10, revisión del 14-oct-2026).
      const iaConsumida = iaConsumidaPorReparto(false, partes) ? gasto.id : null;
      prefillSesion.current = iaConsumida;
      sugerenciaSesion.current = iaConsumida;
      avionesClaveRef.current = null;
      sesionNRef.current += 1;
      setSesionN(sesionNRef.current);
      // reset() no limpia refs: sin esto, el veto a la IA se heredaría a
      // la siguiente apertura del diálogo (u otro gasto).
      avionLimpiado.current = false;
      tipoAuto.current = false;
    }
  }, [open, gasto, reset]);

  /** Retira el sello de confirmación (PATCH verificado:false) sin tocar el
   *  resto del formulario; guardar después vuelve a confirmar. */
  const retirarConfirmacion = () => {
    setRetirando(true);
    verifyGastoAction(gasto.id, { verificado: false })
      .then((r) => {
        if (r.ok) {
          setSelloRetirado(true);
          toast.success(
            "Confirmación retirada. Al guardar se vuelve a confirmar.",
          );
        } else {
          toast.error(r.error ?? "No se pudo retirar la confirmación");
        }
      })
      // Un fallo de transporte (red, deploy) se dice; nunca una promesa
      // rechazada sin manejar que cierra el cuadro en silencio.
      .catch(() => toast.error(TEXTO_RETIRAR_SIN_RESPUESTA, { duration: TOAST_LARGO_MS }))
      .finally(() => {
        setRetirando(false);
        setOpenRetirar(false);
      });
  };

  // Vuelo elegido = el del gasto al abrir (o al cambiar de gasto).
  useEffect(() => {
    if (!open) return;
    setVueloSel(gasto.vuelo_id ?? "");
  }, [open, gasto.id, gasto.vuelo_id]);

  // ===== Reparto: qué ofrece el bloque «Avión» (R3–R5) =====
  const categoriaForm = watch("categoria");
  const repartoGuardado = repartoBase.length > 0;
  const cfg = configAvionGasto({ categoria: categoriaForm, vueloSel, repartoGuardado });
  const leyendoReparto = estadoRep === "POR_CONFIRMAR";
  // Modo EFECTIVO: «Repartir» solo cuenta con categoría repartible y sin
  // vuelo (si no, el modo guardado en memoria vuelve al regresar a una).
  const enReparto = modoAvion === "REPARTO" && cfg.repartoPermitido;
  const quitaReparto = repartoGuardado && !enReparto;
  const editorRepartoVisible = enReparto && (!repartoGuardado || editandoReparto);
  // Las cargas se DERIVAN de su clave (gasto + apertura + intento).
  const claveLectura = open && leyendoReparto ? `${gasto.id}#${sesionN}#${intentoRep}` : null;
  const claveEditor =
    open && editorRepartoVisible ? `${gasto.id}#${sesionN}#${intentoAviones}` : null;
  const cargandoAviones = claveEditor !== null && cargaAviones.key !== claveEditor;
  const falloAviones =
    claveEditor !== null && cargaAviones.key === claveEditor && cargaAviones.error;

  // Lectura del reparto de un gasto repartible SIN embed (R1) o tras un
  // rechazo del API por reparto (R23). setState solo en el callback.
  const alLeerReparto = useEffectEvent((r: LecturaReparto) => {
    if (!r.ok || !r.valor.ok || !r.valor.data) {
      setEstadoRep("LECTURA_FALLIDA");
      setLecturaPorRechazo(false);
      return;
    }
    const partes = partesDeRespuesta(r.valor.data);
    marcarRepartoConocido(partes);
    setRepartoBase(partes);
    setEstadoRep(partes.length > 0 ? "REPARTIDO" : "SIN_REPARTO");
    if (partes.length > 0) {
      if (!repartoTocado) setRepartoSel(seleccionDesdePartes(partes));
      setModoAvion("REPARTO");
      if (lecturaPorRechazo) {
        setAvisoReparto({
          codigo: "REPARTO_DESCUBIERTO",
          texto: textoRepartoDescubierto(resumenDeRespuesta(r.valor.data, gasto.moneda)),
          tipo: "aviso",
        });
      }
    }
    setLecturaPorRechazo(false);
  });
  useEffect(() => {
    if (!claveLectura || sesionN !== sesionNRef.current) return;
    const sesion = sesionN;
    void llamarSinLanzar(() => getRepartoAction(gasto.id)).then((r) => {
      if (sesionNRef.current === sesion) alLeerReparto(r);
    });
  }, [claveLectura, sesionN, gasto.id]);

  // Carga del editor (R7): los aviones activos y, con reparto guardado, el
  // reparto vigente — SOLO al mostrar el editor, jamás al abrir el diálogo.
  // Si el reparto cambió y no se ha tocado nada, base y selección se
  // reemplazan en silencio; si ya se tocó, solo la base (y se dice).
  const alCargarEditor = useEffectEvent((clave: string, r: CargaEditorReparto) => {
    const aviones = r.ok ? r.valor[0] : null;
    if (!aviones || !aviones.ok || !aviones.data) {
      setCargaAviones({ key: clave, error: true });
      return;
    }
    setAvionesReparto(
      aviones.data.map((a) => ({ id: a.id, matricula: a.matricula, modelo: a.modelo })),
    );
    const vigente = r.ok ? r.valor[1] : null;
    if (vigente && vigente.ok && vigente.data) {
      const actual = partesDeRespuesta(vigente.data);
      marcarRepartoConocido(actual);
      if (!mismoReparto(itemsDePartes(actual), itemsDePartes(repartoBase))) {
        setRepartoBase(actual);
        setEstadoRep(actual.length > 0 ? "REPARTIDO" : "SIN_REPARTO");
        if (repartoTocado) {
          setAvisoReparto({
            codigo: "REPARTO_ACTUALIZADO",
            texto: textoRepartoActualizado(resumenDeRespuesta(vigente.data, gasto.moneda)),
            tipo: "aviso",
          });
        } else {
          setRepartoSel(seleccionDesdePartes(actual));
        }
      }
    }
    setCargaAviones({ key: clave, error: false });
  });
  useEffect(() => {
    if (!claveEditor || sesionN !== sesionNRef.current) return;
    // Cambiar de modo y volver no vuelve a pedir lo mismo.
    if (avionesClaveRef.current === claveEditor) return;
    avionesClaveRef.current = claveEditor;
    const sesion = sesionN;
    const conBase = repartoGuardado;
    void llamarSinLanzar(() =>
      Promise.all([
        listAvionesActivosAction(),
        conBase ? getRepartoAction(gasto.id) : Promise.resolve(null),
      ]),
    ).then((r) => {
      if (sesionNRef.current === sesion) alCargarEditor(claveEditor, r);
    });
  }, [claveEditor, sesionN, repartoGuardado, gasto.id]);

  // Las dos «Comisión del vendedor» — «(VuelaTour)» (28-sep-2026) y
  // «(avión)» (13-oct-2026): SIEMPRE con vuelo (400 GASTO_REQUIERE_VUELO del
  // API para todos los roles) y se pagan días o semanas DESPUÉS del vuelo ⇒
  // la lista trae 90 días hacia atrás. El effect de arriba NO se re-dispara
  // al cambiar la categoría (reiniciaría el vuelo elegido): solo la lista se
  // recarga con la ventana ancha. El cuadro de ayuda dice quién la paga.
  const esComision = categoriaExigeVueloSiempre(watch("categoria"));
  const ayudaComision = ayudaComisionVendedor(watch("categoria"));

  // Vuelos alrededor de la fecha del gasto, para asignar/corregir a mano.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    buscarVuelosCercanosAction(
      gasto.fecha_gasto,
      esComision ? VENTANA_VUELOS_COMISION : undefined,
    ).then((res) => {
      if (!cancel && res.ok && res.data) setVuelos(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open, gasto.id, gasto.vuelo_id, gasto.fecha_gasto, esComision]);

  // Al abrir un gasto SIN avión: PRIMERO la matrícula que la IA leyó en el
  // comprobante (capturas de oficina: piloto+fecha da cero candidatos) y
  // después el match probable de vuelo (piloto + fecha ±3d; IA si hay
  // varios). Best-effort: si nada cruza, la asignación sigue manual. Desde
  // el 14-oct-2026 cada uno corre a lo más UNA vez por apertura y NUNCA en un
  // gasto repartido, por confirmar o con la lectura fallida (caso STARLINK:
  // reimponía N990GG sobre un gasto repartido entre tres aviones).
  useEffect(() => {
    // Espera al render que ya trae el estado de ESTA apertura.
    if (!open || sesionN !== sesionNRef.current) return;
    // Prellenado por matrícula: corre DESPUÉS del reset (el efecto del reset
    // está declarado antes). Jamás a categorías sin avión (el guardado los
    // desliga), jamás si el usuario limpió el avión a mano ("Sin avión") y
    // jamás dos veces en la misma apertura: un refresh ya no lo re-impone.
    const mIa = (gasto.valor_ia_extraido as { matricula?: unknown } | null)
      ?.matricula;
    if (
      gasto.aeronave_id ||
      typeof mIa !== "string" ||
      !debePrellenarAvionPorMatricula({
        estadoRep,
        modoAvion,
        matriculaIa: mIa,
        categoria: getValues("categoria"),
        vetado: avionLimpiado.current,
        avionActual: getValues("aeronave_id"),
        yaPrellenado: prefillSesion.current === gasto.id,
      })
    ) {
      return;
    }
    prefillSesion.current = gasto.id;
    const avion = avionPorMatricula(aircraft, mIa) ?? null;
    if (avion) setValue("aeronave_id", avion.id);
    setPrefillAvion(avion);
  }, [
    open,
    sesionN,
    estadoRep,
    modoAvion,
    gasto.id,
    gasto.aeronave_id,
    gasto.valor_ia_extraido,
    aircraft,
    getValues,
    setValue,
  ]);

  // Sugerencia de vuelo (R10): a lo más UNA vez por apertura, con las mismas
  // condiciones (sin reparto, «Un avión», sin avión guardado). Un throw de la
  // server action no llega al error boundary.
  useEffect(() => {
    if (!open || sesionN !== sesionNRef.current) return;
    if (
      sugerenciaSesion.current === gasto.id ||
      gasto.aeronave_id ||
      estadoRep !== "SIN_REPARTO" ||
      modoAvion !== "UNO"
    ) {
      return;
    }
    sugerenciaSesion.current = gasto.id;
    const sesion = sesionN;
    setSugiriendo(true);
    void llamarSinLanzar(() => sugerirAsignacionGastoAction(gasto.id)).then((r) => {
      if (sesionNRef.current !== sesion) return;
      setSugerencia(r.ok && r.valor.ok ? (r.valor.data ?? null) : null);
      setSugiriendo(false);
    });
  }, [open, sesionN, estadoRep, modoAvion, gasto.id, gasto.aeronave_id]);

  // ===== Combustible del avión (5-oct-2026, caso XB-PEV con «Turbosina»):
  // GAS con avión y tipo VACÍO ⇒ el del avión (la IA de Reanalizar solo llena
  // si el avión no dice nada). Declarado DESPUÉS del reset y del prellenado
  // por matrícula: lee getValues(), fresco tras ambos.
  const categoriaSel = watch("categoria");
  const avionSel = watch("aeronave_id");
  const tipoSel = watch("tipo_combustible");
  const tipoIa = aiRaw?.tipo_combustible ?? null;
  useEffect(() => {
    if (!open) return;
    const actual = getValues("tipo_combustible");
    const paso = pasoPrellenadoCombustible({
      categoria: getValues("categoria"),
      delAvion: combustibleDeAeronave(aircraft, getValues("aeronave_id")),
      actual,
      auto: tipoAuto.current,
      ia: tipoIa,
    });
    tipoAuto.current = paso.auto;
    if (paso.valor !== actual) setValue("tipo_combustible", paso.valor);
  }, [open, categoriaSel, avionSel, tipoSel, tipoIa, aircraft, getValues, setValue]);

  // Tipo distinto al del avión: aviso ámbar (no candado). El API corrige al
  // guardar y lo marca para revisión aunque el tipo no viaje: la categoría
  // SIEMPRE va en el PATCH y con ella reaplica su regla (`camposCargaParaPatch`).
  const delAvionSel = combustibleDeAeronave(aircraft, avionSel);
  const avisoCombustible =
    categoriaSel === "GAS"
      ? avisoCombustibleDistinto(
          aircraft.find((a) => a.id === avionSel)?.matricula,
          delAvionSel,
          tipoSel,
        )
      : null;

  // ===== Reparto: derivados del render (R5, R8, R15–R19) =====
  // Sumas, resto y «VuelaTour absorbe» son GUÍA: la regla Σ ≤ monto y el
  // remanente los decide el API.
  const monedaForm = watch("moneda") || gasto.moneda;
  // Un reparto guardado está en la moneda GUARDADA; uno nuevo, en la del formulario.
  const monedaReparto = repartoGuardado ? gasto.moneda : monedaForm;
  const techoCents = techoRepartoCents({
    ticket: watch("monto"),
    propina: watch("propina"),
    montoGuardado: gasto.monto,
  });
  // Mientras los aviones no llegan (o si fallan), las filas son las partes guardadas.
  const filasReparto = filasRepartoEditor(
    !cargandoAviones && !falloAviones ? avionesReparto : null,
    repartoBase,
  );
  const itemsNuevo = itemsDeSeleccion(filasReparto, repartoSel);
  const resumenRep = resumenReparto(filasReparto, repartoSel, techoCents);
  const cambiaReparto = enReparto && !mismoReparto(itemsDePartes(repartoBase), itemsNuevo);
  const matriculaDe = (id: string | null | undefined): string | null =>
    id ? (aircraft.find((a) => a.id === id)?.matricula ?? null) : null;
  const matriculaGuardada = gasto.aeronave_id ? (matriculaDe(gasto.aeronave_id) ?? "¿?") : null;
  const nuevoPartes: ParteReparto[] = itemsNuevo.map((i) => ({
    aeronave_id: i.aeronave_id,
    matricula: filasReparto.find((f) => f.id === i.aeronave_id)?.matricula ?? null,
    monto: i.monto,
  }));
  // Por qué se quitaría: la categoría ya no se reparte, o se eligió «Un avión».
  const motivoQuitar = !quitaReparto
    ? null
    : CATEGORIAS_REPARTIBLES.has(categoriaForm)
      ? ("MODO" as const)
      : ("CATEGORIA" as const);
  const resumenBaseTexto = resumenRepartoTexto(repartoBase, gasto.moneda);
  // Conciliado (R18, fuente única `estadoBancoGasto`): el API no acepta otro
  // monto, moneda ni medio (409 GASTO_CONCILIADO).
  const dineroBloqueado = ["CONCILIADO", "PARCIAL"].includes(estadoBancoGasto(gasto).value);
  const notaDineroBloqueado =
    cfg.conModos &&
    dineroBloqueado &&
    dineroCambia(
      { monto: techoCents / 100, moneda: monedaForm, medio_pago: watch("medio_pago") },
      gasto,
    );
  /** La UNA confirmación del reparto para estos valores (null = no hace falta). */
  const confirmacionDe = (
    values: Pick<GastoVerifyValues, "categoria" | "aeronave_id" | "fecha_gasto">,
  ): ConfirmacionReparto | null =>
    quitaReparto || cambiaReparto
      ? confirmacionRepartoAlGuardar({
          base: repartoBase,
          nuevo: quitaReparto ? [] : nuevoPartes,
          quita: quitaReparto,
          motivoQuitar,
          categoriaFinal: values.categoria,
          avionFinal: quitaReparto ? matriculaDe(values.aeronave_id) : null,
          tieneVuelo: !!vueloSel,
          avionGuardado: matriculaGuardada,
          moneda: monedaReparto,
          fechas: [gasto.fecha_gasto, values.fecha_gasto],
          hoy: todayCancun(),
        })
      : null;
  // R19: un cambio NO destructivo en un mes ya terminado se dice en línea.
  const notaMesReparto =
    cambiaReparto &&
    !confirmacionDe({
      categoria: categoriaForm,
      aeronave_id: watch("aeronave_id"),
      fecha_gasto: watch("fecha_gasto"),
    })
      ? notaRepartoMesTerminado(
          mesesTerminados([gasto.fecha_gasto, watch("fecha_gasto")], todayCancun()),
        )
      : null;
  // R17: el monto cambia con el reparto guardado intacto.
  const notaMonto =
    enReparto && repartoGuardado && !cambiaReparto && techoCents !== centavosDe(gasto.monto)
      ? notaMontoConReparto({ techoCents, sumaCents: resumenRep.sumaCents, moneda: monedaReparto })
      : null;
  // R15: reclasificar ENTRE dos repartibles con reparto guardado.
  const notaCategoriaReparto =
    enReparto && repartoGuardado
      ? notaCategoriaEntreRepartibles({ antes: gasto.categoria, despues: categoriaForm })
      : null;
  // R16: la moneda no cambia con un reparto que se conserva.
  const avisoMonedaReparto =
    enReparto && repartoGuardado && monedaForm !== gasto.moneda
      ? textoRepartoMoneda(gasto.moneda)
      : null;
  const ayudaUno =
    cfg.conModos && !enReparto
      ? ayudaModoUno({ categoria: categoriaForm, matricula: matriculaDe(watch("aeronave_id")) })
      : null;

  /** La sesión supo de un reparto: la IA ya no prellena ni sugiere vuelo en
   *  esta apertura (aunque un guardado a medias lo quite después). */
  function marcarRepartoConocido(partes: readonly unknown[]) {
    if (!iaConsumidaPorReparto(false, partes)) return;
    prefillSesion.current = gasto.id;
    sugerenciaSesion.current = gasto.id;
  }

  /** Base conocida del reparto (y el estado que la acompaña). */
  const fijarBase = (partes: ParteReparto[]) => {
    marcarRepartoConocido(partes);
    setRepartoBase(partes);
    setEstadoRep(partes.length > 0 ? "REPARTIDO" : "SIN_REPARTO");
  };

  /** Foco tras una acción del usuario que desmonta el botón pulsado (en el
   *  siguiente tick: el elemento destino ya existe). Nunca en un efecto. */
  const enfocarDespues = (destino: () => HTMLElement | null | undefined) =>
    window.setTimeout(() => destino()?.focus(), 0);

  /** «Un avión» (o «Sin avión»): sobre un gasto repartido, el guardado quita
   *  el reparto (se confirma). Nada se escribe aquí. */
  const elegirUno = () => setModoAvion("UNO");

  /** «Quitar el reparto» del resumen: el resumen se desmonta; el foco va a
   *  «Un avión» (el modo que quedó elegido). */
  const quitarRepartoDelResumen = () => {
    elegirUno();
    enfocarDespues(() => botonUnoRef.current);
  };

  /** «Editar reparto»: el foco entra al editor (primera casilla). */
  const abrirEditorReparto = () => {
    setEditandoReparto(true);
    enfocarDespues(
      () =>
        bloqueAvionRef.current?.querySelector<HTMLElement>(
          '[data-reparto-editor] input[type="checkbox"]:not(:disabled)',
        ) ??
        bloqueAvionRef.current?.querySelector<HTMLElement>("[data-reparto-editor] button:not(:disabled)"),
    );
  };

  /** «Reintentar» de los aviones: el foco queda en «Repartir entre aviones»
   *  (no se desmonta mientras carga ni al terminar). */
  const reintentarAviones = () => {
    setIntentoAviones((n) => n + 1);
    enfocarDespues(() => botonRepartoRef.current);
  };

  /** «Repartir entre aviones»: la PRIMERA vez sin reparto guardado, la
   *  selección arranca con el avión del formulario y el total pagado. */
  const elegirReparto = () => {
    if (!cfg.repartoPermitido || leyendoReparto) return;
    setModoAvion("REPARTO");
    if (!repartoGuardado) {
      setEditandoReparto(true);
      if (!repartoIniciado) {
        setRepartoSel(seleccionInicialAlRepartir(getValues("aeronave_id") || null, techoCents));
        setRepartoIniciado(true);
      }
    }
  };

  const cambiarSeleccionReparto = (s: SeleccionReparto) => {
    setRepartoSel(s);
    setRepartoTocado(true);
  };

  /** Avión elegido en «Un avión». Limpiarlo A MANO veta a la IA (prellenado
   *  y Reanalizar no lo re-imponen); elegir uno levanta el veto. Al guardar,
   *  el limpiado se desliga con null explícito. */
  const elegirAvion = (v: string) => {
    setValue("aeronave_id", v);
    avionLimpiado.current = v === "";
  };

  /** Releer el reparto (R1 «Reintentar» y R23 tras un rechazo del API). */
  const releerReparto = (porRechazo: boolean) => {
    setLecturaPorRechazo(porRechazo);
    setEstadoRep("POR_CONFIRMAR");
    setIntentoRep((n) => n + 1);
  };

  /** Toast + banner del resultado de un guardado con reparto. */
  const avisarResultado = (
    m: MensajeResultadoReparto,
    codigo: string,
    anterior: ParteReparto[],
  ) => {
    const opciones = m.toastMs ? { duration: m.toastMs } : undefined;
    if (m.tipo === "exito") toast.success(m.texto);
    else if (m.tipo === "aviso") toast.warning(m.texto, opciones);
    else toast.error(m.texto, opciones);
    if (m.banner) {
      setAvisoReparto({
        codigo,
        texto: m.texto,
        tipo: m.tipo === "aviso" ? "aviso" : "error",
        ...(m.conRegresar ? { anterior } : {}),
      });
    }
  };

  /** «Regresar el reparto anterior» (ya confirmado): PUT con lo de antes. */
  const regresarReparto = (anterior: ParteReparto[]) => {
    // La confirmación del guardado anterior no se vuelve a pintar.
    setConfirmarReparto(null);
    setGuardandoReparto(false);
    startTransition(async () => {
      const r = await llamarSinLanzar(() => saveRepartoAction(gasto.id, itemsDePartes(anterior)));
      if (r.ok && r.valor.ok && r.valor.data) {
        const partes = partesDeRespuesta(r.valor.data);
        fijarBase(partes);
        setRepartoSel(seleccionDesdePartes(partes));
        setRepartoTocado(false);
        setEditandoReparto(false);
        setModoAvion(partes.length > 0 ? "REPARTO" : "UNO");
        setAvisoReparto(null);
        toast.success(textoRegresadoOk(resumenDeRespuesta(r.valor.data, gasto.moneda)));
        return;
      }
      toast.error(textoRegresarError(r.ok ? (r.valor.error ?? "") : r.error));
      // Se relee para decir cómo quedó de verdad.
      const rel = await llamarSinLanzar(() => getRepartoAction(gasto.id));
      if (rel.ok && rel.valor.ok && rel.valor.data) fijarBase(partesDeRespuesta(rel.valor.data));
    });
  };

  /**
   * Quita el desglose VIEJO de las notas conservando todo lo demás
   * (⚠ discrepancias, notas humanas posteriores): el bloque "Desglose:"
   * contiguo y las líneas "X - $N MXN" dentro de "[IA al sincronizar]".
   */
  const limpiarDesgloseViejo = (notas: string): string =>
    notas
      .replace(/(^|\n)Desglose:\n(?:[^\n]+\n?)*/g, "$1")
      .replace(/\[IA al sincronizar\]\n((?:[^\n]+\n?)*)/g, (_m, cuerpo: string) => {
        const resto = (cuerpo as string)
          .split("\n")
          .filter((l) => l.trim() !== "" && !/ - \$[\d.,]+ [A-Z]{3}\s*$/.test(l));
        return resto.length > 0 ? `[IA al sincronizar]\n${resto.join("\n")}\n` : "";
      })
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  /** Prellena el form con la lectura fresca; el humano revisa y guarda. */
  const aplicarIA = (ai: GastoTicketIA) => {
    const llenado: string[] = [];
    // Con reparto (guardado o armándose) la IA no aplica la moneda, una
    // categoría que no se reparte ni el avión (R11); el toast dice qué no.
    // El monto sí (si queda bajo la suma, la línea sale en rojo y el guardado
    // se frena antes de la red).
    const conReparto = enReparto || repartoGuardado;
    const noAplicado: { categoria?: string; moneda?: string; matricula?: string } = {};
    if (ai.monto != null && ai.monto > 0) {
      // ai.monto = TOTAL del ticket; si la IA leyó propina impresa se separa
      // (al guardar se recompone el total, que es lo que llega al banco).
      const propinaIA =
        ai.propina != null && ai.propina > 0 && ai.propina < ai.monto
          ? ai.propina
          : null;
      if (propinaIA != null) {
        setValue("monto", String(Math.round((ai.monto - propinaIA) * 100) / 100));
        setValue("propina", String(propinaIA));
        llenado.push(`$${ai.monto} (incl. propina $${propinaIA})`);
      } else {
        // La propina del form se conserva: la IA no la ve en el ticket pero
        // pudo capturarse de la terminal (borrarla bajaría el total que se
        // concilia con el banco).
        setValue("monto", String(ai.monto));
        llenado.push(`$${ai.monto}`);
      }
    }
    if (
      (ai.moneda === "MXN" || ai.moneda === "USD") &&
      watch("moneda") !== ai.moneda
    ) {
      if (conReparto) {
        noAplicado.moneda = ai.moneda;
      } else {
        setValue("moneda", ai.moneda);
        llenado.push(`moneda→${ai.moneda}`);
      }
    }
    if (ai.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ai.fecha)) {
      setValue("fecha_gasto", ai.fecha);
      llenado.push(ai.fecha);
    }
    // La IA no pisa ninguna de las dos «Comisión del vendedor» (no sabe
    // sugerirlas ni decide quién paga).
    if (
      ai.categoria_sugerida &&
      CATEGORIAS.some((c) => c.value === ai.categoria_sugerida) &&
      iaPuedeCambiarCategoria(watch("categoria"), ai.categoria_sugerida)
    ) {
      // Un gasto repartido no recibe una categoría que no se reparte.
      if (iaRespetaReparto(ai.categoria_sugerida, conReparto)) {
        setValue("categoria", ai.categoria_sugerida);
        llenado.push(ai.categoria_sugerida);
      } else if (ai.categoria_sugerida !== watch("categoria")) {
        noAplicado.categoria = ai.categoria_sugerida;
      }
    }
    if (ai.litros != null && ai.litros > 0) {
      setValue("litros", String(ai.litros));
      llenado.push(`${ai.litros} L`);
    }
    // Medio de pago: EFECTIVO→TARJETA sí se corrige (voucher engrapado),
    // pero PERSONAL_*/BODEGA nunca — la IA no distingue una tarjeta personal
    // de la corporativa, y BODEGA es un cargo contable sin ticket bancario.
    const medioActual = watch("medio_pago");
    if (
      ai.medio_pago &&
      medioPagoAceptadoPorApi(ai.medio_pago) &&
      medioActual !== ai.medio_pago &&
      !["PERSONAL_PABLO", "PERSONAL_ALE", "BODEGA"].includes(medioActual ?? "")
    ) {
      setValue("medio_pago", ai.medio_pago);
      llenado.push(`medio→${ai.medio_pago}`);
    }
    // El folio es la llave anti-duplicados: solo se llena si estaba vacío.
    if (ai.folio && !watch("folio_ticket")) {
      setValue("folio_ticket", String(ai.folio).slice(0, 60));
      llenado.push("folio");
    }
    if (ai.proveedor && !watch("proveedor_id")) {
      const needle = ai.proveedor.toLowerCase();
      const match = providers.find(
        (p) =>
          p.nombre.toLowerCase().includes(needle) ||
          needle.includes(p.nombre.toLowerCase()),
      );
      if (match) {
        setValue("proveedor_id", match.id);
        llenado.push(match.nombre);
      }
    }
    // Matrícula leída → avión (normalización única; jamás a categorías sin
    // avión — el guardado los desliga y quedaría un valor a limpiar; jamás
    // si el usuario limpió el avión a mano: Reanalizar no lo re-impone).
    // Con reparto, jamás: el reparto sustituye al avión individual.
    if (conReparto) {
      const av = ai.matricula ? avionPorMatricula(aircraft, ai.matricula) : undefined;
      if (av && av.id !== watch("aeronave_id")) noAplicado.matricula = av.matricula;
    } else if (
      ai.matricula &&
      !avionLimpiado.current &&
      !watch("aeronave_id") &&
      watch("categoria") !== "PERSONAL_DUENO" &&
      watch("categoria") !== "GASOLINA" &&
      watch("categoria") !== "VISITA"
    ) {
      const av = avionPorMatricula(aircraft, ai.matricula);
      if (av) setValue("aeronave_id", av.id);
    }
    // Desglose Operación/TUA/FBO: SUSTITUYE el bloque "Desglose:" viejo de
    // las notas (el caso que motivó el botón: el desglose viejo se quedaba
    // pegado y el reporte separaba mal el TUA).
    if (ai.desglose_lineas && ai.desglose_lineas.length >= 2) {
      let bloque = `Desglose:\n${ai.desglose_lineas.join("\n")}`;
      const MAX = 2000; // límite del PATCH (schema notas)
      if (bloque.length > MAX) bloque = bloque.slice(0, MAX);
      let actuales = limpiarDesgloseViejo(watch("notas") ?? "");
      // El bloque nuevo se preserva ENTERO (es lo que espejan los reportes);
      // si no cabe, se recorta lo viejo.
      const espacio = MAX - bloque.length - (actuales ? 2 : 0);
      if (actuales.length > espacio) actuales = actuales.slice(0, Math.max(0, espacio)).trimEnd();
      setValue("notas", `${actuales}${actuales ? "\n\n" : ""}${bloque}`);
      llenado.push("desglose");
    }
    toast.success(
      `${
        llenado.length > 0
          ? `IA releyó el comprobante: ${llenado.join(" · ")}. Revisa y guarda.`
          : "IA releyó el comprobante; revisa los campos antes de guardar."
      }${notaIaConReparto(noAplicado)}`,
    );
  };

  const reanalizar = () => {
    setReanalizando(true);
    reanalizarComprobanteAction(gasto.id)
      .then((res) => {
        if (!res.ok || !res.data) {
          toast.error(res.ok ? "Sin respuesta de la IA" : (res.error ?? "Error"));
          return;
        }
        if (res.data.disponible === false) {
          toast.error(res.data.motivo ?? "La IA no está disponible ahora.");
          return;
        }
        // Lectura no confiable: no prellenar nada (mismo gate que el alta
        // offline — sin monto legible la propuesta solo ensuciaría el form).
        if (
          res.data.legible === false ||
          res.data.monto == null ||
          res.data.monto <= 0
        ) {
          toast.error(
            "La IA no pudo leer el comprobante con confianza; no se prellenó nada.",
          );
          return;
        }
        setAiRaw(res.data);
        aplicarIA(res.data);
      })
      .finally(() => setReanalizando(false));
  };

  const aplicarCandidato = (c: NonNullable<SugerenciaAsignacion["sugerido"]>) => {
    if (c.aeronave_id) {
      // Elección humana explícita (clic en el candidato): levanta el veto.
      setValue("aeronave_id", c.aeronave_id);
      avionLimpiado.current = false;
    }
    setVueloSel(c.vuelo_id);
    toast.info(
      `Se aplicará: vuelo #${c.folio ?? "?"} · ${c.matricula ?? "sin matrícula"}. Guarda para confirmar.`,
    );
  };

  /** Guardado real (fecha ya validada o confirmada por el usuario). */
  const guardarVerificacion = (values: GastoVerifyValues) => {
    // Cualquiera de las dos «Comisión del vendedor» sin vuelo: mismo texto
    // que el 400 del API (con la etiqueta de SU categoría).
    const sinVuelo = errorVueloObligatorio(values.categoria, vueloSel);
    if (sinVuelo) {
      toast.error(sinVuelo);
      return;
    }
    // La categoría exige vuelo ⇒ el vuelo viaja en el MISMO PATCH que la
    // categoría (sin la 2.ª llamada de abajo). Si no, reclasificar un gasto
    // SIN vuelo a una «Comisión del vendedor» rebotaba: el API valida el
    // estado efectivo tras el merge y el PATCH de categoría llegaba sin
    // vuelo. Reclasificar ENTRE las dos (13-oct-2026) va por aquí también y
    // el API lo permite aunque el gasto esté conciliado.
    const vueloEnPatch = categoriaExigeVueloSiempre(values.categoria);
    // Contra qué se mide «se cambió en ESTE diálogo» (ver `baseFormRef`).
    const baseForm = baseFormRef.current;
    // El cuerpo del guardado; la transición de abajo lo llama SIN dejar que
    // un fallo de transporte de una server action llegue al error boundary.
    const ejecutar = async () => {
      // monto guardado = TOTAL PAGADO (ticket + propina): lo que llega al
      // banco. En el formulario se edita el ticket y la propina por separado
      // y aquí se recompone. Ticket vacío + propina vacía = no tocar el monto.
      const ticket = Number(values.monto);
      const propina = values.propina === "" ? 0 : Number(values.propina);
      // Guardar = confirmar: el sello (quién y cuándo) lo pone el API con
      // quien manda verificado:true. true sobrevive a stripEmpty.
      let payload: Record<string, unknown> = { ...values, verificado: true };
      // La lectura fresca de la IA se persiste JUNTO con la verificación:
      // los reportes derivan de valor_ia_extraido el desglose
      // Operación/TUA/FBO (persistirla al hacer clic cambiaba los números
      // aunque el operador cancelara). Cancelar de verdad descarta.
      if (aiRaw) {
        const lectura: Record<string, unknown> = { ...aiRaw };
        delete lectura.disponible;
        delete lectura.motivo;
        // `tua_detectada` la CALCULA el API con esta lectura: es cálculo, no
        // lectura (la que separa los libros la recalcula el API al leer el
        // gasto). `tua_monto` sí se queda: es lo que leyó la IA.
        delete lectura.tua_detectada;
        payload = { ...payload, valor_ia_extraido: lectura };
      }
      if (values.monto !== "" || values.propina !== "") {
        if (!(ticket > 0)) {
          toast.error("Captura el monto del ticket.");
          return;
        }
        if (!(propina >= 0)) {
          toast.error("La propina no es válida.");
          return;
        }
        payload = {
          // OJO: se extiende PAYLOAD (no values): reconstruir desde values
          // tiraba valor_ia_extraido — el jsonb llegaba null y el balance
          // no separaba el TUA (caso ASUR Cozumel $1,417.28, 24-ago).
          ...payload,
          monto: Math.round((ticket + propina) * 100) / 100,
          // 0 explícito: quitar la propina también debe guardarse.
          propina,
        };
      }
      // «TUA incluida en este gasto» (13-oct-2026, API 0.0.75): la llave
      // viaja SOLO si cambió (null al vaciar) o si cambió la moneda con un
      // valor en el campo; campo oculto (API sin la columna o categoría fuera
      // de Operaciones/Aterrizaje/FBO) ⇒ no viaja y, al reclasificar, el API
      // la limpia solo. El error local se evalúa SIEMPRE que el campo tenga
      // valor (también si solo cambió el monto): MISMO texto que el 400.
      delete (payload as { tua_incluida?: unknown }).tua_incluida;
      const tuaVisibleAlGuardar =
        apiConTuaIncluida(gasto) && categoriaAdmiteTuaIncluida(values.categoria);
      // Moneda nueva con la cifra SIN reescribir: la llave no viaja y el API
      // la limpia (ya avisado y confirmado) — validarla contra el ticket en
      // la moneda nueva frenaría en falso (5,250 MXN contra un ticket de 300
      // USD).
      const tuaSeLimpiaPorMoneda = values.moneda !== gasto.moneda && !tuaEditada;
      if (
        tuaVisibleAlGuardar &&
        !tuaSeLimpiaPorMoneda &&
        (values.tua_incluida ?? "").trim() !== ""
      ) {
        const err = errorTuaIncluida({
          valor: Number(values.tua_incluida),
          ticket: ticket > 0 ? ticket : Number(gasto.monto) - Number(gasto.propina ?? 0),
          moneda: values.moneda,
        });
        if (err) {
          toast.error(err);
          return;
        }
      }
      const tuaPatch = tuaIncluidaParaPatch({
        visible: tuaVisibleAlGuardar,
        valorForm: values.tua_incluida,
        actual: baseForm.tua_incluida,
        monedaCambio: values.moneda !== gasto.moneda,
        editada: tuaEditada,
      });
      if (tuaPatch !== undefined) payload.tua_incluida = tuaPatch;
      // Litros solo aplican a GAS; vacío = no tocar (el zod los descarta).
      if (values.categoria !== "GAS" || values.litros === "") {
        delete (payload as { litros?: unknown }).litros;
      }
      // Tipo, lugar y la hora de la carga: viaja SOLO lo que cambió, con la
      // regla de `lib/admin/combustibles.ts` (tipo/lugar solo en GAS; si se
      // corrige la fecha, la hora de la carga se muda al día nuevo para que
      // el renglón de Combustibles no siga diciendo la fecha vieja).
      delete (payload as { tipo_combustible?: unknown }).tipo_combustible;
      delete (payload as { lugar?: unknown }).lugar;
      Object.assign(payload, camposCargaParaPatch(baseForm, values));
      // Facturación: viaja SOLO si se cambió en ESTE diálogo. El badge de la
      // tabla y el trigger del amarre de factura recibida también escriben
      // este campo — mandar el valor con que se abrió el form (posiblemente
      // stale) pisaría esos cambios en silencio.
      if (
        values.estatus_facturacion === (baseForm.estatus_facturacion ?? "PENDIENTE")
      ) {
        delete (payload as { estatus_facturacion?: unknown }).estatus_facturacion;
      }
      // Fecha: viaja SOLO si se cambió en ESTE diálogo (revisión del
      // 14-oct-2026). «Vincular gasto» de Conciliación también la corrige
      // (`PATCH /v1/expenses/:id/fecha`): mandar la del formulario con que se
      // abrió (posiblemente vieja) la revertía en silencio y el PATCH
      // disparaba el cruce automático con la fecha vieja. Sin la llave, el
      // API conserva la guardada (y la hora de la carga tampoco viaja:
      // `camposCargaParaPatch` solo la muda si la fecha cambió). Se compara
      // con la BASE de la sesión, no con el `gasto` vivo: tras un refresh el
      // vivo ya trae la fecha nueva y la del formulario «cambiaba» sola.
      if (values.fecha_gasto === (baseForm.fecha_gasto ?? "").slice(0, 10)) {
        delete (payload as { fecha_gasto?: unknown }).fecha_gasto;
      }
      // El usuario LIMPIÓ el avión a mano ("Sin avión"): desligar con null
      // explícito — "" se tira en stripEmpty y el avión viejo seguiría vivo
      // (la opción sería un no-op mentiroso). El API valida lo que aplique
      // (p. ej. GAS exige avión y lo rechaza con mensaje claro).
      if (avionLimpiado.current && !values.aeronave_id) {
        payload.aeronave_id = null;
      }
      // Reclasificar a PERSONAL del dueño: desligar vuelo/avión/escala en el
      // MISMO PATCH (null explícito sobrevive a stripEmpty; "" se tiraría y
      // el candado del API rechazaría el estado efectivo con los enlaces
      // viejos vivos).
      if (
        values.categoria === "PERSONAL_DUENO" ||
        values.categoria === "GASOLINA" ||
        values.categoria === "VISITA"
      ) {
        payload.aeronave_id = null;
        payload.vuelo_id = null;
        payload.escala_id = null;
      }
      // Sin vuelo pero CON avión (INDIRECTO/NOMINA/SERVICIOS): desligar
      // vuelo y escala en el MISMO PATCH — el avión se conserva.
      if (
        values.categoria === "INDIRECTO" ||
        values.categoria === "NOMINA" ||
        values.categoria === "SERVICIOS"
      ) {
        payload.vuelo_id = null;
        payload.escala_id = null;
      }
      // Fecha CORREGIDA aquí a > 365 días atrás (ya confirmada en el
      // diálogo): el API exige el candado permitir_fecha_antigua para
      // fechas de otro año (auditoría 29-ago).
      if (
        values.fecha_gasto &&
        values.fecha_gasto !== (baseForm.fecha_gasto ?? "").slice(0, 10) &&
        fechaGastoAntigua(values.fecha_gasto)
      ) {
        payload.permitir_fecha_antigua = true;
      }
      // Acoplamiento medio↔tarjeta: solo TARJETA_CORP lleva terminación (CHECK
      // de la BD). Con cualquier otro medio se manda null EXPLÍCITO — "" se
      // tira en stripEmpty y la terminación vieja seguiría viva, y cambiar
      // p. ej. a EFECTIVO tronaba el PATCH con 500 (23514).
      if (values.medio_pago !== "TARJETA_CORP") {
        payload.tarjeta_terminacion = null;
      }
      // Reparto entre aviones (R13/R14, 14-oct-2026): un gasto repartido no
      // lleva vuelo (el PATCH lo desliga ANTES del PUT) ni avión individual.
      // Gasolina/Visita conservan su null de siempre; con el reparto YA
      // guardado y un avión viejo en el gasto, null (autocorrección: el
      // candado del API deja pasar null); en cualquier otro caso la llave NO
      // viaja — el PUT quita el avión, y mandar null antes dejaría el gasto
      // sin avión y sin reparto si el PUT falla.
      if (enReparto) {
        if (values.categoria === "GASOLINA" || values.categoria === "VISITA") {
          payload.aeronave_id = null;
        } else if (repartoGuardado && baseForm.aeronave_id) {
          payload.aeronave_id = null;
        } else {
          delete payload.aeronave_id;
        }
        payload.vuelo_id = null;
        payload.escala_id = null;
      }
      // Comisión del vendedor: vuelo en el MISMO PATCH (ver arriba). El API
      // limpia solo un tramo del vuelo anterior. El avión NO se re-hereda
      // cuando el PATCH ya trae `aeronave_id` (lo trae siempre que el gasto
      // tenga avión): lo pone el selector de vuelo de arriba al elegirlo
      // (solo referencia; la comisión no es costo del avión).
      if (vueloEnPatch) {
        payload.vuelo_id = vueloSel;
      }
      // Hojas del comprobante (12-oct-2026): se suben las nuevas (si una
      // falla, no se guarda nada a medias) y viaja la lista completa en
      // `valor_ia_extraido.fotos_adicionales` SOLO si cambió, encima de la
      // lectura de la IA (la fresca o la guardada: nunca se pierde). Sin hoja
      // principal, la primera agregada pasa a ser `foto_url`.
      if (hojasCambiaron(hojasDe(baseForm), hojas, hojasNuevas.length)) {
        const subidas: string[] = [];
        for (const archivo of hojasNuevas) {
          try {
            subidas.push(await uploadGastoComprobante(archivo));
          } catch (err) {
            toast.error(
              err instanceof Error
                ? `${err.message} (${nombreCorto(archivo.name)})`
                : `No se pudo subir ${nombreCorto(archivo.name)}`,
            );
            return;
          }
        }
        const todas = [...hojas, ...subidas];
        // ¿Ya hay hoja principal? La del vivo o la que dejó un guardado
        // propio a medias (la base): jamás se reemplaza la principal.
        const tienePrincipal = !!(gasto.foto_url || baseForm.foto_url);
        if (!tienePrincipal && todas.length > 0) payload.foto_url = todas.shift();
        const base =
          (payload.valor_ia_extraido as Record<string, unknown> | undefined) ??
          gasto.valor_ia_extraido;
        // `{}` explícito: quitar la última hoja también debe guardarse.
        payload.valor_ia_extraido = valorIaConHojas(base, todas) ?? {};
      }
      // El banner del reparto de un intento anterior se limpia al guardar.
      setAvisoReparto(null);
      let textoExito = "Gasto verificado";
      let avisosExito: string[] = [];
      if (quitaReparto || cambiaReparto) {
        // Con cambio de reparto (crearlo, editarlo o quitarlo): UN clic. La
        // action relee el reparto, ordena PATCH/PUT con el planificador y
        // dice exactamente qué quedó guardado. Nunca lanza; y si la llamada
        // misma revienta en el cliente, no llega al error boundary.
        const ctx: ContextoResultadoReparto = {
          modo: quitaReparto ? "QUITAR" : repartoGuardado ? "EDITAR" : "CREAR",
          base: repartoBase,
          nuevo: quitaReparto ? [] : nuevoPartes,
          matriculaFinal: quitaReparto ? matriculaDe(values.aeronave_id) : null,
          categoria: values.categoria,
          moneda: monedaReparto,
          tieneVuelo: !!vueloSel,
        };
        const anterior = repartoBase;
        const riesgoConciliado = dineroBloqueado && dineroCambia(payload, gasto);
        const r = await llamarSinLanzar(() =>
          guardarGastoConRepartoAction(
            gasto.id,
            payload,
            { base: itemsDePartes(repartoBase), nuevo: quitaReparto ? [] : itemsNuevo },
            { riesgoConciliado },
          ),
        );
        if (!r.ok) {
          // Sin respuesta: se relee el reparto para decir cómo quedó.
          const rel = await llamarSinLanzar(() => getRepartoAction(gasto.id));
          const reparto = rel.ok && rel.valor.ok ? (rel.valor.data ?? null) : null;
          if (reparto) fijarBase(partesDeRespuesta(reparto));
          avisarResultado(
            mensajeResultadoGastoReparto({ codigo: "SIN_RESPUESTA", reparto }, ctx),
            "SIN_RESPUESTA",
            anterior,
          );
          return;
        }
        const res = r.valor;
        if (!res.ok) {
          // Lo último que se supo del reparto pasa a ser la base.
          if (res.reparto) {
            const partes = partesDeRespuesta(res.reparto);
            fijarBase(partes);
            if (res.codigo === "REPARTO_CAMBIO" && !repartoTocado) {
              setRepartoSel(seleccionDesdePartes(partes));
            }
          }
          // R21: el gasto SÍ se guardó: el reintento no sube otra vez las
          // hojas ni reenvía la lectura de la IA. Lo guardado pasa a ser la
          // BASE de la sesión (lo que el formulario ya escribió no «cambia»).
          if (res.gastoGuardado && res.data) {
            baseFormRef.current = { ...baseFormRef.current, ...res.data };
            setHojas(hojasDe(res.data));
            setHojasNuevas([]);
            setAiRaw(null);
            setTuaEditada(false);
          }
          if (res.codigo === "GASTO" && esRechazoPorReparto(res.error)) {
            toast.error(res.error ?? "", { description: AYUDA_RECHAZO_POR_REPARTO });
            releerReparto(true);
            return;
          }
          avisarResultado(mensajeResultadoGastoReparto(res, ctx), res.codigo, anterior);
          return;
        }
        textoExito = textoExitoGastoReparto(ctx);
        avisosExito = res.avisos;
      } else {
        const result = await verifyGastoAction(gasto.id, payload);
        if (!result.ok) {
          if (result.fieldErrors) {
            const f = Object.keys(result.fieldErrors)[0];
            toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
          } else if (esRechazoPorReparto(result.error)) {
            // R23: el API dice que el gasto ya está repartido (embed viejo):
            // se relee y, si aparece el reparto, se pasa a «Repartir».
            toast.error(result.error ?? "", { description: AYUDA_RECHAZO_POR_REPARTO });
            releerReparto(true);
          } else {
            toast.error(result.error ?? "Error desconocido");
          }
          return;
        }
      }
      // Éxito completo (los dos caminos). Vuelo elegido (sugerencia o manual)
      // distinto al actual: ligarlo o desligarlo junto con el resto de la
      // verificación. Con PERSONAL_DUENO el PATCH ya desligó el vuelo: la
      // segunda llamada re-ligaría o duplicaría la escritura.
      if (
        values.categoria !== "PERSONAL_DUENO" &&
        values.categoria !== "GASOLINA" &&
        values.categoria !== "VISITA" &&
        // Sin vuelo por categoría: el PATCH ya lo desligó — una segunda
        // llamada re-ligaría o duplicaría la escritura.
        values.categoria !== "INDIRECTO" &&
        values.categoria !== "NOMINA" &&
        values.categoria !== "SERVICIOS" &&
        // Repartido entre aviones: sin vuelo. Comisión del vendedor: el
        // vuelo ya viajó en el PATCH.
        !enReparto &&
        !vueloEnPatch &&
        vueloSel !== (gasto.vuelo_id ?? "")
      ) {
        // Sin lanzar: el gasto YA se guardó; un fallo de transporte aquí se
        // dice y jamás tira la pantalla al error boundary.
        const r = await llamarSinLanzar(() => assignVueloGastoAction(gasto.id, vueloSel || null));
        const link = r.ok ? r.valor : null;
        // El API explica el rechazo (p. ej. 400: la escala pertenece a
        // otro vuelo): se muestra tal cual, no un genérico.
        if (!link) toast.error(TEXTO_VUELO_SIN_RESPUESTA, { duration: TOAST_LARGO_MS });
        else if (!link.ok)
          toast.error(
            link.error
              ? `Gasto guardado, pero no se pudo ligar el vuelo: ${link.error}`
              : "Gasto guardado, pero no se pudo ligar el vuelo.",
          );
      }
      toast.success(textoExito);
      // El refuerzo del avión individual no pudo quitarlo: aviso, no error.
      for (const aviso of avisosExito) toast.warning(aviso, { duration: TOAST_AVISO_MS });
      onOpenChange(false);
    };
    startTransition(async () => {
      try {
        await ejecutar();
      } catch {
        // Revisión del 14-oct-2026: el camino de siempre llama a la server
        // action directa (`verifyGastoAction`); si REVIENTA en el cliente
        // («Failed to find Server Action» tras un deploy de Vercel, red
        // caída) no se sabe si el PATCH llegó: se dice y el diálogo sigue
        // abierto con lo capturado (antes caía al error boundary).
        toast.error(TEXTO_SIN_RESPUESTA_GUARDAR, { duration: TOAST_LARGO_MS });
      }
    });
  };

  /**
   * Tras la fecha: la UNA confirmación del reparto (quitarlo, bajar o sacar
   * a un avión, sustituir al avión guardado o el primer reparto de un FIJO;
   * regla del cliente: lo destructivo confirma) y después, si el guardado
   * BORRA la TUA que fijó la oficina (categoría que no la admite, o moneda
   * nueva sin reescribirla), la suya — es destructivo y antes pasaba en
   * silencio (solo un warn en el log del API y la bitácora).
   */
  const continuarGuardado = (values: GastoVerifyValues, ya: { reparto?: boolean } = {}) => {
    if (!ya.reparto) {
      // Un guardado nuevo no hereda la confirmación de uno anterior.
      setConfirmarReparto(null);
      setGuardandoReparto(false);
      const conf = confirmacionDe(values);
      if (conf) {
        setConfirmarReparto({ values: { ...values }, ...conf });
        return;
      }
    }
    const borra = tuaQueSeBorra({
      apiConCampo: apiConTuaIncluida(gasto),
      actual: gasto.tua_incluida,
      categoria: values.categoria,
      monedaVieja: gasto.moneda,
      monedaNueva: values.moneda,
      editada: tuaEditada,
    });
    if (borra) {
      if (ya.reparto) {
        setConfirmarReparto(null);
        setGuardandoReparto(false);
      }
      setConfirmarTua({ values: { ...values }, texto: borra.texto });
      return;
    }
    guardarVerificacion(values);
  };

  const onSubmit = handleSubmit((values) => {
    // Reparto (R24): lo que se frena ANTES de la red — aviones cargando,
    // ningún avión marcado, un marcado sin monto, un inactivo, Σ > total
    // pagado o la moneda cambiada con un reparto guardado.
    const errorReparto = errorRepartoEnPantalla({
      enReparto,
      editando: editorRepartoVisible,
      avionesCargando: cargandoAviones,
      sinBase: !repartoGuardado,
      cambia: cambiaReparto,
      resumen: resumenRep,
      monedaCambiaConBase: repartoGuardado && values.moneda !== gasto.moneda,
      monedaGuardada: gasto.moneda,
    });
    if (errorReparto) {
      toast.error(errorReparto);
      return;
    }
    // Quitar el reparto pasando a «Gasavión / Turbosina» sin avión: el PATCH
    // rebotaría DESPUÉS de quitar el reparto (falla a medias). Antes de la red.
    const errorGas = errorQuitarRepartoSinAvion({
      quitaReparto,
      categoria: values.categoria,
      aeronaveId: values.aeronave_id,
    });
    if (errorGas) {
      toast.error(errorGas);
      return;
    }
    // Candado de fechas (auditoría 29-ago): SOLO si la oficina CAMBIÓ la
    // fecha aquí y quedó > 60 días atrás o > 2 días a futuro se pide
    // confirmación — verificar un gasto viejo sin tocar la fecha no molesta.
    // «Cambió AQUÍ» = contra la BASE de la sesión (no el gasto vivo).
    const original = (baseFormRef.current.fecha_gasto ?? "").slice(0, 10);
    if (
      values.fecha_gasto &&
      values.fecha_gasto !== original &&
      fechaGastoSospechosa(values.fecha_gasto)
    ) {
      setConfirmarFecha({ ...values });
      return;
    }
    continuarGuardado(values);
  });

  // La IA (reanálisis) propuso una fecha con OTRO año: campo en ámbar hasta
  // corregirla — con el año equivocado el gasto sale de todos los cortes.
  const fechaIaOtroAnio =
    !!aiRaw?.fecha &&
    aiRaw.fecha === watch("fecha_gasto") &&
    watch("fecha_gasto").slice(0, 4) !== todayCancun().slice(0, 4);

  const monto = Number(gasto.monto).toLocaleString("es-MX", {
    style: "currency",
    currency: gasto.moneda,
  });

  // «TUA incluida en este gasto» (13-oct-2026, API 0.0.75): SOLO con la llave
  // `tua_incluida` del API (migración aplicada) y en las facturas de
  // aeropuerto. El panel no calcula ninguna TUA: la detectada la dice el API
  // (`tua_detectada` de la lectura fresca o `tua_detectada_ia` del gasto) y
  // la leída es el `tua_monto` crudo (solo sugerencia).
  const tuaVisible = apiConTuaIncluida(gasto) && categoriaAdmiteTuaIncluida(watch("categoria"));
  const tuaDetectada = aiRaw ? (aiRaw.tua_detectada ?? null) : (gasto.tua_detectada_ia ?? null);
  const tuaLeida = aiRaw ? (aiRaw.tua_monto ?? null) : tuaLeidaIa(gasto.valor_ia_extraido);
  const tuaEscrita = (watch("tua_incluida") ?? "").trim();
  const ticketVivo = Number(watch("monto"));
  // El mismo error que frena el guardado, a la vista mientras se escribe.
  const errorTuaVivo =
    tuaVisible && tuaEscrita !== "" && !(watch("moneda") !== gasto.moneda && !tuaEditada)
      ? errorTuaIncluida({
          valor: Number(tuaEscrita),
          ticket:
            ticketVivo > 0 ? ticketVivo : Number(gasto.monto) - Number(gasto.propina ?? 0),
          moneda: watch("moneda"),
        })
      : null;
  // La nota habla de lo GUARDADO: en la moneda del gasto guardado.
  const tuaVigente = tuaVisible ? notaTuaVigente(gasto, gasto.moneda) : null;
  // Lo que el guardado BORRARÍA de la TUA de oficina, a la vista ANTES de
  // guardar (bajo el selector de categoría o bajo el campo) y en la
  // confirmación; con la cifra reescrita en otra moneda, en cuál se guarda.
  const tuaSeBorra = tuaQueSeBorra({
    apiConCampo: apiConTuaIncluida(gasto),
    actual: gasto.tua_incluida,
    categoria: watch("categoria"),
    monedaVieja: gasto.moneda,
    monedaNueva: watch("moneda"),
    editada: tuaEditada,
  });
  const tuaMonedaNueva = tuaVisible
    ? notaTuaMonedaNueva({
        valorForm: watch("tua_incluida"),
        monedaVieja: gasto.moneda,
        monedaNueva: watch("moneda"),
        editada: tuaEditada,
      })
    : null;
  const registroTua = register("tua_incluida");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificar gasto · {monto}</DialogTitle>
          {/* Decidida con la CATEGORÍA del formulario (revisión del
              14-oct-2026): un repartible sin avión NO queda en la bandeja; uno
              que necesita avión sí; el personal y la comisión que paga
              VuelaTour no llevan avión. */}
          <DialogDescription>
            {descripcionVerificarGasto({ enReparto, categoria: categoriaForm })}
          </DialogDescription>
        </DialogHeader>

        {/* Auditoría de captura (pedido 7-sep): cuándo, quién y desde dónde
            se capturó, en hora Cancún. La llegada al servidor solo se enseña
            si difiere de la captura (> 1 min: se capturó sin señal y el
            outbox lo subió después). Solo lectura: no toca la ventana de
            edición ni el dinero. */}
        {capturadoEnDe(gasto) && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <p>
              <span className="font-medium">Capturado</span>{" "}
              {fmtDateTime(capturadoEnDe(gasto))}
              {gasto.captura?.nombre && <> · {gasto.captura.nombre}</>}
              {origenCapturaLabel(gasto.origen) && (
                <> · {origenCapturaLabel(gasto.origen)}</>
              )}
            </p>
            {llegoAlServidorDistinto(gasto) && (
              <p className="text-muted-foreground">
                <span className="font-medium">Llegó al servidor</span>{" "}
                {fmtDateTime(gasto.created_at)}
              </p>
            )}
          </div>
        )}

        {/* Pago de una compra de refacciones: el gasto se edita aquí igual,
            pero el costo en bodega vive en la compra. */}
        {gasto.compra && gasto.compra_rol && (
          <Link
            href={`/admin/inventory/compras/${gasto.compra.id}`}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-600/40 bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-600/20"
            title="Abrir la compra"
          >
            <ShoppingCartIcon className="h-3.5 w-3.5" />
            Compra #{gasto.compra.folio} · {COMPRA_ROL_LABELS[gasto.compra_rol]} ·{" "}
            {COMPRA_ESTADO_LABELS[gasto.compra.estado]}
          </Link>
        )}

        {/* Comprobante: foto subida con el registro, para validar el dato. */}
        {fotoUrl ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
              <ComprobantePreview
                bucket="gasto-fotos"
                path={gasto.foto_url ?? ""}
                url={fotoUrl}
                alt="Comprobante del gasto"
                thumbClassName="w-full h-auto min-h-32 max-h-[45vh] object-contain"
              />
            </div>
            {/* Reanálisis: para gastos capturados antes de una mejora del
                prompt (p. ej. separación TUA/FBO) cuyo dato viejo se quedó. */}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={reanalizar}
                disabled={reanalizando || pending}
              >
                {reanalizando ? "Analizando…" : "✨ Reanalizar con IA"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Vuelve a leer el comprobante y propone los campos; nada se
                guarda hasta que confirmes.
              </p>
            </div>
            {aiRaw && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                {aiRaw.desglose_lineas && aiRaw.desglose_lineas.length >= 2 ? (
                  <>
                    <p className="mb-1 font-medium">
                      Desglose leído (así quedará en las notas):
                    </p>
                    <ul className="space-y-0.5 font-mono text-muted-foreground">
                      {aiRaw.desglose_lineas.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    La IA no distinguió un desglose que cuadre con el total: el
                    gasto queda solo con el monto (revisa la factura si
                    esperabas Operación/FBO/TUA por separado).
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Este gasto no tiene foto de comprobante.
          </p>
        )}

        {/* Hojas 2..N del comprobante (12-oct-2026): las guardadas con su
            miniatura (URL firmada pedida al abrir), las nuevas por nombre;
            «Agregar hojas» sube más al guardar. Sin hoja principal, el primer
            archivo agregado pasa a serlo. */}
        <div
          className="space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
          data-hojas-comprobante
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{TITULO_HOJAS_COMPROBANTE}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => hojasRef.current?.click()}
              disabled={pending || totalHojas >= MAX_HOJAS_COMPROBANTE}
              title={AYUDA_AGREGAR_HOJAS}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {totalHojas > 0 ? ETIQUETA_AGREGAR_HOJAS : BOTON_AGREGAR_COMPROBANTE}
            </Button>
          </div>
          <input
            ref={hojasRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,text/csv"
            className="hidden"
            onChange={(e) => {
              agregarHojas(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {hojas.length === 0 && hojasNuevas.length === 0 ? (
            <p className="text-muted-foreground">{AYUDA_AGREGAR_HOJAS}</p>
          ) : (
            <ul className="space-y-1.5">
              {hojas.map((p, i) => (
                <li key={p} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {etiquetaHoja(primeraHoja + i, totalHojas)}
                  </span>
                  {urlsHojas[p] ? (
                    <ComprobantePreview
                      bucket="gasto-fotos"
                      path={p}
                      url={urlsHojas[p]}
                      alt={`Hoja ${primeraHoja + i} del comprobante`}
                      thumbClassName="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={p}>
                      {nombreCorto(p.split("/").pop() ?? p)}
                    </span>
                  )}
                  <button
                    type="button"
                    title={BOTON_QUITAR_HOJA}
                    onClick={() => setHojaAQuitar(p)}
                    disabled={pending}
                    className="ml-auto cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {hojasNuevas.map((a, i) => (
                <li key={`${a.name}-${a.size}-${i}`} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {etiquetaHoja(primeraHoja + hojas.length + i, totalHojas)}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={a.name}>
                    {nombreCorto(a.name)}{" "}
                    <span className="text-muted-foreground">· {TEXTO_NUEVA_HOJA}</span>
                  </span>
                  <button
                    type="button"
                    title="Quitar"
                    onClick={() => setHojasNuevas((prev) => prev.filter((_, j) => j !== i))}
                    disabled={pending}
                    className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Match automático piloto+fecha (IA si es ambiguo): propone, el humano
            confirma. Se OCULTA en modo reparto y con reparto guardado o por
            confirmar (R10): un gasto repartido no lleva vuelo. */}
        {!gasto.aeronave_id && estadoRep === "SIN_REPARTO" && !enReparto && !repartoGuardado && (
          <div
            className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1.5"
            data-sugerencia-vuelo=""
          >
            {sugiriendo ? (
              <p className="text-muted-foreground">Buscando a qué vuelo pertenece…</p>
            ) : sugerencia?.sugerido ? (
              <>
                <p>
                  <span className="font-medium">✨ Sugerencia{sugerencia.fuente === "ia" ? " (IA)" : ""}:</span>{" "}
                  vuelo <span className="font-mono">#{sugerencia.sugerido.folio ?? "?"}</span>
                  {sugerencia.sugerido.matricula && (
                    <> · <span className="font-mono">{sugerencia.sugerido.matricula}</span></>
                  )}
                  {sugerencia.sugerido.ruta && <> · {sugerencia.sugerido.ruta}</>}
                  {sugerencia.sugerido.estado === "CANCELADO" && (
                    <> · <span className="font-semibold">CANCELADO</span></>
                  )}
                  {sugerencia.confianza > 0 && (
                    <span className="text-muted-foreground"> · {Math.round(sugerencia.confianza * 100)}%</span>
                  )}
                </p>
                <p className="text-muted-foreground">{sugerencia.razon}</p>
                <Button
                  type="button"
                  size="sm"
                  variant={vueloSel === sugerencia.sugerido.vuelo_id ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => aplicarCandidato(sugerencia.sugerido!)}
                >
                  {vueloSel === sugerencia.sugerido.vuelo_id ? "✓ Aplicado (guarda para confirmar)" : "Aplicar sugerencia"}
                </Button>
              </>
            ) : sugerencia && sugerencia.candidatos.length > 0 ? (
              <>
                <p className="font-medium">Sin match claro — candidatos del piloto:</p>
                <p className="text-muted-foreground">{sugerencia.razon}</p>
                <div className="flex flex-wrap gap-1.5">
                  {sugerencia.candidatos.slice(0, 4).map((c) => (
                    <Button
                      key={c.vuelo_id}
                      type="button"
                      size="sm"
                      variant={vueloSel === c.vuelo_id ? "secondary" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => aplicarCandidato(c)}
                    >
                      #{c.folio ?? "?"} · {c.matricula ?? "—"}{c.ruta ? ` · ${c.ruta}` : ""}
                      {c.estado === "CANCELADO" ? " · CANCELADO" : ""}
                    </Button>
                  ))}
                </div>
              </>
            ) : sugerencia ? (
              <p className="text-muted-foreground">
                <span className="font-medium">Sin match:</span> {sugerencia.razon}
              </p>
            ) : null}
          </div>
        )}

        {/* Sello de confirmación del panel: quién confirmó y cuándo. Se
            oculta optimista al retirarlo (la revalidación refresca la fila).
            Tolerante al skew de deploy: sin campos del API no se muestra. */}
        {gasto.verificado_at && !selloRetirado && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            <span>
              ✓ Confirmado por {verificadorNombre(gasto) ?? "oficina"} ·{" "}
              {fmtDate(gasto.verificado_at)}
            </span>
            <button
              type="button"
              className="underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
              onClick={() => setOpenRetirar(true)}
              disabled={pending || retirando}
            >
              Retirar confirmación
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Si el enriquecimiento IA marcó ⚠ (piloto vs documento), aquí se corrige.
              La línea «⚠ Conciliado con el cargo bancario del …» (gasto en
              efectivo ligado con justificación, 6-oct-2026) NO es una
              discrepancia: `tieneDiscrepanciaIa` la ignora. */}
          {tieneDiscrepanciaIa(gasto.notas) && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              La IA detectó discrepancias entre lo capturado y el comprobante (ver ⚠ en
              notas). Corrige aquí el dato correcto — monto, fecha y moneda son editables.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto del ticket">
              <Input type="number" step="0.01" min="0" inputMode="decimal" {...register("monto")} />
            </Field>
            <Field label="Propina" hint="Solo si se agregó en la terminal (opcional).">
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                {...register("propina")}
              />
            </Field>
          </div>

          {/* TUA incluida (13-oct-2026): la cifra de OFICINA manda sobre la
              lectura de la IA (vacío = IA, 0 = sin TUA). Solo con la llave
              del API y en Operaciones/Aterrizaje/FBO. */}
          {tuaVisible && (
            <div className="space-y-1" data-tua-incluida>
              <Field
                label={ETIQUETA_TUA_INCLUIDA}
                hint={ayudaTuaIncluida({
                  valor: watch("tua_incluida"),
                  detectada: tuaDetectada,
                  leida: tuaLeida,
                  moneda: watch("moneda"),
                  conVuelo: !!vueloSel,
                })}
                error={errorTuaVivo ?? undefined}
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder={placeholderTuaIncluida(tuaDetectada)}
                  {...registroTua}
                  onChange={(e) => {
                    // Teclear (aunque sea la misma cifra) = la oficina la
                    // confirma en la moneda del gasto: solo así viaja con
                    // una moneda nueva (`tuaIncluidaParaPatch`).
                    setTuaEditada(true);
                    void registroTua.onChange(e);
                  }}
                />
              </Field>
              {tuaVigente && (
                <p className="text-[11px] text-muted-foreground">{tuaVigente}</p>
              )}
              {tuaSeBorra?.motivo === "MONEDA" && (
                <p
                  className="text-[11px] text-amber-700 dark:text-amber-300"
                  role="status"
                  data-tua-se-borra="MONEDA"
                >
                  {tuaSeBorra.texto}
                </p>
              )}
              {tuaMonedaNueva && (
                <p className="text-[11px] text-muted-foreground" data-tua-moneda-nueva="">
                  {tuaMonedaNueva}
                </p>
              )}
            </div>
          )}

          {/* Solo combustible: litros (el balance no calcula $/litro sin
              ellos), tipo y lugar — las columnas de Combustibles se corrigen
              aquí (1-oct-2026). */}
          {watch("categoria") === "GAS" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field
                label="Litros cargados"
                hint="Del ticket; el balance calcula $/litro con esto."
              >
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder="Ej. 164"
                  {...register("litros")}
                />
              </Field>
              <Field label={ETIQUETA_TIPO_COMBUSTIBLE}>
                <SearchableSelect
                  options={TIPOS_COMBUSTIBLE.map((t) => ({ value: t.value, label: t.label }))}
                  value={watch("tipo_combustible")}
                  onChange={(v) => {
                    // Elección de la oficina: manda sobre el prellenado.
                    const eleccion = eleccionManualCombustible(v);
                    tipoAuto.current = eleccion.auto;
                    setValue("tipo_combustible", eleccion.valor);
                  }}
                  placeholder={PLACEHOLDER_TIPO_COMBUSTIBLE}
                />
              </Field>
              <Field label="Lugar" hint="Aeropuerto o FBO de la carga.">
                <Input
                  className="font-mono uppercase"
                  placeholder="Ej. CUN"
                  maxLength={60}
                  {...register("lugar")}
                />
              </Field>
            </div>
          )}
          {avisoCombustible && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              ⚠ {avisoCombustible}
            </p>
          )}

          {/* Total pagado EN VIVO (ticket + propina): es el monto que se
              guarda y el que aparece en el estado de cuenta del banco. En
              modo reparto, la línea del reparto (GUÍA; roja si se pasa). */}
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs" data-total-pagado="">
            <p>
              <span className="font-medium">
                Total pagado:{" "}
                {(() => {
                  const t = Number(watch("monto"));
                  const p = Number(watch("propina"));
                  const total =
                    Math.round(
                      ((Number.isFinite(t) ? t : 0) + (Number.isFinite(p) ? p : 0)) * 100,
                    ) / 100;
                  return total.toLocaleString("es-MX", {
                    style: "currency",
                    currency: watch("moneda") === "USD" ? "USD" : "MXN",
                  });
                })()}
              </span>{" "}
              <span className="text-muted-foreground">
                — esto es lo que llega al estado de cuenta
              </span>
              {enReparto && resumenRep.incluidos.length > 0 && (
                <span
                  data-linea-total-reparto=""
                  className={
                    resumenRep.excedidoCents > 0
                      ? "font-medium text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  }
                >
                  {" "}
                  {lineaTotalPagadoReparto({
                    sumaCents: resumenRep.sumaCents,
                    nAviones: resumenRep.incluidos.length,
                    restoCents: resumenRep.restoCents,
                    excedidoCents: resumenRep.excedidoCents,
                    moneda: monedaReparto,
                  })}
                </span>
              )}
            </p>
            {/* Conciliado (R18): monto, moneda y medio no cambian (409 del API). */}
            {notaDineroBloqueado && (
              <p className="mt-1 text-amber-700 dark:text-amber-300" data-nota-dinero-bloqueado="">
                {NOTA_DINERO_BLOQUEADO}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Moneda">
              <SearchableSelect
                options={[
                  { value: "MXN", label: "MXN" },
                  { value: "USD", label: "USD" },
                ]}
                value={watch("moneda")}
                onChange={(v) => setValue("moneda", v)}
                placeholder="Moneda"
              />
            </Field>
            <Field label="Fecha del gasto">
              <Input
                type="date"
                className={
                  fechaIaOtroAnio
                    ? "border-amber-500 focus-visible:ring-amber-500/40"
                    : undefined
                }
                {...register("fecha_gasto")}
              />
              {fechaIaOtroAnio && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  La IA leyó el año {watch("fecha_gasto").slice(0, 4)} en el
                  comprobante — con el año equivocado el gasto queda fuera de
                  todos los cortes. Corrígela si no es real.
                </p>
              )}
            </Field>
          </div>
          {/* R16: los montos del reparto guardado están en su moneda. */}
          {avisoMonedaReparto && (
            <p
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
              role="status"
              data-reparto-moneda=""
            >
              ⚠ {avisoMonedaReparto}
            </p>
          )}

          <Field
            label="Folio / remisión del ticket"
            // En transferencias, el folio es el número de la factura que se
            // paga: Conciliación lo compara con el concepto del SPEI.
            hint={hintFolioGasto(
              watch("medio_pago"),
              "Candado anti-duplicados: otro gasto con el mismo folio se rechaza.",
            )}
          >
            <Input
              className="font-mono"
              placeholder="Ej. 2622242310"
              {...register("folio_ticket")}
            />
          </Field>

          {watch("moneda") === "MXN" && (
            <Field
              label="Tipo de cambio (MXN por USD)"
              hint="Sin TC, el gasto queda fuera del balance USD del reparto (bloquea el pre-cierre)."
            >
              <Input
                type="number"
                step="0.000001"
                min="0"
                inputMode="decimal"
                placeholder="Ej. 18.50"
                {...register("tc_gasto")}
              />
            </Field>
          )}

          {cfg.conModos ? (
            // Bloque «Avión» con DOS modos (14-oct-2026): «Un avión» (o «Sin
            // avión» en Gasolina/Visita) y «Repartir entre aviones». Con
            // reparto guardado arranca en el RESUMEN; «Editar reparto» abre el
            // editor EN LÍNEA (sin diálogo anidado). Nada se escribe aquí: el
            // reparto viaja con el «Guardar» de siempre.
            <div ref={bloqueAvionRef} className="space-y-2" data-bloque-avion="">
              <Label
                className="text-sm font-medium"
                htmlFor={!enReparto && cfg.admiteAvion ? idAvion : undefined}
              >
                {ETIQUETA_CAMPO_AVION_MODOS}
              </Label>
              <div role="group" aria-label={ARIA_MODO_AVION} className="flex flex-wrap gap-1.5">
                <button
                  ref={botonUnoRef}
                  type="button"
                  aria-pressed={!enReparto}
                  title={tituloModoUno(categoriaForm)}
                  onClick={elegirUno}
                  disabled={pending}
                  className={claseModoAvion(!enReparto)}
                >
                  {cfg.etiquetaUno}
                </button>
                <button
                  ref={botonRepartoRef}
                  type="button"
                  aria-pressed={enReparto}
                  title={
                    cfg.repartoPermitido ? TITULO_MODO_REPARTO : (cfg.motivoSinReparto ?? undefined)
                  }
                  onClick={elegirReparto}
                  disabled={pending || !cfg.repartoPermitido || leyendoReparto}
                  className={claseModoAvion(enReparto)}
                >
                  {ETIQUETA_MODO_REPARTO}
                </button>
              </div>
              {leyendoReparto && (
                <p className="text-xs text-muted-foreground" data-reparto-leyendo="">
                  {TEXTO_LEYENDO_REPARTO}
                </p>
              )}
              {estadoRep === "LECTURA_FALLIDA" && (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                  role="status"
                  data-reparto-lectura-fallida=""
                >
                  <span>{TEXTO_FALLO_LECTURA_REPARTO}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 cursor-pointer text-xs"
                    onClick={() => {
                      // El aviso (y este botón) se desmonta: el foco queda en
                      // «Un avión», que no se desmonta mientras se lee.
                      releerReparto(false);
                      enfocarDespues(() => botonUnoRef.current);
                    }}
                    disabled={pending}
                  >
                    {BOTON_REINTENTAR}
                  </Button>
                </div>
              )}
              {/* Por qué no se puede repartir (con vuelo; con reparto
                  guardado lo explica el aviso de que se quitará). */}
              {!cfg.repartoPermitido && !repartoGuardado && cfg.motivoSinReparto && (
                <p className="text-xs text-muted-foreground" data-motivo-sin-reparto="">
                  {cfg.motivoSinReparto}
                </p>
              )}
              {enReparto ? (
                <>
                  {!repartoGuardado && (
                    <p
                      className="flex gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                      data-reparto-que-cambia=""
                    >
                      <InformationCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {textoQueCambiaAlRepartir({ categoria: categoriaForm, matriculaGuardada })}
                      </span>
                    </p>
                  )}
                  {categoriaForm === "FIJO" && (
                    <p
                      className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                      data-aviso-reparto-fijo=""
                    >
                      {AVISO_REPARTO_FIJO}
                    </p>
                  )}
                  {repartoGuardado && !editandoReparto ? (
                    <RepartoResumen
                      partes={repartoBase}
                      moneda={gasto.moneda}
                      techoCents={techoCents}
                      onEditar={abrirEditorReparto}
                      onQuitar={quitarRepartoDelResumen}
                      disabled={pending}
                    />
                  ) : (
                    <RepartoAvionesEditor
                      filas={cargandoAviones && !repartoGuardado ? null : filasReparto}
                      seleccion={repartoSel}
                      onSeleccion={cambiarSeleccionReparto}
                      techoCents={techoCents}
                      moneda={monedaReparto}
                      disabled={pending}
                      error={
                        falloAviones
                          ? textoFalloCargaAviones(repartoGuardado ? resumenBaseTexto : null)
                          : null
                      }
                      onReintentar={reintentarAviones}
                      idPrefijo={idReparto}
                      cargando={cargandoAviones && repartoGuardado}
                    />
                  )}
                  {notaMonto && (
                    <p
                      className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                      data-nota-monto-reparto=""
                    >
                      {notaMonto}
                    </p>
                  )}
                  {notaMesReparto && (
                    <p
                      className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                      data-nota-mes-reparto=""
                    >
                      {notaMesReparto}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {cfg.admiteAvion && (
                    <SearchableSelect
                      id={idAvion}
                      // Opción vacía REAL al frente (el Combobox solo dispara
                      // onChange con un item). Sin avión, un repartible es
                      // gasto de VuelaTour (no queda en la bandeja).
                      options={[
                        {
                          value: "",
                          label: cfg.repartoPermitido
                            ? OPCION_SIN_AVION_VUELATOUR
                            : ETIQUETA_MODO_SIN_AVION,
                        },
                        ...aircraft.map((a) => ({ value: a.id, label: a.matricula })),
                      ]}
                      value={watch("aeronave_id")}
                      onChange={elegirAvion}
                      placeholder="Sin asignar"
                    />
                  )}
                  {ayudaUno && (
                    <p className="text-xs text-muted-foreground" data-ayuda-modo-uno="">
                      {ayudaUno}
                    </p>
                  )}
                  {quitaReparto && motivoQuitar && (
                    <p
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                      role="status"
                      data-reparto-se-quita={motivoQuitar}
                    >
                      ⚠{" "}
                      {avisoRepartoSeQuita({
                        motivo: motivoQuitar,
                        resumen: resumenBaseTexto,
                        label: categoriaGastoLabel(categoriaForm),
                      })}
                    </p>
                  )}
                </>
              )}
            </div>
          ) : cfg.admiteAvion ? (
            // «(resuelve pendiente)» SOLO donde sin avión el gasto cuenta en
            // «Pendientes»; en la comisión que paga VuelaTour es referencia.
            <Field label={etiquetaCampoAvionSinModos(categoriaForm)}>
              <SearchableSelect
                // Opción vacía REAL al frente: el Combobox solo dispara
                // onChange con un item — sin ella era imposible deseleccionar
                // (con value "" el trigger muestra su label, no el
                // placeholder). Sin modos la categoría no se reparte: sin
                // avión = bandeja de pendientes.
                options={[
                  { value: "", label: ETIQUETA_MODO_SIN_AVION },
                  ...aircraft.map((a) => ({ value: a.id, label: a.matricula })),
                ]}
                value={watch("aeronave_id")}
                onChange={elegirAvion}
                placeholder="Sin asignar"
              />
            </Field>
          ) : (
            // Gasto personal del dueño: el guardado desliga el avión; un
            // selector cuya elección se tira sería un no-op mentiroso.
            <div className="space-y-1" data-avion-no-aplica="">
              <p className="text-sm font-medium">{ETIQUETA_CAMPO_AVION_MODOS}</p>
              <p className="text-xs text-muted-foreground">{HINT_AVION_PERSONAL}</p>
            </div>
          )}

          {/* Banner del reparto (falla parcial, otra persona lo cambió…):
              además del toast, porque el toast se va y esto dice qué quedó. */}
          {avisoReparto && (
            <div
              data-reparto-aviso={avisoReparto.codigo}
              role={avisoReparto.tipo === "error" ? "alert" : "status"}
              className={cn(
                "space-y-2 rounded-lg border px-3 py-2 text-xs",
                avisoReparto.tipo === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              <p>{avisoReparto.texto}</p>
              {avisoReparto.anterior !== undefined && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 cursor-pointer text-xs"
                  onClick={() => setConfirmarRegresar(avisoReparto.anterior ?? [])}
                  disabled={pending}
                >
                  {BOTON_REGRESAR_BANNER}
                </Button>
              )}
            </div>
          )}

          {/* Aviso del prellenado por matrícula: se oculta si la oficina
              elige otro avión (su elección manda). Solo en «Un avión». */}
          {!enReparto && prefillAvion && watch("aeronave_id") === prefillAvion.id && (
            <p className="rounded-lg border border-brand-600/40 bg-brand-600/10 px-3 py-2 text-xs text-brand-600">
              ✨ Prellenado por la matrícula del comprobante (
              <span className="font-mono font-medium">
                {prefillAvion.matricula}
              </span>
              ) — revisa y guarda.
            </p>
          )}

          {(() => {
            /* Cruce de matrícula: el recibo manda. Con avión elegido y
               distinto → advertencia (caso ASUR Mérida); SIN avión elegido
               → aviso con botón para tomar el del comprobante (caso
               Paywise: quedaba INDIRECTO sin avión). */
            const mIa = aiRaw?.matricula ??
              (gasto.valor_ia_extraido as { matricula?: unknown } | null)
                ?.matricula;
            if (!mIa || typeof mIa !== "string") return null;
            const delRecibo = avionPorMatricula(aircraft, mIa);
            if (!delRecibo) return null;
            // R12: en modo reparto no hay «Usar este avión»; solo se avisa si
            // la matrícula del comprobante no está entre los aviones marcados.
            if (enReparto) {
              const aviso = avisoMatriculaFueraDeReparto(
                delRecibo.matricula,
                resumenRep.incluidos.map((f) => f.matricula),
              );
              return aviso ? (
                <p
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
                  data-matricula-fuera-reparto=""
                >
                  ⚠ {aviso}
                </p>
              ) : null;
            }
            const sel = watch("aeronave_id");
            if (sel) {
              if (delRecibo.id === sel) return null;
              const asignada = aircraft.find((a) => a.id === sel);
              return (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  ⚠ El comprobante trae la matrícula{" "}
                  <span className="font-mono font-medium">{delRecibo.matricula}</span> pero el
                  gasto quedará en{" "}
                  <span className="font-mono font-medium">{asignada?.matricula ?? "otro avión"}</span>
                  . En cambios de avión a media jornada el recibo manda: corrige el avión si
                  aplica.
                </p>
              );
            }
            // Categorías sin avión siguen sin avión: el guardado desliga
            // con null explícito — sin chip que invite a ligarlo.
            if (
              watch("categoria") === "PERSONAL_DUENO" ||
              watch("categoria") === "GASOLINA" ||
              watch("categoria") === "VISITA"
            )
              return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                <span>
                  El comprobante trae la matrícula{" "}
                  <span className="font-mono font-medium">{delRecibo.matricula}</span>{" "}
                  y el gasto no tiene avión.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    // Acción humana explícita: levanta el veto de "Sin
                    // avión" — es el camino de vuelta tras limpiarlo.
                    setValue("aeronave_id", delRecibo.id);
                    avionLimpiado.current = false;
                  }}
                >
                  Usar este avión
                </Button>
              </div>
            );
          })()}

          {/* Asignación MANUAL del vuelo (±15 días de la fecha del gasto;
              90 días atrás con las dos «Comisión del vendedor»): cubre cuando la
              sugerencia automática no encuentra match o el gasto quedó
              ligado al vuelo equivocado. */}
          <Field
            label="Vuelo (asignar o corregir a mano)"
            required={esComision}
            hint={
              enReparto ? HINT_VUELO_EN_REPARTO : esComision ? HINT_VUELO_COMISION : undefined
            }
          >
            <SearchableSelect
              options={[
                // Sin «Sin vuelo» cuando la categoría lo exige.
                ...(esComision ? [] : [{ value: "", label: "Sin vuelo" }]),
                ...vuelos.map((v) => ({
                  value: v.id,
                  label: vueloCercanoLabel(v),
                })),
              ]}
              // Repartido entre aviones (R13): sin vuelo y deshabilitado (el
              // PATCH lo desliga); para ligarlo, «Un avión».
              value={enReparto ? "" : vueloSel}
              disabled={enReparto}
              onChange={(v) => {
                setVueloSel(v);
                // El avión del vuelo elegido se refleja de inmediato —
                // elección humana explícita: levanta el veto a la IA.
                const opt = vuelos.find((x) => x.id === v);
                if (opt?.aeronave_id) {
                  setValue("aeronave_id", opt.aeronave_id);
                  avionLimpiado.current = false;
                }
              }}
              placeholder="Busca por folio, matrícula o ruta"
            />
            {esVueloCancelado(vuelos, vueloSel) && (
              <VueloCanceladoHint className="mt-1" />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Categoría"
              // Línea 1: destino POR DEFAULT de la categoría (verde);
              // línea 2: a qué hoja cae con el vuelo/avión elegidos.
              hint={
                <CategoriaDestinoHint
                  categoria={watch("categoria")}
                  tieneVuelo={!!vueloSel}
                  tieneAvion={!!watch("aeronave_id")}
                  // Repartido: cae en el balance de CADA avión marcado
                  // (reparto manual) y lo no asignado en VuelaTour.
                  hoja={
                    enReparto
                      ? hojaDestinoReparto({
                          matriculas: resumenRep.incluidos.map((f) => f.matricula),
                          restoCents: resumenRep.restoCents,
                          moneda: monedaReparto,
                        })
                      : undefined
                  }
                />
              }
            >
              <SearchableSelect
                options={categoriaOptions}
                value={watch("categoria")}
                onChange={(v) => {
                  setValue("categoria", v);
                  // PERSONAL del dueño: sin vuelo, avión ni escala (candado
                  // del API) — se limpian aquí y el submit los DESLIGA con
                  // null explícito en el mismo PATCH.
                  if (v === "PERSONAL_DUENO" || v === "GASOLINA" || v === "VISITA") {
                    setValue("aeronave_id", "");
                    setVueloSel("");
                  }
                  // Sin vuelo pero el avión SÍ se conserva (SERVICIOS es del
                  // avión; en NOMINA es opcional): el submit desliga el vuelo
                  // con null explícito en el mismo PATCH.
                  if (v === "INDIRECTO" || v === "NOMINA" || v === "SERVICIOS") {
                    setVueloSel("");
                  }
                }}
                placeholder="Categoría"
              />
            </Field>
            {/* DOS opciones (14-sep-2026). Si el gasto trae el valor LEGADO
                VALE, `opcionesComprobante` agrega su opción oculta con ese
                mismo valor: guardar sin tocar el campo NO lo muta. */}
            <Field label="Comprobante" hint={AYUDA_COMPROBANTE}>
              <SearchableSelect
                options={opcionesComprobante(gasto.estatus_comprobante)}
                value={watch("estatus_comprobante")}
                onChange={(v) => setValue("estatus_comprobante", v)}
                placeholder="¿Trae comprobante?"
              />
            </Field>
          </div>

          {/* Las dos comisiones del vendedor (28-sep-2026 y 13-oct-2026): el
              cuadro de SU categoría dice quién la paga (VuelaTour o el avión)
              y, debajo, cómo cambiarlo reclasificando entre las dos (aun
              conciliado). Reclasificar aquí un «Otros gastos VuelaTour» CON
              vuelo también es el camino para corregir capturas previas (sale
              de «otros gastos»). */}
          {ayudaComision && (
            <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium">{ayudaComision.titulo}.</span>{" "}
              {ayudaComision.texto}
              <span className="mt-1 block">{AYUDA_RECLASIFICAR_COMISION}</span>
            </p>
          )}
          {/* TUA de oficina que se borraría al reclasificar fuera de
              Operaciones/Aterrizaje/FBO (revisión del lote 2): se dice aquí,
              bajo el selector, y el guardado pide confirmación. */}
          {tuaSeBorra?.motivo === "CATEGORIA" && (
            <p
              className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
              role="status"
              data-tua-se-borra="CATEGORIA"
            >
              {tuaSeBorra.texto}
            </p>
          )}
          {/* Reparto y categoría (R15): hacia una que no se reparte, el
              guardado quita el reparto (se confirma); entre dos que se
              reparten, las partes se quedan y solo cambia el renglón. */}
          {quitaReparto && motivoQuitar === "CATEGORIA" && (
            <p
              className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
              role="status"
              data-reparto-se-quita="CATEGORIA"
            >
              {lineaCategoriaQuitaReparto(categoriaGastoLabel(categoriaForm))}
            </p>
          )}
          {notaCategoriaReparto && (
            <p
              className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
              data-nota-categoria-reparto=""
            >
              {notaCategoriaReparto}
            </p>
          )}
          {/* Comisariato (13-oct-2026): reclasificar aquí un «Otros gastos
              VuelaTour» CON vuelo a «Comisariato» es el camino manual para
              las capturas viejas de snacks/bebidas de pasajeros (sale de
              «otros gastos» y entra a la columna OTROS del vuelo). */}
          {watch("categoria") === CATEGORIA_COMISARIATO && (
            <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium">Comisariato.</span> {AYUDA_COMISARIATO}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Facturación (oficina)">
              <SearchableSelect
                options={FACTURACION}
                value={watch("estatus_facturacion")}
                onChange={(v) => setValue("estatus_facturacion", v)}
                placeholder="Estatus"
              />
            </Field>
            <Field
              label="Medio de pago"
              // «Pago domiciliado» (13-oct-2026): qué es y cómo se concilia.
              hint={ayudaMedioPago(watch("medio_pago")) ?? undefined}
            >
              <SearchableSelect
                options={opcionesMedioVerificacion(gasto.medio_pago)}
                value={watch("medio_pago")}
                onChange={(v) => setValue("medio_pago", v)}
                placeholder="Medio"
              />
            </Field>
            {watch("medio_pago") === "TARJETA_CORP" && (
              /* El server sella la tarjeta ASIGNADA al capturador; aquí
                 oficina ve/corrige con cuál se pagó de verdad. */
              <Field label="Tarjeta corp.">
                <SearchableSelect
                  options={cardOptions.map((c) => ({
                    value: c.terminacion,
                    label: `**** ${c.terminacion} · ${c.nombre_titular}`,
                  }))}
                  value={watch("tarjeta_terminacion") ?? ""}
                  onChange={(v) => setValue("tarjeta_terminacion", v)}
                  placeholder="Sin registrar"
                />
              </Field>
            )}
            <Field label="Proveedor">
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="Sin proveedor"
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>

        {/* Confirmación breve antes de quitar el sello (regla de la casa). */}
        <AlertDialog open={openRetirar} onOpenChange={setOpenRetirar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Retirar la confirmación?</AlertDialogTitle>
              <AlertDialogDescription>
                El gasto vuelve a quedar como no confirmado; oficina tendrá que
                confirmarlo de nuevo (guardar este formulario lo confirma).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={retirando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  retirarConfirmacion();
                }}
                disabled={retirando}
              >
                {retirando ? "Retirando…" : "Retirar confirmación"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmación de fecha sospechosa (auditoría 29-ago): solo cuando
            la oficina CAMBIÓ la fecha a > 60 días atrás o > 2 días a futuro. */}
        <AlertDialog
          open={confirmarFecha !== null}
          onOpenChange={(o) => {
            if (!o) setConfirmarFecha(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirma la fecha del gasto</AlertDialogTitle>
              <AlertDialogDescription>
                La fecha es del{" "}
                <span className="font-medium">
                  {confirmarFecha
                    ? fechaGastoLegible(confirmarFecha.fecha_gasto)
                    : ""}
                </span>{" "}
                ({confirmarFecha
                  ? fechaGastoDistancia(confirmarFecha.fecha_gasto)
                  : ""}
                ), ¿es correcta? Con la fecha equivocada — típico un ticket
                leído con otro año — el gasto queda fuera de todos los cortes
                mensuales.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Revisar la fecha</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const values = confirmarFecha;
                  setConfirmarFecha(null);
                  if (values) continuarGuardado(values);
                }}
              >
                Sí, la fecha es correcta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Borrar la TUA de OFICINA confirma (regla de la casa; revisión del
            lote 2, 14-oct-2026): reclasificar fuera de Operaciones/
            Aterrizaje/FBO o cambiar la moneda sin reescribirla. */}
        <AlertDialog
          open={confirmarTua !== null}
          onOpenChange={(o) => {
            if (!o) setConfirmarTua(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{TITULO_CONFIRMAR_BORRAR_TUA}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmarTua ? `${confirmarTua.texto}${COLA_CONFIRMAR_BORRAR_TUA}` : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{BOTON_REVISAR_TUA}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const pendiente = confirmarTua;
                  setConfirmarTua(null);
                  if (pendiente) guardarVerificacion(pendiente.values);
                }}
              >
                {BOTON_CONFIRMAR_BORRAR_TUA}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* La UNA confirmación del reparto (regla del cliente: lo destructivo
            confirma, en cualquier mes): quitarlo, bajar o sacar a un avión,
            sustituir al avión guardado o el primer reparto de un FIJO. Sigue
            abierta con «Guardando…» mientras dura el guardado. Va DENTRO del
            DialogContent: Esc cierra solo la confirmación. */}
        <AlertDialog
          open={confirmarReparto !== null && !(guardandoReparto && !pending)}
          onOpenChange={(o) => {
            if (!o) {
              setConfirmarReparto(null);
              setGuardandoReparto(false);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmarReparto?.titulo ?? ""}</AlertDialogTitle>
              <AlertDialogDescription>
                {(confirmarReparto?.parrafos ?? []).map((p, i) => (
                  <span key={i} className={i > 0 ? "mt-2 block" : "block"}>
                    {p}
                  </span>
                ))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{BOTON_REVISAR}</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={() => {
                  const p = confirmarReparto;
                  setGuardandoReparto(true);
                  if (p) continuarGuardado(p.values, { reparto: true });
                }}
              >
                {pending ? GUARDANDO : (confirmarReparto?.boton ?? "")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* «Regresar el reparto anterior» (banner de una falla parcial):
            mueve dinero entre aviones y VuelaTour, así que confirma. */}
        <AlertDialog
          open={confirmarRegresar !== null}
          onOpenChange={(o) => {
            if (!o) setConfirmarRegresar(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{TITULO_REGRESAR_REPARTO}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmarRegresar
                  ? textoConfirmarRegresar(resumenRepartoTexto(confirmarRegresar, gasto.moneda))
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const anterior = confirmarRegresar;
                  setConfirmarRegresar(null);
                  if (anterior) regresarReparto(anterior);
                }}
              >
                {BOTON_REGRESAR}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Quitar una hoja GUARDADA confirma (regla de la casa). */}
        <AlertDialog
          open={hojaAQuitar !== null}
          onOpenChange={(o) => {
            if (!o) setHojaAQuitar(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{TITULO_QUITAR_HOJA}</AlertDialogTitle>
              <AlertDialogDescription>{TEXTO_QUITAR_HOJA}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const p = hojaAQuitar;
                  setHojaAQuitar(null);
                  if (p) setHojas((prev) => prev.filter((x) => x !== p));
                }}
              >
                {BOTON_QUITAR_HOJA}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}


function defaults(g: Gasto): GastoVerifyValues {
  // El formulario separa ticket y propina; en BD monto = TOTAL PAGADO
  // (ticket + propina), así que el ticket mostrado = monto − propina.
  const propina = Number(g.propina ?? 0);
  const ticket =
    g.monto != null ? Math.round((Number(g.monto) - propina) * 100) / 100 : null;
  return {
    monto: ticket != null ? String(ticket) : "",
    propina: propina > 0 ? String(propina) : "",
    litros: g.litros != null ? String(g.litros) : "",
    tipo_combustible: g.tipo_combustible ?? "",
    lugar: g.lugar ?? "",
    moneda: g.moneda ?? "MXN",
    // fecha_gasto es columna date (YYYY-MM-DD, sin zona) — el corte por 10
    // chars aquí no es el slice prohibido de timestamps.
    fecha_gasto: (g.fecha_gasto ?? "").slice(0, 10),
    categoria: g.categoria,
    tarjeta_terminacion: g.tarjeta_terminacion ?? "",
    medio_pago: g.medio_pago,
    estatus_comprobante: g.estatus_comprobante,
    // Gastos previos a la migración: sin campo = Pendiente (conservador).
    estatus_facturacion: g.estatus_facturacion ?? "PENDIENTE",
    aeronave_id: g.aeronave_id ?? "",
    proveedor_id: g.proveedor_id ?? "",
    folio_ticket: g.folio_ticket ?? "",
    tc_gasto: g.tc_gasto != null ? String(g.tc_gasto) : "",
    notas: g.notas ?? "",
    // Vacío = usar la lectura de la IA (o el API aún no trae la columna).
    tua_incluida: valorFormTuaIncluida(g),
  };
}
