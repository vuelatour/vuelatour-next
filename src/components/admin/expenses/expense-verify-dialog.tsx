"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ShoppingCartIcon } from "@heroicons/react/24/outline";
import { useForm } from "react-hook-form";
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
  reanalizarComprobanteAction,
  sugerirAsignacionGastoAction,
  verifyGastoAction,
  type GastoTicketIA,
  type SugerenciaAsignacion,
  type VueloCercano,
} from "@/app/admin/expenses/actions";
import { fmtDate, todayCancun } from "@/lib/datetime";
import {
  fechaGastoAntigua,
  fechaGastoDistancia,
  fechaGastoLegible,
  fechaGastoSospechosa,
} from "@/lib/admin/fecha-gasto";
import { avionPorMatricula } from "@/lib/admin/matricula";
import {
  categoriaGastoLabel,
  hojaDestinoGasto,
} from "@/lib/admin/categorias-gasto";
import type { GastoVerifyValues } from "@/app/admin/expenses/schema";
import { verificadorNombre, type Gasto } from "@/types/expenses";
import { COMPRA_ESTADO_LABELS, COMPRA_ROL_LABELS } from "@/types/compras";
import { Field } from "@/components/admin/form-field";
import {
  VueloCanceladoHint,
  esVueloCancelado,
  vueloCercanoLabel,
} from "@/components/admin/expenses/vuelo-cancelado-hint";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";

// Etiquetas desde la FUENTE ÚNICA (@/lib/admin/categorias-gasto); aquí solo
// vive el ORDEN del select. Semántica de cada categoría: ver ese archivo.
const CATEGORIAS = [
  "GAS",
  "ATERRIZAJE",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  "PILOTO_EXTERNO",
  // Sin vuelo (avión opcional): INDIRECTO/NOMINA; SERVICIOS es del avión.
  "INDIRECTO",
  "NOMINA",
  "SERVICIOS",
  // El API exige sin vuelo y sin avión para GASOLINA/VISITA/PERSONAL_DUENO
  // (400 con mensaje claro si el gasto los tiene: quitarlos primero).
  "GASOLINA",
  "VISITA",
  "PERSONAL_DUENO",
  "FIJO",
  "OTRO",
].map((value) => ({ value, label: categoriaGastoLabel(value) }));

const MEDIOS = [
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "PERSONAL_PABLO", label: "Dinero personal Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal Ale" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "BODEGA", label: "Bodega (salida de inventario)" },
];

const ESTATUS = [
  { value: "FACTURA", label: "Factura" },
  { value: "VALE", label: "Vale (sin factura)" },
  { value: "SIN_COMPROBANTE", label: "Sin comprobante" },
];

// Seguimiento de oficina "¿ya lo facturé?" — independiente del comprobante
// que entregó el piloto (semáforo pedido por el cliente, ago 2026).
const FACTURACION = [
  { value: "PENDIENTE", label: "🔴 Pendiente de facturar" },
  { value: "SOLICITADA", label: "🟡 Factura solicitada" },
  { value: "FACTURADA", label: "🟢 Facturada" },
];

