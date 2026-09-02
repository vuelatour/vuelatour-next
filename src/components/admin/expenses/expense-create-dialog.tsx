"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  PlusIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createGastoAction,
  buscarVuelosCercanosAction,
  leerFacturaIAAction,
  listAvionesActivosAction,
  type GastoTicketIA,
  type VueloCercano,
} from "@/app/admin/expenses/actions";
import { uploadGastoComprobante } from "@/lib/storage/gasto-fotos";
import type { GastoCreateValues } from "@/app/admin/expenses/schema";
import {
  listCardsOptionsAction,
  type CardOption,
} from "@/app/admin/users/actions";
import { Field } from "@/components/admin/form-field";
import {
  VueloCanceladoHint,
  esVueloCancelado,
  vueloCercanoLabel,
} from "@/components/admin/expenses/vuelo-cancelado-hint";
import {
  fechaGastoAntigua,
  fechaGastoDistancia,
  fechaGastoLegible,
  fechaGastoSospechosa,
} from "@/lib/admin/fecha-gasto";
import { avionPorMatricula } from "@/lib/admin/matricula";
import {
  CATEGORIAS_REPARTIBLES,
  categoriaGastoLabel,
  hojaDestinoGasto,
} from "@/lib/admin/categorias-gasto";
import { cn } from "@/lib/utils";

const TIPOS_FACTURA = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

// Etiquetas desde la FUENTE ÚNICA (@/lib/admin/categorias-gasto); aquí solo
// vive el ORDEN del select. Semántica de cada categoría: ver ese archivo.
const CATEGORIAS = [
  "GAS",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  // Honorario del freelance que voló el avión (doc 3.7): resta en el reparto
  // como gasto directo del vuelo.
  "PILOTO_EXTERNO",
  // Sin vuelo (avión opcional): INDIRECTO/NOMINA; SERVICIOS es del avión.
  "INDIRECTO",
  "NOMINA",
  "SERVICIOS",
  // Sin vuelo NI avión: gasolina de coches y gasto personal del dueño
  // (fuera de balances/reparto/pre-cierre).
  "GASOLINA",
  "PERSONAL_DUENO",
  "OTRO",
  // FIJO y VISITA son LEGADO: ya no se capturan (fuente única conserva sus
  // etiquetas para pintar gastos históricos).
].map((value) => ({ value, label: categoriaGastoLabel(value) }));

const MEDIOS = [
  { value: "TRANSFERENCIA", label: "Transferencia" },
  // Plataforma de pago de servicios aeroportuarios (recibos Paywise).
  { value: "PAYWISE", label: "Paywise" },
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "PERSONAL_PABLO", label: "Dinero personal Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal Ale" },
];

const ESTATUS = [
  { value: "SIN_COMPROBANTE", label: "Sin comprobante (factura por llegar)" },
  { value: "FACTURA", label: "Factura" },
  { value: "VALE", label: "Vale (sin factura)" },
];

// Seguimiento de oficina "¿ya lo facturé?" — independiente del comprobante.
const FACTURACION = [
  { value: "PENDIENTE", label: "🔴 Pendiente de facturar" },
  { value: "SOLICITADA", label: "🟡 Factura solicitada" },
  { value: "FACTURADA", label: "🟢 Facturada" },
];

