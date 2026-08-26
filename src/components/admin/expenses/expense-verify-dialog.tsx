"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  listCardsOptionsAction,
  type CardOption,
} from "@/app/admin/users/actions";
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
import { fmtDateOnly } from "@/lib/datetime";
import type { GastoVerifyValues } from "@/app/admin/expenses/schema";
import type { Gasto } from "@/types/expenses";
import { Field } from "@/components/admin/form-field";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";

const CATEGORIAS = [
  ...[
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
  ].map((c) => ({ value: c, label: c })),
  { value: "PILOTO_EXTERNO", label: "Piloto externo (honorario)" },
  { value: "INDIRECTO", label: "Indirecto (sin vuelo)" },
  // El API exige sin vuelo y sin avión para esta categoría (400 con mensaje
  // claro si el gasto los tiene: quitarlos primero).
  { value: "PERSONAL_DUENO", label: "Personal del dueño (no empresa)" },
  ...["FIJO", "OTRO"].map((c) => ({ value: c, label: c })),
];

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
  // Sugerencia IA/regla de a qué vuelo pertenece (solo gastos sin avión).
  const [sugerencia, setSugerencia] = useState<SugerenciaAsignacion | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  // Vuelo elegido (sugerencia aplicada O selección manual). Sin match
  // automático, la oficina lo asigna a mano de esta lista (±15 días).
  const [vueloSel, setVueloSel] = useState<string>(gasto.vuelo_id ?? "");
  const [vuelos, setVuelos] = useState<VueloCercano[]>([]);
  // Reanálisis IA del comprobante guardado (gastos con lectura vieja pegada,
  // p. ej. de antes de la separación TUA/FBO en el prompt).
  const [reanalizando, setReanalizando] = useState(false);
  const [aiRaw, setAiRaw] = useState<GastoTicketIA | null>(null);
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
    }
  }, [open, gasto, reset]);

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

  // Al abrir un gasto SIN avión: buscar el match probable (piloto + fecha ±3d;
  // IA si hay varios). Best-effort: si falla, la asignación sigue manual.
  useEffect(() => {
    if (!open || gasto.aeronave_id) {
      setSugerencia(null);
      return;
    }
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
  }, [open, gasto.id, gasto.aeronave_id]);

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
    if (ai.matricula && !watch("aeronave_id")) {
      const av = aircraft.find(
        (a) => a.matricula.replace(/-/g, "") === ai.matricula!.replace(/-/g, ""),
      );
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

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // monto guardado = TOTAL PAGADO (ticket + propina): lo que llega al
      // banco. En el formulario se edita el ticket y la propina por separado
      // y aquí se recompone. Ticket vacío + propina vacía = no tocar el monto.
      const ticket = Number(values.monto);
      const propina = values.propina === "" ? 0 : Number(values.propina);
      let payload: Record<string, unknown> = { ...values };
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
      if (values.categoria === "PERSONAL_DUENO") {
        payload.aeronave_id = null;
        payload.vuelo_id = null;
        payload.escala_id = null;
      }
      const result = await verifyGastoAction(gasto.id, payload);
      if (result.ok) {
        // Vuelo elegido (sugerencia o manual) distinto al actual: ligarlo o
        // desligarlo junto con el resto de la verificación.
        // Con PERSONAL_DUENO el PATCH ya desligó el vuelo: la segunda
        // llamada re-ligaría o duplicaría la escritura.
        if (
          values.categoria !== "PERSONAL_DUENO" &&
          vueloSel !== (gasto.vuelo_id ?? "")
        ) {
          const link = await assignVueloGastoAction(gasto.id, vueloSel || null);
          if (!link.ok) toast.error("Gasto guardado, pero no se pudo ligar el vuelo.");
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
  });

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
              <Input type="date" {...register("fecha_gasto")} />
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

          {(() => {
            /* Cruce de matrícula (caso ASUR Mérida): el recibo manda. */
            const mIa = aiRaw?.matricula ??
              (gasto.valor_ia_extraido as { matricula?: unknown } | null)
                ?.matricula;
            const sel = watch("aeronave_id");
            if (!mIa || typeof mIa !== "string" || !sel) return null;
            const norm = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, "");
            const delRecibo = aircraft.find((a) => norm(a.matricula) === norm(mIa));
            if (!delRecibo || delRecibo.id === sel) return null;
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
                  label:
                    `#${v.folio ?? "?"} · ${v.matricula ?? "sin avión"} · ${v.ruta ?? ""}` +
                    (v.fecha ? ` · ${fmtDateOnly(v.fecha)}` : ""),
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
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <SearchableSelect
                options={CATEGORIAS}
                value={watch("categoria")}
                onChange={(v) => {
                  setValue("categoria", v);
                  // PERSONAL del dueño: sin vuelo, avión ni escala (candado
                  // del API) — se limpian aquí y el submit los DESLIGA con
                  // null explícito en el mismo PATCH.
                  if (v === "PERSONAL_DUENO") {
                    setValue("aeronave_id", "");
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