interface ExpenseVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: Gasto;
  aircraft: { id: string; matricula: string }[];
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
  // Sello de confirmación del panel: retirarlo pide confirmación breve
  // (regla de la casa para acciones que quitan algo) y se oculta optimista
  // mientras la revalidación refresca la fila.
  const [openRetirar, setOpenRetirar] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [selloRetirado, setSelloRetirado] = useState(false);
  // Tarjetas del catálogo para "con cuál se pagó" (solo medio TARJETA_CORP).
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

  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoVerifyValues>({
    defaultValues: defaults(gasto),
  });

  useEffect(() => {
    if (open) {
      reset(defaults(gasto));
      setAiRaw(null);
      setSelloRetirado(false);
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
      .finally(() => {
        setRetirando(false);
        setOpenRetirar(false);
      });
  };

  // Vuelos alrededor de la fecha del gasto, para asignar/corregir a mano.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setVueloSel(gasto.vuelo_id ?? "");
    buscarVuelosCercanosAction(gasto.fecha_gasto).then((res) => {
      if (!cancel && res.ok && res.data) setVuelos(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open, gasto.id, gasto.vuelo_id, gasto.fecha_gasto]);

  // Al abrir un gasto SIN avión: PRIMERO la matrícula que la IA leyó en el
  // comprobante (capturas de oficina: piloto+fecha da cero candidatos) y
  // después el match probable de vuelo (piloto + fecha ±3d; IA si hay
  // varios). Best-effort: si nada cruza, la asignación sigue manual.
  useEffect(() => {
    if (!open || gasto.aeronave_id) {
      setSugerencia(null);
      setPrefillAvion(null);
      return;
    }
    // Prellenado por matrícula: corre DESPUÉS del reset (el efecto del reset
    // está declarado antes y ambos disparan en el mismo commit). Jamás a
    // categorías sin avión: el guardado los desliga y sería un valor a
    // limpiar de nuevo.
    const mIa = (gasto.valor_ia_extraido as { matricula?: unknown } | null)
      ?.matricula;
    const permiteAvion =
      gasto.categoria !== "PERSONAL_DUENO" &&
      gasto.categoria !== "GASOLINA" &&
      gasto.categoria !== "VISITA";
    let avion: { id: string; matricula: string } | null = null;
    if (typeof mIa === "string" && mIa && permiteAvion) {
      avion = avionPorMatricula(aircraft, mIa) ?? null;
      if (avion) setValue("aeronave_id", avion.id);
    }
    setPrefillAvion(avion);
    let cancel = false;
    setSugiriendo(true);
    sugerirAsignacionGastoAction(gasto.id)
      .then((res) => {
        if (!cancel) setSugerencia(res.ok ? (res.data ?? null) : null);
      })
      .finally(() => {
        if (!cancel) setSugiriendo(false);
      });
    return () => {
      cancel = true;
    };
  }, [
    open,
    gasto.id,
    gasto.aeronave_id,
    gasto.valor_ia_extraido,
    gasto.categoria,
    aircraft,
    setValue,
  ]);

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
      setValue("moneda", ai.moneda);
      llenado.push(`moneda→${ai.moneda}`);
    }
    if (ai.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ai.fecha)) {
      setValue("fecha_gasto", ai.fecha);
      llenado.push(ai.fecha);
    }
    if (
      ai.categoria_sugerida &&
      CATEGORIAS.some((c) => c.value === ai.categoria_sugerida)
    ) {
      setValue("categoria", ai.categoria_sugerida);
      llenado.push(ai.categoria_sugerida);
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
      MEDIOS.some((m) => m.value === ai.medio_pago) &&
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
    // avión — el guardado los desliga y quedaría un valor a limpiar).
    if (
      ai.matricula &&
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
      llenado.length > 0
        ? `IA releyó el comprobante: ${llenado.join(" · ")}. Revisa y guarda.`
        : "IA releyó el comprobante; revisa los campos antes de guardar.",
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
    if (c.aeronave_id) setValue("aeronave_id", c.aeronave_id);
    setVueloSel(c.vuelo_id);
    toast.info(
      `Se aplicará: vuelo #${c.folio ?? "?"} · ${c.matricula ?? "sin matrícula"}. Guarda para confirmar.`,
    );
  };

  /** Guardado real (fecha ya validada o confirmada por el usuario). */
  const guardarVerificacion = (values: GastoVerifyValues) => {
    startTransition(async () => {
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
      // Litros solo aplican a GAS; vacío = no tocar (el zod los descarta).
      if (values.categoria !== "GAS" || values.litros === "") {
        delete (payload as { litros?: unknown }).litros;
      }
      // Facturación: viaja SOLO si se cambió en ESTE diálogo. El badge de la
      // tabla y el trigger del amarre de factura recibida también escriben
      // este campo — mandar el valor con que se abrió el form (posiblemente
      // stale) pisaría esos cambios en silencio.
      if (
        values.estatus_facturacion === (gasto.estatus_facturacion ?? "PENDIENTE")
      ) {
        delete (payload as { estatus_facturacion?: unknown }).estatus_facturacion;
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
        values.fecha_gasto !== (gasto.fecha_gasto ?? "").slice(0, 10) &&
        fechaGastoAntigua(values.fecha_gasto)
      ) {
        payload.permitir_fecha_antigua = true;
      }
      const result = await verifyGastoAction(gasto.id, payload);
      if (result.ok) {
        // Vuelo elegido (sugerencia o manual) distinto al actual: ligarlo o
        // desligarlo junto con el resto de la verificación.
        // Con PERSONAL_DUENO el PATCH ya desligó el vuelo: la segunda
        // llamada re-ligaría o duplicaría la escritura.
        if (
          values.categoria !== "PERSONAL_DUENO" &&
          values.categoria !== "GASOLINA" &&
          values.categoria !== "VISITA" &&
          // Sin vuelo por categoría: el PATCH ya lo desligó — una segunda
          // llamada re-ligaría o duplicaría la escritura.
          values.categoria !== "INDIRECTO" &&
          values.categoria !== "NOMINA" &&
          values.categoria !== "SERVICIOS" &&
          vueloSel !== (gasto.vuelo_id ?? "")
        ) {
          const link = await assignVueloGastoAction(gasto.id, vueloSel || null);
          // El API explica el rechazo (p. ej. 400: la escala pertenece a
          // otro vuelo): se muestra tal cual, no un genérico.
          if (!link.ok)
            toast.error(
              link.error
                ? `Gasto guardado, pero no se pudo ligar el vuelo: ${link.error}`
                : "Gasto guardado, pero no se pudo ligar el vuelo.",
            );
        }
        toast.success("Gasto verificado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  };

  const onSubmit = handleSubmit((values) => {
    // Candado de fechas (auditoría 29-ago): SOLO si la oficina CAMBIÓ la
    // fecha aquí y quedó > 60 días atrás o > 2 días a futuro se pide
    // confirmación — verificar un gasto viejo sin tocar la fecha no molesta.
    const original = (gasto.fecha_gasto ?? "").slice(0, 10);
    if (
      values.fecha_gasto &&
      values.fecha_gasto !== original &&
      fechaGastoSospechosa(values.fecha_gasto)
    ) {
      setConfirmarFecha({ ...values });
      return;
    }
    guardarVerificacion(values);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificar gasto · {monto}</DialogTitle>
          <DialogDescription>
            Asigna el avión y confirma categoría y comprobante. Sin avión, el gasto queda en la
            bandeja de pendientes.
          </DialogDescription>
        </DialogHeader>

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
                path={gasto.foto_url ?? ""}
                url={fotoUrl}
                alt="Comprobante del gasto"
                thumbClassName="w-full h-auto max-h-[45vh] object-contain"
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

        {/* Match automático piloto+fecha (IA si es ambiguo): propone, el humano confirma. */}
        {!gasto.aeronave_id && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1.5">
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
          {/* Si el enriquecimiento IA marcó ⚠ (piloto vs documento), aquí se corrige. */}
          {(gasto.notas ?? "").includes("⚠") && (
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

          {/* Litros: solo combustible — corrige aquí un GAS capturado sin
              litros (el balance no calcula $/litro sin ellos). */}
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

          <Field
            label="Folio / remisión del ticket"
            hint="Candado anti-duplicados: otro gasto con el mismo folio se rechaza."
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
                step="0.0001"
                min="0"
                inputMode="decimal"
                placeholder="Ej. 18.50"
                {...register("tc_gasto")}
              />
            </Field>
          )}

          <Field label="Avión (resuelve pendiente)">
            <SearchableSelect
              options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
              value={watch("aeronave_id")}
              onChange={(v) => setValue("aeronave_id", v)}
              placeholder="Sin asignar"
            />
          </Field>

          {/* Aviso del prellenado por matrícula: se oculta si la oficina
              elige otro avión (su elección manda). */}
          {prefillAvion && watch("aeronave_id") === prefillAvion.id && (
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
                  onClick={() => setValue("aeronave_id", delRecibo.id)}
                >
                  Usar este avión
                </Button>
              </div>
            );
          })()}

          {/* Asignación MANUAL del vuelo (±15 días de la fecha del gasto):
              cubre cuando la sugerencia automática no encuentra match o el
              gasto quedó ligado al vuelo equivocado. */}
          <Field label="Vuelo (asignar o corregir a mano)">
            <SearchableSelect
              options={[
                { value: "", label: "Sin vuelo" },
                ...vuelos.map((v) => ({
                  value: v.id,
                  label: vueloCercanoLabel(v),
                })),
              ]}
              value={vueloSel}
              onChange={(v) => {
                setVueloSel(v);
                // El avión del vuelo elegido se refleja de inmediato.
                const opt = vuelos.find((x) => x.id === v);
                if (opt?.aeronave_id) setValue("aeronave_id", opt.aeronave_id);
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
              // ¿A qué hoja del balance cae? — reactivo a categoría, vuelo y
              // avión elegidos (fuente única hojaDestinoGasto).
              hint={`Cae en: ${hojaDestinoGasto(
                watch("categoria"),
                !!vueloSel,
                !!watch("aeronave_id"),
              )}`}
            >
              <SearchableSelect
                options={CATEGORIAS}
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
            <Field label="Comprobante">
              <SearchableSelect
                options={ESTATUS}
                value={watch("estatus_comprobante")}
                onChange={(v) => setValue("estatus_comprobante", v)}
                placeholder="Estatus"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Facturación (oficina)">
              <SearchableSelect
                options={FACTURACION}
                value={watch("estatus_facturacion")}
                onChange={(v) => setValue("estatus_facturacion", v)}
                placeholder="Estatus"
              />
            </Field>
            <Field label="Medio de pago">
              <SearchableSelect
                options={MEDIOS}
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
                  if (values) guardarVerificacion(values);
                }}
              >
                Sí, la fecha es correcta
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
  };
}