/** Hoy en hora Cancún (UTC−5 fija) para el default del formulario. */
function hoyCancun(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function emptyValues(defaults?: {
  vueloId?: string;
  aeronaveId?: string;
  categoria?: string;
}): GastoCreateValues {
  return {
    categoria: defaults?.categoria ?? "OPERACIONES",
    monto: "",
    propina: "",
    litros: "",
    moneda: "MXN",
    fecha_gasto: hoyCancun(),
    medio_pago: "TRANSFERENCIA",
    tarjeta_terminacion: "",
    estatus_comprobante: "SIN_COMPROBANTE",
    estatus_facturacion: "PENDIENTE",
    aeronave_id: defaults?.aeronaveId ?? "",
    vuelo_id: defaults?.vueloId ?? "",
    proveedor_id: "",
    folio_ticket: "",
    tc_gasto: "",
    notas: "",
  };
}

/** Alta manual de gasto operativo desde el panel (lo sube administración). */
export function ExpenseCreateDialog({
  aircraft,
  providers,
  defaultVueloId,
  defaultVueloFolio,
  defaultVueloCancelado = false,
  defaultAeronaveId,
  defaultCategoria,
  defaultPilotoNombre,
}: {
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Con vuelo: el gasto queda LIGADO (reporte por vuelo, reparto, pre-cierre). */
  defaultVueloId?: string;
  defaultVueloFolio?: number;
  /** El vuelo prefijado está CANCELADO: el gasto se acepta igual (regla
      28-ago) y solo se avisa que cuenta en el balance. */
  defaultVueloCancelado?: boolean;
  defaultAeronaveId?: string;
  defaultCategoria?: string;
  /** Piloto del vuelo prefijado (para "simular como piloto"). null = sin piloto. */
  defaultPilotoNombre?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Candado de fechas (auditoría 29-ago: gastos con año 2025 fuera de todos
  // los cortes): valores del form esperando la confirmación explícita de
  // una fecha sospechosa (> 60 días atrás o > 2 días a futuro).
  const [confirmarFecha, setConfirmarFecha] = useState<GastoCreateValues | null>(
    null,
  );
  // Backfill de oficina: guardar el gasto COMO SI lo subiera el piloto del
  // vuelo (mismo switch que la app). Solo con un vuelo LIGADO.
  const [comoPiloto, setComoPiloto] = useState(false);
  // Factura/recibo adjunto (foto o PDF): se sube al bucket privado al guardar.
  const [factura, setFactura] = useState<File | null>(null);
  const facturaRef = useRef<HTMLInputElement>(null);
  // Lectura IA del adjunto: autollenado best-effort (siempre revisable a mano).
  const [leyendoIA, setLeyendoIA] = useState(false);
  const [aiRaw, setAiRaw] = useState<GastoTicketIA | null>(null);
  // El usuario LIMPIÓ el avión a mano ("Sin avión"): la IA ya no lo re-impone
  // (ni al re-subir la foto ni en reanálisis); el chip "Usar este avión"
  // sigue disponible como camino de vuelta EXPLÍCITO. Ref (no state): lo leen
  // closures/effects siempre al día, sin re-render (nada lo pinta) y sin
  // heredar el veto a un alta posterior (se resetea al abrir/guardar/cerrar —
  // reset(emptyValues) no limpia refs ni useState).
  const avionLimpiado = useRef(false);
  // ===== Reparto entre aviones desde la captura (gasto general sin vuelo ni
  // avión de categoría repartible): mismo patrón del RepartoDialog de Otros
  // gastos — al guardar se encadena el PUT de reparto existente.
  const [repartirActivo, setRepartirActivo] = useState(false);
  const [repartoSel, setRepartoSel] = useState<
    Record<string, { incluir: boolean; monto: string }>
  >({});
  // Aviones ACTIVOS del reparto (null = aún sin cargar). NO la prop aircraft:
  // esa incluye inactivos y el PUT del API los rechaza.
  const [avionesReparto, setAvionesReparto] = useState<Array<{
    id: string;
    matricula: string;
    modelo: string;
  }> | null>(null);
  // Tarjetas del catálogo para "¿con qué tarjeta?" (solo medio TARJETA_CORP;
  // vacío = el server sella la asignada a quien captura).
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
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
  const [arrastrando, setArrastrando] = useState(false);
  // Vuelos alrededor de la fecha del gasto (±15 días), para dejarlo LIGADO al
  // vuelo desde el alta — pedido del cliente: los gastos viven en su vuelo.
  const [vuelos, setVuelos] = useState<VueloCercano[]>([]);
  const formDefaults = {
    vueloId: defaultVueloId,
    aeronaveId: defaultAeronaveId,
    categoria: defaultCategoria,
  };
  // Vuelo prefijado (alta desde el detalle) SIN piloto: no se puede atribuir.
  const vueloSinPiloto = !!defaultVueloId && !defaultPilotoNombre;
  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoCreateValues>({
    defaultValues: emptyValues(formDefaults),
  });

  const fechaGasto = watch("fecha_gasto");
  useEffect(() => {
    // Con vuelo prefijado (alta desde el detalle del vuelo) no hace falta lista.
    if (!open || defaultVueloId) return;
    let cancel = false;
    buscarVuelosCercanosAction(fechaGasto).then((res) => {
      if (!cancel && res.ok && res.data) setVuelos(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open, defaultVueloId, fechaGasto]);

  // ===== Reparto en la captura: solo un gasto general SIN vuelo NI avión de
  // categoría repartible (fuente única CATEGORIAS_REPARTIBLES, sincronizada
  // con la regla del API — el PUT rechaza cualquier otra cosa).
  const repartoDisponible =
    !defaultVueloId &&
    !watch("vuelo_id") &&
    !watch("aeronave_id") &&
    CATEGORIAS_REPARTIBLES.has(watch("categoria"));
  // Total pagado EN VIVO (ticket + propina) en centavos: techo del reparto —
  // es el monto que se guarda y el que llega al banco.
  const totalPagadoCents = (() => {
    const t = Number(watch("monto"));
    const p = Number(watch("propina"));
    return Math.round(
      ((Number.isFinite(t) ? t : 0) + (Number.isFinite(p) ? p : 0)) * 100,
    );
  })();
  const repartoIncluidos = (avionesReparto ?? []).filter(
    (a) => repartoSel[a.id]?.incluir,
  );
  const repartoSumaCents = repartoIncluidos.reduce((acc, a) => {
    const n = Number(repartoSel[a.id]?.monto);
    return acc + (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
  }, 0);
  const repartoExcedido = repartoSumaCents > totalPagadoCents;
  const repartoSinMonto = repartoIncluidos.filter(
    (a) => !(Number(repartoSel[a.id]?.monto) > 0),
  );

  /** Centavos → moneda del formulario, formato es-MX. */
  const fmtCents = (cents: number) =>
    (cents / 100).toLocaleString("es-MX", {
      style: "currency",
      currency: watch("moneda") === "USD" ? "USD" : "MXN",
    });

  const activarReparto = (on: boolean) => {
    setRepartirActivo(on);
    if (on && avionesReparto === null) {
      void listAvionesActivosAction().then((res) => {
        if (res.ok && res.data) {
          setAvionesReparto(res.data);
        } else {
          toast.error(res.error ?? "No se pudieron cargar los aviones activos");
          setRepartirActivo(false);
        }
      });
    }
  };

  /** Partes iguales sobre el TOTAL PAGADO con disciplina de centavos: base =
   *  round(total/n) y el PRIMERO absorbe el residuo (patrón RepartoDialog). */
  const dividirIguales = () => {
    const n = repartoIncluidos.length;
    if (n === 0) {
      toast.error("Marca primero los aviones entre los que se divide");
      return;
    }
    const base = Math.round(totalPagadoCents / n);
    const primero = totalPagadoCents - base * (n - 1);
    setRepartoSel((s) => {
      const next = { ...s };
      repartoIncluidos.forEach((a, i) => {
        next[a.id] = {
          incluir: true,
          monto: ((i === 0 ? primero : base) / 100).toFixed(2),
        };
      });
      return next;
    });
  };

  // Si el gasto deja de ser repartible (se ligó vuelo/avión o cambió la
  // categoría — a mano O por la IA), el bloque de reparto se limpia CON
  // AVISO: un reparto armado que sobrevive escondido repartiría en falso.
  useEffect(() => {
    if (repartoDisponible || !repartirActivo) return;
    setRepartirActivo(false);
    setRepartoSel({});
    toast.info(
      "Se quitó el reparto entre aviones: solo aplica a gastos sin vuelo ni avión de categoría repartible.",
    );
  }, [repartoDisponible, repartirActivo]);

  const aplicarIA = (ai: GastoTicketIA) => {
    const llenado: string[] = [];
    if (ai.monto != null && ai.monto > 0) {
      // ai.monto = TOTAL del ticket. Si la IA leyó una propina impresa, se
      // separa: ticket = total − propina y la propina va a su campo (al
      // guardar se recompone el total, que es lo que llega al banco).
      const propinaIA =
        ai.propina != null && ai.propina > 0 && ai.propina < ai.monto ? ai.propina : null;
      if (propinaIA != null) {
        setValue("monto", String(Math.round((ai.monto - propinaIA) * 100) / 100));
        setValue("propina", String(propinaIA));
        llenado.push(`$${ai.monto} (incl. propina $${propinaIA})`);
      } else {
        setValue("monto", String(ai.monto));
        setValue("propina", "");
        llenado.push(`$${ai.monto}`);
      }
    }
    if (ai.moneda === "MXN" || ai.moneda === "USD") setValue("moneda", ai.moneda);
    if (ai.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ai.fecha)) {
      setValue("fecha_gasto", ai.fecha);
      llenado.push(ai.fecha);
    }
    // La categoría prefijada por la pantalla (Gastos personales, pistas)
    // MANDA sobre la sugerencia de la IA: pisarla convertiría un gasto
    // personal del dueño en gasto de empresa en silencio.
    if (
      !defaultCategoria &&
      ai.categoria_sugerida &&
      CATEGORIAS.some((c) => c.value === ai.categoria_sugerida)
    ) {
      setValue("categoria", ai.categoria_sugerida);
      llenado.push(ai.categoria_sugerida);
    }
    // Litros del ticket de combustible: sin ellos el balance no calcula el
    // precio por litro (caso vuelo #70: gas capturado sin litros).
    if (ai.litros != null && ai.litros > 0) {
      setValue("litros", String(ai.litros));
      llenado.push(`${ai.litros} L`);
    }
    if (ai.medio_pago && MEDIOS.some((m) => m.value === ai.medio_pago)) {
      setValue("medio_pago", ai.medio_pago);
    }
    // Proveedor: match laxo contra el catálogo por nombre.
    if (ai.folio && !watch("folio_ticket")) {
      setValue("folio_ticket", String(ai.folio).slice(0, 60));
      llenado.push("folio");
    }
    if (ai.proveedor) {
      const needle = ai.proveedor.toLowerCase();
      const match = providers.find(
        (p) =>
          p.nombre.toLowerCase().includes(needle) || needle.includes(p.nombre.toLowerCase()),
      );
      if (match) {
        setValue("proveedor_id", match.id);
        llenado.push(match.nombre);
      }
    }
    // Matrícula leída → avión (solo si el vuelo no lo fijó ya). JAMÁS si el
    // usuario limpió el avión a mano ("Sin avión"): la IA no pisa esa
    // decisión ni al re-subir la foto — el chip "Usar este avión" queda como
    // camino de vuelta explícito. JAMÁS a un gasto personal del dueño: el
    // campo Avión está oculto y el valor invisible haría fallar el guardado
    // sin forma de corregirlo.
    if (
      ai.matricula &&
      !avionLimpiado.current &&
      !watch("aeronave_id") &&
      watch("categoria") !== "PERSONAL_DUENO" &&
      watch("categoria") !== "GASOLINA" &&
      watch("categoria") !== "VISITA"
    ) {
      // Normalización única (caso Paywise: "N621TX" no cruzaba con el
      // catálogo solo quitando guiones y el gasto quedaba sin avión).
      const av = avionPorMatricula(aircraft, ai.matricula);
      if (av) setValue("aeronave_id", av.id);
    }
    const notas: string[] = [];
    if (ai.concepto) notas.push(ai.concepto);
    if (ai.proveedor && !providers.some((p) => p.nombre.toLowerCase() === ai.proveedor!.toLowerCase()))
      notas.push(`Proveedor: ${ai.proveedor}`);
    if (ai.matricula) notas.push(`Matrícula: ${ai.matricula}`);
    if (notas.length > 0 && !watch("notas")) setValue("notas", notas.join(" · "));
    toast.success(
      llenado.length > 0
        ? `IA leyó la factura: ${llenado.join(" · ")}. Revisa antes de guardar.`
        : "IA leyó la factura; revisa los campos.",
    );
  };

  const leerConIA = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.info("Archivo muy grande para la lectura IA (máx 8 MB); captura manual.");
      return;
    }
    setLeyendoIA(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsDataURL(file);
      });
      const esExcel =
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "text/csv";
      const res = await leerFacturaIAAction(
        file.type === "application/pdf"
          ? { pdfBase64: b64 }
          : esExcel
            ? { excelBase64: b64, excelFilename: file.name }
            : { imageBase64: b64, mediaType: file.type },
      );
      if (!res.ok || !res.data) {
        toast.info(`La IA no pudo leer la factura${res.error ? `: ${res.error}` : ""}; captura manual.`);
        return;
      }
      if (!res.data.disponible || !res.data.legible) {
        toast.info(
          res.data.motivo
            ? `IA no disponible: ${res.data.motivo}`
            : "La factura no se distingue bien; captura manual.",
        );
        return;
      }
      setAiRaw(res.data);
      aplicarIA(res.data);
    } finally {
      setLeyendoIA(false);
    }
  };

  const seleccionarFactura = (file: File | null) => {
    if (file && !TIPOS_FACTURA.includes(file.type)) {
      toast.error(
        `Formato no soportado (${file.type || "desconocido"}). Usa foto (JPG/PNG/WebP), PDF, Excel (.xlsx) o CSV.`,
      );
      return;
    }
    setFactura(file);
    setAiRaw(null);
    // OJO: adjuntar archivo NO auto-marca la facturación — un ticket JPG
    // también se adjunta aquí y "archivo = facturado" es la misma señal
    // contaminada que se descartó en la app. Jamás afirmar facturado en
    // falso: la oficina lo marca en el select si de verdad es la factura.
    if (file && watch("estatus_comprobante") === "SIN_COMPROBANTE") {
      setValue("estatus_comprobante", "FACTURA");
    }
    if (!file && watch("estatus_comprobante") === "FACTURA") {
      setValue("estatus_comprobante", "SIN_COMPROBANTE");
    }
    if (file) void leerConIA(file);
  };

  /** Guardado real (fecha ya validada o confirmada por el usuario). */
  const guardarGasto = (values: GastoCreateValues) => {
    startTransition(async () => {
      // monto guardado = TOTAL PAGADO (ticket + propina): es lo que llega al
      // banco y lo que usan reparto/reportes/conciliación. La propina queda
      // aparte como sub-parte informativa.
      const ticket = Number(values.monto);
      const propina = values.propina === "" ? 0 : Number(values.propina);
      if (!(ticket > 0)) {
        toast.error("Captura el monto del ticket.");
        return;
      }
      if (!(propina >= 0)) {
        toast.error("La propina no es válida.");
        return;
      }
      const totalPagado = Math.round((ticket + propina) * 100) / 100;
      // Cinturón: un PERSONAL del dueño jamás manda vuelo/avión aunque algún
      // valor viejo (elegido antes de cambiar la categoría) siga en el form.
      if (
        values.categoria === "PERSONAL_DUENO" ||
        values.categoria === "GASOLINA" ||
        values.categoria === "VISITA"
      ) {
        values.vuelo_id = "";
        values.aeronave_id = "";
      }
      // Sin vuelo (el avión SÍ se conserva): mismo cinturón contra un vuelo
      // elegido antes de cambiar la categoría.
      if (
        values.categoria === "INDIRECTO" ||
        values.categoria === "NOMINA" ||
        values.categoria === "SERVICIOS"
      ) {
        values.vuelo_id = "";
      }
      // Reparto entre aviones armado en el diálogo: se valida ANTES de subir
      // nada. Cinturón: solo aplica si el gasto sigue siendo repartible
      // (sin vuelo ni avión, categoría del set sincronizado con el API).
      let repartoItems: Array<{ aeronave_id: string; monto: number }> | undefined;
      if (
        repartirActivo &&
        !values.vuelo_id &&
        !values.aeronave_id &&
        CATEGORIAS_REPARTIBLES.has(values.categoria)
      ) {
        const incluidos = (avionesReparto ?? []).filter(
          (a) => repartoSel[a.id]?.incluir,
        );
        if (incluidos.length === 0) {
          toast.error(
            'Marca los aviones del reparto (o apaga "Repartir entre aviones").',
          );
          return;
        }
        const sinMonto = incluidos.filter(
          (a) => !(Number(repartoSel[a.id]?.monto) > 0),
        );
        if (sinMonto.length > 0) {
          toast.error(
            `Captura el monto de ${sinMonto.map((a) => a.matricula).join(", ")} (o desmárcalos).`,
          );
          return;
        }
        // Σ en CENTAVOS enteros contra el TOTAL PAGADO (ticket + propina):
        // es el monto que se guarda; jamás flotantes.
        const totalCents = Math.round(totalPagado * 100);
        const sumaCents = incluidos.reduce(
          (acc, a) => acc + Math.round(Number(repartoSel[a.id].monto) * 100),
          0,
        );
        if (sumaCents > totalCents) {
          toast.error(
            "El reparto se pasa del total pagado — ajusta los montos (lo no asignado queda como gasto de VuelaTour).",
          );
          return;
        }
        repartoItems = incluidos.map((a) => ({
          aeronave_id: a.id,
          monto: Math.round(Number(repartoSel[a.id].monto) * 100) / 100,
        }));
      }
      // Primero el archivo: si la subida falla, no se crea el gasto a medias.
      let fotoPath = "";
      if (factura) {
        try {
          fotoPath = await uploadGastoComprobante(factura);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo subir la factura");
          return;
        }
      }
      // "Como piloto" solo aplica con un vuelo ligado y con piloto.
      const aplicarComoPiloto = comoPiloto && !!values.vuelo_id && !vueloSinPiloto;
      const litros =
        values.categoria === "GAS" && values.litros !== ""
          ? Number(values.litros)
          : undefined;
      if (litros !== undefined && !(litros > 0)) {
        toast.error("Los litros no son válidos.");
        return;
      }
      const result = await createGastoAction(
        {
          ...values,
          monto: totalPagado,
          propina,
          litros,
          foto_url: fotoPath,
          valor_ia_extraido: aiRaw ? ({ ...aiRaw } as Record<string, unknown>) : undefined,
          capturar_como_piloto: aplicarComoPiloto,
          // > 365 días atrás: SOLO se llega aquí tras la confirmación
          // explícita del diálogo — el API exige este candado para fechas de
          // otro año (auditoría 29-ago). No se manda en el caso normal.
          ...(fechaGastoAntigua(values.fecha_gasto)
            ? { permitir_fecha_antigua: true }
            : {}),
        },
        repartoItems,
      );
      if (result.ok) {
        if (result.repartoError) {
          // El gasto SÍ se creó pero el reparto no se aplicó: estado
          // recuperable A PROPÓSITO (no se borra nada — candados de dinero).
          // Sin vuelo y de categoría repartible, no cae a la bandeja: vive en
          // Otros gastos como "VuelaTour (sin asignar)" con botón Repartir.
          toast.warning(
            `El gasto se creó SIN repartir: repártelo desde Otros gastos (o menú ⋯ → Repartir). Motivo: ${result.repartoError}`,
            { duration: 10000 },
          );
        } else {
          toast.success(
            repartoItems
              ? `Gasto registrado y repartido entre ${repartoItems.length} ${
                  repartoItems.length === 1 ? "avión" : "aviones"
                }`
              : aplicarComoPiloto
                ? "Gasto registrado como del piloto del vuelo"
                : factura
                  ? "Gasto registrado con su factura"
                  : "Gasto registrado",
          );
        }
        setFactura(null);
        setAiRaw(null);
        setComoPiloto(false);
        // reset(emptyValues) NO limpia estos: a mano, o el siguiente alta
        // hereda el veto a la IA y un reparto armado.
        avionLimpiado.current = false;
        setRepartirActivo(false);
        setRepartoSel({});
        if (facturaRef.current) facturaRef.current.value = "";
        reset(emptyValues(formDefaults));
        setOpen(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  };

  const onSubmit = handleSubmit((values) => {
    // Fecha sospechosa (> 60 días atrás o > 2 días a futuro): casi siempre
    // es el año equivocado del ticket — confirmación explícita antes de
    // guardar; si es real, se guarda igual.
    if (fechaGastoSospechosa(values.fecha_gasto)) {
      setConfirmarFecha({ ...values });
      return;
    }
    guardarGasto(values);
  });

  // La IA llenó la fecha con OTRO año (caso real: tickets leídos "2025"):
  // campo en ámbar hasta que la oficina lo corrija — con el año equivocado
  // el gasto queda fuera de TODOS los cortes mensuales.
  const fechaIaOtroAnio =
    !!aiRaw?.fecha &&
    aiRaw.fecha === fechaGasto &&
    fechaGasto.slice(0, 4) !== hoyCancun().slice(0, 4);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          // Estado que reset(emptyValues) no cubre: se limpia en CADA
          // apertura (Cancelar cierra con setOpen directo, sin onOpenChange).
          avionLimpiado.current = false;
          setRepartirActivo(false);
          setRepartoSel({});
          setOpen(true);
        }}
        className="gap-2"
      >
        <PlusIcon className="h-4 w-4" />
        {defaultVueloId ? "Registrar gasto" : "Nuevo gasto"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setComoPiloto(false);
            avionLimpiado.current = false;
            setRepartirActivo(false);
            setRepartoSel({});
          }
        }}
      >
        {/* overflow-x-hidden: los nombres de archivo/inputs de fecha no deben
            provocar scroll horizontal (molesto con datos largos). */}
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Nuevo gasto (oficina)</DialogTitle>
            <DialogDescription>
              {defaultVueloId ? (
                <>
                  Se liga al vuelo{defaultVueloFolio != null ? ` #${defaultVueloFolio}` : ""}:
                  entra a su reporte y resta en el reparto (ej. honorario del piloto externo).
                  {defaultVueloCancelado && <VueloCanceladoHint className="mt-1" />}
                </>
              ) : (
                <>
                  Captura manual de un gasto operativo. Queda marcado como subido por
                  administración; si la factura llega después, se amarra en Facturas recibidas.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Zona IA: lo primero que se ve — arrastra la factura y la IA
                llena el gasto. El input oculto cubre el click. */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!leyendoIA && !factura) facturaRef.current?.click();
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !leyendoIA && !factura) {
                  e.preventDefault();
                  facturaRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!leyendoIA) setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                if (leyendoIA) return;
                const file = e.dataTransfer.files?.[0] ?? null;
                if (file) seleccionarFactura(file);
              }}
              className={cn(
                "rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors",
                arrastrando
                  ? "border-brand-500 bg-brand-500/15"
                  : leyendoIA
                    ? "border-brand-500/70 bg-brand-500/10 animate-pulse"
                    : factura
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "cursor-pointer border-brand-500/50 bg-brand-500/5 hover:border-brand-500 hover:bg-brand-500/10",
              )}
            >
              {leyendoIA ? (
                <div className="flex flex-col items-center gap-1.5">
                  <SparklesIcon className="h-8 w-8 animate-bounce text-brand-500" />
                  <p className="text-sm font-medium">Leyendo la factura con IA…</p>
                  <p className="text-xs text-muted-foreground truncate max-w-full">
                    {factura?.name}
                  </p>
                </div>
              ) : factura ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-500" />
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-medium">{factura.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {aiRaw
                        ? "La IA llenó los campos — revísalos antes de guardar."
                        : "Adjunta como comprobante (captura los datos a mano)."}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Quitar el archivo"
                    onClick={(e) => {
                      e.stopPropagation();
                      seleccionarFactura(null);
                    }}
                    className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <SparklesIcon className="h-8 w-8 text-brand-500" />
                  <p className="text-sm font-semibold">
                    Arrastra aquí la factura y la IA llena el gasto
                  </p>
                  <p className="text-xs text-muted-foreground">
                    o haz clic para elegirla · foto, PDF o Excel — monto, fecha,
                    categoría y proveedor se llenan solos
                  </p>
                </div>
              )}
            </div>
            {/* Desglose compuesto con la MISMA regla que se guardará en las
                notas (FBO/TUA con IVA): visible ANTES de guardar para que la
                oficina vea si la separación cuadró. */}
            {aiRaw && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                {aiRaw.desglose_lineas && aiRaw.desglose_lineas.length >= 2 ? (
                  <>
                    <p className="mb-1 font-medium">
                      Desglose leído (así se guardará en las notas):
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
                    gasto se guarda solo con el monto (revisa la factura si
                    esperabas Operación/FBO/TUA por separado).
                  </p>
                )}
              </div>
            )}
            <input
              ref={facturaRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,text/csv"
              className="hidden"
              onChange={(e) => {
                seleccionarFactura(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />

            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Monto del ticket">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  {...register("monto")}
                />
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

            {/* Litros: solo combustible. Sin ellos el balance por avión no
                calcula el precio por litro (queda en pendientes de captura). */}
            {watch("categoria") === "GAS" && (
              <Field
                label="Litros cargados"
                hint="Del ticket de combustible; el balance calcula $/litro con esto."
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
            )}

            {/* Total pagado EN VIVO (ticket + propina): es el monto que se
                guarda y el que aparece en el estado de cuenta del banco. */}
            <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
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
            </p>

            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
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
                    La IA leyó el año {fechaGasto.slice(0, 4)} en el ticket —
                    con el año equivocado el gasto queda fuera de todos los
                    cortes. Corrígela si no es real.
                  </p>
                )}
              </Field>
            </div>

            {watch("moneda") === "MXN" && (
              <Field
                label="Tipo de cambio (MXN por USD)"
                hint="Sin TC, el gasto queda fuera del balance USD del reparto y bloquea el pre-cierre."
              >
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="Ej. 18.50"
                  {...register("tc_gasto")}
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field
                label="Categoría"
                // ¿A qué hoja del balance cae? — reactivo a categoría, vuelo
                // y avión elegidos (fuente única hojaDestinoGasto).
                hint={`Cae en: ${hojaDestinoGasto(
                  watch("categoria"),
                  !!watch("vuelo_id"),
                  !!watch("aeronave_id"),
                )}`}
              >
                <SearchableSelect
                  // Un gasto DEL VUELO no puede ser indirecto (contradicción):
                  // la opción solo existe en el alta global.
                  options={
                    defaultVueloId
                      ? CATEGORIAS.filter(
                          (c) =>
                            c.value !== "INDIRECTO" &&
                            // Nómina y servicios del avión tampoco son de UN
                            // vuelo (van sin vuelo, con avión opcional).
                            c.value !== "NOMINA" &&
                            c.value !== "SERVICIOS" &&
                            // Un gasto DEL VUELO jamás es personal del dueño.
                            c.value !== "PERSONAL_DUENO" &&
                            // Un gasto DEL VUELO no es gasolina de coche.
                            c.value !== "GASOLINA",
                        )
                      : CATEGORIAS
                  }
                  value={watch("categoria")}
                  onChange={(v) => {
                    setValue("categoria", v);
                    // Sin vuelo: se limpia el enlace si lo había. El avión SÍ
                    // se conserva (SERVICIOS es del avión; en NOMINA es
                    // opcional).
                    if (
                      (v === "INDIRECTO" || v === "NOMINA" || v === "SERVICIOS") &&
                      watch("vuelo_id")
                    ) {
                      setValue("vuelo_id", "");
                      setComoPiloto(false);
                    }
                    // PERSONAL del dueño = sin vuelo NI avión (el API lo
                    // exige): se limpian ambos enlaces.
                    if (v === "PERSONAL_DUENO" || v === "GASOLINA" || v === "VISITA") {
                      if (watch("vuelo_id")) setValue("vuelo_id", "");
                      if (watch("aeronave_id")) setValue("aeronave_id", "");
                      setComoPiloto(false);
                    }
                  }}
                  placeholder="Categoría"
                />
              </Field>
              <Field label="Comprobante">
                <SearchableSelect
                  options={ESTATUS}
                  value={watch("estatus_comprobante")}
                  onChange={(v) => setValue("estatus_comprobante", v)}
                  placeholder="Estatus"
                />
              </Field>
              <Field label="Facturación (oficina)">
                <SearchableSelect
                  options={FACTURACION}
                  value={watch("estatus_facturacion")}
                  onChange={(v) => setValue("estatus_facturacion", v)}
                  placeholder="Estatus"
                />
              </Field>
            </div>

            {!defaultVueloId && watch("categoria") === "INDIRECTO" && (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Gasto <span className="font-medium">indirecto</span>: no se liga a
                ningún vuelo (avión opcional). Con avión cae en su hoja de
                Gastos indirectos; sin avión puede repartirse desde{" "}
                <span className="font-medium">Otros gastos</span>.
              </p>
            )}
            {!defaultVueloId && watch("categoria") === "NOMINA" && (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">Nómina</span>: sin vuelo; el avión
                es opcional (p. ej. piloto de un solo avión). Sin avión puede
                repartirse desde <span className="font-medium">Otros gastos</span>.
              </p>
            )}
            {!defaultVueloId && watch("categoria") === "SERVICIOS" && (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">Servicios (avión)</span>: servicio o
                mantenimiento de un avión sin vuelo. Elige el avión para que
                caiga en su hoja de Gastos indirectos.
              </p>
            )}
            {!defaultVueloId && watch("categoria") === "GASOLINA" && (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">Gasolina de vehículos</span>{" "}
                (coches/camionetas): gasto de la empresa, sin vuelo ni avión —
                vive en <span className="font-medium">Otros gastos</span> y ahí
                puede repartirse a aviones si hiciera falta. El combustible de
                aviación va en GAS.
              </p>
            )}
            {!defaultVueloId && watch("categoria") === "PERSONAL_DUENO" && (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Gasto <span className="font-medium">personal del dueño</span>:
                no es de la empresa ni de los aviones — no entra a balances,
                reparto ni cierre. Su seguimiento vive en la pantalla{" "}
                <span className="font-medium">Gastos personales</span>.
              </p>
            )}
            {!defaultVueloId &&
              watch("categoria") !== "INDIRECTO" &&
              watch("categoria") !== "NOMINA" &&
              watch("categoria") !== "SERVICIOS" &&
              watch("categoria") !== "PERSONAL_DUENO" &&
              watch("categoria") !== "GASOLINA" &&
              watch("categoria") !== "VISITA" && (
              <Field
                label="Vuelo"
                hint="Ligado al vuelo entra a su reporte y resta en el reparto; elige por folio, matrícula o ruta (±15 días de la fecha)."
              >
                <SearchableSelect
                  options={[
                    { value: "", label: "Sin vuelo" },
                    ...vuelos.map((v) => ({
                      value: v.id,
                      label: vueloCercanoLabel(v),
                    })),
                  ]}
                  value={watch("vuelo_id")}
                  onChange={(v) => {
                    setValue("vuelo_id", v);
                    // El avión del vuelo elegido se refleja de inmediato —
                    // elección humana explícita: levanta el veto a la IA.
                    const opt = vuelos.find((x) => x.id === v);
                    if (opt?.aeronave_id) {
                      setValue("aeronave_id", opt.aeronave_id);
                      avionLimpiado.current = false;
                    }
                    // Sin vuelo, "como piloto" no aplica.
                    if (!v) setComoPiloto(false);
                  }}
                  placeholder="Busca por folio, matrícula o ruta"
                />
                {esVueloCancelado(vuelos, watch("vuelo_id")) && (
                  <VueloCanceladoHint className="mt-1" />
                )}
              </Field>
            )}

            {/* Simular captura del piloto (backfill de oficina): solo con un
                vuelo LIGADO. Igual que el switch de la app. */}
            {(() => {
              const hayVuelo = !!watch("vuelo_id");
              if (!hayVuelo) return null;
              const sinPiloto = vueloSinPiloto;
              return (
                <div className="rounded-lg border border-border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium">
                      Simular operación como piloto
                    </Label>
                    <Switch
                      checked={comoPiloto && !sinPiloto}
                      disabled={sinPiloto}
                      onCheckedChange={setComoPiloto}
                    />
                  </div>
                  {sinPiloto ? (
                    <p className="text-xs text-amber-600">
                      Este vuelo no tiene piloto asignado; asígnalo para poder
                      registrarlo a su nombre.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Queda registrado como si lo hubiera subido el piloto del
                      vuelo, dentro de su operación
                      {comoPiloto && defaultPilotoNombre
                        ? ` (${defaultPilotoNombre})`
                        : ""}
                      . La auditoría conserva quién lo cargó en realidad.
                    </p>
                  )}
                </div>
              );
            })()}

            <div
              className={`grid gap-3 [&>*]:min-w-0 ${
                watch("categoria") === "PERSONAL_DUENO" ||
                watch("categoria") === "GASOLINA" ||
                watch("categoria") === "VISITA"
                  ? "grid-cols-1"
                  : "grid-cols-2"
              }`}
            >
              <Field label="Medio de pago">
                <SearchableSelect
                  options={MEDIOS}
                  value={watch("medio_pago")}
                  onChange={(v) => setValue("medio_pago", v)}
                  placeholder="Medio"
                />
              </Field>
              {watch("medio_pago") === "TARJETA_CORP" && (
                <Field
                  label="¿Con qué tarjeta?"
                  hint="vacío = la asignada a quien captura"
                >
                  <SearchableSelect
                    options={[
                      {
                        value: "",
                        label: "Automática (asignada al capturador)",
                      },
                      ...cardOptions.map((c) => ({
                        value: c.terminacion,
                        label: `**** ${c.terminacion} · ${c.nombre_titular}`,
                      })),
                    ]}
                    value={watch("tarjeta_terminacion") ?? ""}
                    onChange={(v) => setValue("tarjeta_terminacion", v)}
                    placeholder="Automática"
                  />
                </Field>
              )}
              {watch("categoria") !== "PERSONAL_DUENO" &&
                watch("categoria") !== "GASOLINA" &&
                watch("categoria") !== "VISITA" && (
                <Field label="Avión">
                  <SearchableSelect
                    // Opción vacía REAL al frente: el Combobox solo dispara
                    // onChange con un item — sin ella, deseleccionar el avión
                    // era imposible (con value "" el trigger muestra su label
                    // en vez del placeholder). "(se puede repartir)" SOLO
                    // cuando es verdad: gasto sin vuelo de categoría
                    // repartible — prometerlo en OPERACIONES/COMIDA… mentiría
                    // (esos caen a la bandeja de pendientes).
                    options={[
                      {
                        value: "",
                        label:
                          !defaultVueloId &&
                          !watch("vuelo_id") &&
                          CATEGORIAS_REPARTIBLES.has(watch("categoria"))
                            ? "Sin avión (se puede repartir)"
                            : "Sin avión",
                      },
                      ...aircraft.map((a) => ({ value: a.id, label: a.matricula })),
                    ]}
                    value={watch("aeronave_id")}
                    onChange={(v) => {
                      setValue("aeronave_id", v);
                      // Limpiar A MANO veta a la IA (no re-impone la
                      // matrícula en reanálisis ni re-subida); elegir un
                      // avión levanta el veto.
                      avionLimpiado.current = v === "";
                    }}
                    placeholder="Sin asignar"
                  />
                </Field>
              )}
            </div>

            {(() => {
              /* Cruce de matrícula: el recibo manda. Con avión elegido y
                 distinto → advertencia (caso ASUR Mérida); SIN avión elegido
                 → aviso con botón para tomar el del comprobante (caso
                 Paywise: el gasto quedaba INDIRECTO sin avión). */
              const mIa = aiRaw?.matricula;
              if (!mIa || typeof mIa !== "string") return null;
              const delRecibo = avionPorMatricula(aircraft, mIa);
              if (!delRecibo) return null;
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
              // Categorías sin avión: el campo está oculto y un valor
              // invisible rompería el guardado — sin chip.
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

            {/* Repartir entre aviones DESDE la captura: gasto general sin
                vuelo ni avión de categoría repartible. Mismo patrón (y
                disciplina de centavos) del diálogo Repartir de Otros gastos;
                al guardar se encadena el PUT de reparto existente. */}
            {repartoDisponible && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Repartir entre aviones al guardar
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Divide este gasto entre los aviones que elijas; lo no
                      asignado queda como gasto de la empresa VuelaTour.
                    </p>
                  </div>
                  <Switch
                    checked={repartirActivo}
                    onCheckedChange={activarReparto}
                  />
                </div>
                {repartirActivo &&
                  (avionesReparto === null ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      Cargando aviones activos…
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Marca los aviones y captura cuánto le toca a cada uno.
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-1.5 shrink-0"
                          onClick={dividirIguales}
                          disabled={pending || repartoIncluidos.length === 0}
                        >
                          <ArrowsRightLeftIcon className="h-4 w-4" />
                          Dividir en partes iguales
                        </Button>
                      </div>
                      <div className="rounded-lg border border-border divide-y divide-border">
                        {avionesReparto.map((a) => {
                          const sel =
                            repartoSel[a.id] ?? { incluir: false, monto: "" };
                          return (
                            <label
                              key={a.id}
                              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
                            >
                              <input
                                type="checkbox"
                                checked={sel.incluir}
                                onChange={(e) =>
                                  setRepartoSel((s) => ({
                                    ...s,
                                    [a.id]: { ...sel, incluir: e.target.checked },
                                  }))
                                }
                                className="h-4 w-4 accent-brand-600"
                              />
                              <span className="font-mono text-sm font-medium">
                                {a.matricula}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                {a.modelo}
                              </span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                value={sel.monto}
                                placeholder="0.00"
                                disabled={!sel.incluir}
                                onChange={(e) =>
                                  setRepartoSel((s) => ({
                                    ...s,
                                    [a.id]: { ...sel, monto: e.target.value },
                                  }))
                                }
                                className="h-8 w-28 text-right ml-auto"
                              />
                            </label>
                          );
                        })}
                        {avionesReparto.length === 0 && (
                          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                            Sin aviones activos para repartir.
                          </p>
                        )}
                      </div>
                      {/* Línea viva contra el TOTAL PAGADO (ticket + propina):
                          es el monto que se guardará. Rojo si Σ se pasa. */}
                      <p
                        className={
                          repartoExcedido
                            ? "text-xs font-medium text-red-600 dark:text-red-400"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        Asignado {fmtCents(repartoSumaCents)} de{" "}
                        {fmtCents(totalPagadoCents)} del total pagado ·{" "}
                        {repartoExcedido
                          ? `se pasa por ${fmtCents(repartoSumaCents - totalPagadoCents)} — ajusta los montos`
                          : `VuelaTour absorbe ${fmtCents(Math.max(0, totalPagadoCents - repartoSumaCents))}`}
                      </p>
                      {repartoSinMonto.length > 0 && (
                        <p className="text-xs text-amber-600">
                          Captura el monto de{" "}
                          {repartoSinMonto.map((a) => a.matricula).join(", ")} (o
                          desmárcalos).
                        </p>
                      )}
                    </>
                  ))}
              </div>
            )}

            <Field label="Proveedor">
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="Sin proveedor"
              />
            </Field>

            <Field
              label="Folio / remisión del ticket"
              hint="La IA lo llena al adjuntar la foto. Si otro gasto ya trae el mismo folio, el sistema rechaza la captura: es el candado anti-duplicados."
            >
              <Input
                className="font-mono"
                placeholder="Ej. 2622242310"
                {...register("folio_ticket")}
              />
            </Field>

            <Field label="Notas">
              <Textarea
                rows={2}
                placeholder="Ej. TUAS del vuelo a PTU del 28 de mayo"
                {...register("notas")}
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || leyendoIA}>
                {pending ? "Guardando…" : leyendoIA ? "Leyendo factura…" : "Guardar gasto"}
              </Button>
            </DialogFooter>
          </form>

          {/* Confirmación de fecha sospechosa (auditoría 29-ago): > 60 días
              atrás o > 2 días a futuro suele ser el año equivocado del
              ticket — se confirma en explícito antes de guardar. */}
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
                  leído con otro año — el gasto queda fuera de todos los
                  cortes mensuales.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Revisar la fecha</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const values = confirmarFecha;
                    setConfirmarFecha(null);
                    if (values) guardarGasto(values);
                  }}
                >
                  Sí, la fecha es correcta
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
