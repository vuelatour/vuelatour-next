"use client";

import { useState } from "react";
import type { UseFormSetValue } from "react-hook-form";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FechaHoraCampo } from "@/components/admin/fecha-hora-campo";
import { AirportQuickCreateButton } from "@/components/admin/airports/airport-quick-create-button";
import { QuotePlegable } from "@/components/admin/quotes/quote-plegable";
import type { Airport } from "@/types/airports";
import type { EscalaInput } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type { AirportOption, OpsLegForm, QuoteFormValues } from "./quote-form-types";

/** La croma de la hoja NO se imprime: el comparador con pyservices la descarta. */
const UI = { "data-cot-ui": "" } as const;

/**
 * DOS PIELES para la misma banda. Dentro del papel usa las clases `.cot-ops`
 * del CSS de la hoja interna, que por invariante SOLO existen bajo
 * `.cot-interna` (probado en `styles/__tests__/hoja-interna-css-deriva.test.ts`).
 * El rol que NO ve la hoja interna (SOCIO) la lee FUERA del papel, encima de
 * la hoja del cliente, y ahí esas reglas no aplicarían: esa variante se pinta
 * con utilidades, sin tocar el CSS del papel ni los fixtures de paridad.
 */
type PielOps = Record<
  "caja" | "cab" | "ttl" | "ruta" | "lista" | "item" | "n" | "tag" | "nota" | "btn",
  string
>;
const PIEL_PAPEL: PielOps = {
  caja: "cot-ops",
  cab: "cot-ops__cab",
  ttl: "cot-ops__ttl",
  ruta: "cot-ops__ruta",
  lista: "cot-ops__lista",
  item: "",
  n: "cot-ops__n",
  tag: "cot-ops__tag",
  nota: "cot-ops__nota",
  btn: "cot-ops__btn cursor-pointer",
};
const PIEL_SUELTA: PielOps = {
  caja: "rounded-lg border border-sky-500/40 border-l-4 border-l-sky-600 bg-sky-500/10 px-4 py-3 text-sky-900 dark:text-sky-200",
  cab: "flex flex-wrap items-center justify-between gap-2",
  ttl: "text-[10px] font-bold uppercase tracking-wider",
  ruta: "mt-0.5 text-base font-bold tracking-wide",
  lista: "mt-1 space-y-0.5",
  item: "text-sm font-semibold tracking-wide",
  n: "font-normal opacity-70",
  tag: "ml-1.5 rounded border border-sky-500/50 px-1 text-[9px] font-normal uppercase tracking-wider align-[1px]",
  nota: "mt-1 text-xs opacity-85",
  btn: "cursor-pointer rounded-md border border-sky-500/50 bg-background px-2 py-0.5 text-xs font-bold text-sky-900 hover:bg-sky-500/15 disabled:cursor-default disabled:opacity-50 dark:text-sky-200",
};

/**
 * RUTA OPERATIVA DEL VUELO, en una BANDA AZUL dentro del papel, justo ENCIMA
 * de la tabla de tramos (Fase 2.3 · BLOQUE C, 22-sep-2026; antes era una card
 * del panel lateral «Interno · no se imprime»).
 *
 * Va AHÍ y no en un plegable porque es un aviso de DIVERGENCIA: el itinerario
 * que se cotiza (comercial, abre y cierra en CUN) no es el que vuela el
 * piloto, y eso solo se entiende junto a la tabla que lo dice. Es CROMA
 * (`data-cot-ui`): el documento interno de pyservices no la imprime, así que
 * los fixtures de paridad siguen intactos.
 *
 * «Cotizar con estos tramos» CONSERVA su confirmación (pisa los tramos
 * capturados = mueve dinero) y, como siempre, NO guarda nada: deja el
 * formulario sucio para que la oficina vea el total nuevo antes de guardar.
 */
export function QuoteRutaOperativaBanda({
  lectura,
  initialQuote,
  escalasCotizadas,
  operativa,
  suelta = false,
}: {
  lectura: boolean;
  initialQuote?: PersistedQuote;
  /** Tramos que hay HOY en el formulario (para saber si se pisan). */
  escalasCotizadas: EscalaInput[];
  /** Solo en revisión con itinerario operativo y sin candado. */
  operativa?: {
    opsComoEscalas: () => EscalaInput[];
    onAplicar: (legs: EscalaInput[]) => void;
    legsSignature: (legs: EscalaInput[]) => string;
  };
  /** Fuera del papel (rol sin hoja interna): misma banda, piel de utilidades. */
  suelta?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const escalas = initialQuote?.escalas ?? [];
  const c = suelta ? PIEL_SUELTA : PIEL_PAPEL;
  // `data-cot-ui` marca lo que el papel NO imprime; fuera del papel no hay
  // nada que marcar (el comparador de fixtures ni siquiera la ve).
  const croma = suelta ? {} : UI;

  // LECTURA (la card que vivía en el detalle): la ruta la vuela el piloto y
  // es distinta de la comercial cuando el vuelo salió de otra base o lleva
  // ferries. Los tramos operativos se editan en el vuelo.
  const enLectura =
    lectura &&
    !!initialQuote &&
    escalas.length > 0 &&
    (initialQuote.itinerario_operativo === true ||
      escalas.some((e) => e.solo_operativa || e.es_ferry));
  const enEdicion = !lectura && !!operativa && initialQuote?.itinerario_operativo === true;
  if (!enLectura && !enEdicion) return null;

  if (enLectura) {
    return (
      <div className={c.caja} {...croma}>
        <div className={c.ttl}>Ruta operativa (la vuela el piloto — no se cotiza)</div>
        <ol className={c.lista}>
          {[...escalas]
            .sort((a, b) => a.orden - b.orden)
            .map((esc) => (
              <li key={esc.id} className={c.item || undefined}>
                <span className={c.n}>{esc.orden}.</span> {esc.origen_iata} →{" "}
                {esc.destino_iata}
                {esc.es_ferry && <span className={c.tag}>ferry</span>}
                {esc.solo_operativa && <span className={c.tag}>operativo</span>}
                {esc.cancelada_at && <span className={c.tag}>cancelado</span>}
              </li>
            ))}
        </ol>
        <div className={c.nota}>
          La hoja lleva la ruta COMERCIAL (lo que paga el cliente, abre y cierra en CUN). Los
          tramos operativos se editan en el detalle del vuelo.
        </div>
      </div>
    );
  }

  const ops = operativa!;
  const ruta =
    escalas.length === 0
      ? "—"
      : [escalas[0].origen_iata, ...escalas.map((e) => e.destino_iata)].join(" → ");
  const ferries =
    escalas
      .map((e, i) => (e.es_ferry || e.solo_operativa ? `T${i + 1} ferry` : null))
      .filter(Boolean)
      .join(" · ") || "Todos los tramos con pasajeros";

  return (
    <div className={c.caja} {...croma}>
      <div className={c.cab}>
        <span className={c.ttl}>
          Ruta operativa (la vuela el piloto — aquí no se cotiza)
        </span>
        <button
          type="button"
          className={c.btn}
          disabled={ops.opsComoEscalas().length === 0}
          title="Copia origen→destino de los tramos operativos como punto de partida de la cotización. Los pax se capturan en la hoja, no se copian."
          onClick={() => {
            const nuevos = ops.opsComoEscalas();
            if (
              escalasCotizadas.length > 0 &&
              ops.legsSignature(escalasCotizadas) !== ops.legsSignature(nuevos)
            ) {
              setConfirmOpen(true);
            } else {
              ops.onAplicar(nuevos);
            }
          }}
        >
          Cotizar con estos tramos
        </button>
      </div>
      <div className={c.ruta}>{ruta}</div>
      <div className={c.nota}>
        {ferries} · El itinerario de la hoja es la ruta COMERCIAL (lo que paga el cliente, abre y
        cierra en CUN); la operativa no se toca al cotizar.
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-guard-exempt>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar los tramos capturados?</AlertDialogTitle>
            <AlertDialogDescription>
              Los tramos de la cotización se sustituyen por los de la ruta operativa (sin
              pasajeros: esos se capturan en la hoja). El total se recalcula en vivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                ops.onAplicar(ops.opsComoEscalas());
                setConfirmOpen(false);
              }}
            >
              Reemplazar tramos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * EDITOR de la ruta operativa del ALTA (`escalas_operacion[]`), en un
 * `<details>` DEBAJO del papel (Fase 2.3 · BLOQUE C; antes, el sub-bloque
 * «Ruta operativa» del panel lateral).
 *
 * Fuera del documento porque NO se cotiza: es la ruta REAL del avión (puede
 * salir de otra base, con ferries) y ahí se cargan gastos y tacómetros. El
 * papel imprime la COMERCIAL. Vacía = la operación usa la comercial.
 *
 * El contenido nunca se desmonta al plegarse, así que lo capturado sobrevive.
 */
export function QuoteRutaOperativa({
  values,
  setValue,
  airports,
  onAeropuertoCreado,
}: {
  values: QuoteFormValues;
  setValue: UseFormSetValue<QuoteFormValues>;
  airports: AirportOption[];
  onAeropuertoCreado: (a: Airport) => void;
}) {
  const opsLegs = values.escalas_operacion ?? [];
  const setOpsLegs = (upd: OpsLegForm[] | ((prev: OpsLegForm[]) => OpsLegForm[])) =>
    setValue(
      "escalas_operacion",
      typeof upd === "function" ? upd(values.escalas_operacion ?? []) : upd,
      { shouldDirty: true },
    );

  const resumen =
    opsLegs.length === 0
      ? "Vacía = usa la ruta comercial"
      : [
          [opsLegs[0].origen, ...opsLegs.map((l) => l.destino)].filter(Boolean).join(" → "),
          `${opsLegs.length} ${opsLegs.length === 1 ? "tramo" : "tramos"}`,
        ].join(" · ");

  const opcionesAeropuerto = airports.map((a) => ({
    value: a.iata,
    label: a.iata,
    description: a.nombre,
  }));

  return (
    <QuotePlegable id="operativa" titulo="Ruta operativa del vuelo" resumen={resumen}>
      {/* `seccion-operativa` era el ancla del sub-bloque del panel. */}
      <div id="seccion-operativa" className="scroll-mt-24 space-y-2">
        <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              Ruta operativa (opcional · no se cotiza)
            </p>
            <div className="flex items-center gap-2">
              <AirportQuickCreateButton onCreated={onAeropuertoCreado} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setOpsLegs((prev) => [
                    ...prev,
                    {
                      origen: prev.length ? prev[prev.length - 1].destino : "",
                      destino: "",
                      ferry: prev.length === 0,
                      pax: "",
                      hora: "",
                      nota: "",
                      pernocta: false,
                      servicio: false,
                      servicioNotas: "",
                      nombres: "",
                      showNombres: false,
                    },
                  ])
                }
              >
                + Tramo
              </Button>
            </div>
          </div>
          {opsLegs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              La ruta REAL del avión (puede salir de otra base, con ferries). Aquí se cargan los
              gastos y tacómetros; el itinerario de la hoja es solo lo que paga el cliente. Si la
              dejas vacía, la operación usa la ruta comercial.
            </p>
          ) : (
            opsLegs.map((l, i) => (
              <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <SearchableSelect
                    options={opcionesAeropuerto}
                    value={l.origen}
                    onChange={(v) =>
                      setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, origen: v } : x)))
                    }
                    placeholder="Sale de"
                  />
                  <SearchableSelect
                    options={opcionesAeropuerto}
                    value={l.destino}
                    onChange={(v) =>
                      setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, destino: v } : x)))
                    }
                    placeholder="Destino"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-destructive"
                    onClick={() => setOpsLegs((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={l.ferry}
                      onCheckedChange={(c) =>
                        setOpsLegs((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  ferry: c,
                                  pax: c ? "" : x.pax,
                                  ...(c ? { nombres: "", showNombres: false } : {}),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    Ferry (vacío)
                  </label>
                  <label
                    className="flex items-center gap-2 text-xs"
                    title="El piloto pernocta tras este tramo (viático en la cotización). SOLO se marca a mano."
                  >
                    <Switch
                      checked={l.pernocta}
                      onCheckedChange={(c) =>
                        setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, pernocta: c } : x)))
                      }
                    />
                    Pernocta
                  </label>
                  <label
                    className="flex items-center gap-2 text-xs"
                    title="Parada técnica / de servicio: cambiar llanta, revisión, carga de material."
                  >
                    <Switch
                      checked={l.servicio}
                      onCheckedChange={(c) =>
                        setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, servicio: c } : x)))
                      }
                    />
                    Servicio
                  </label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Pax"
                    disabled={l.ferry}
                    className="w-20 h-8"
                    value={l.pax}
                    onChange={(e) =>
                      setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, pax: e.target.value } : x)))
                    }
                  />
                </div>
                {l.servicio && (
                  <Input
                    className="h-8"
                    placeholder="Detalle del servicio · ej. aterriza en Toledo a cambiar llanta"
                    value={l.servicioNotas}
                    onChange={(e) =>
                      setOpsLegs((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, servicioNotas: e.target.value } : x)),
                      )
                    }
                  />
                )}
                <div className="flex flex-wrap items-start gap-2">
                  <div
                    className="w-[264px] shrink-0"
                    title="Fecha y hora del tramo (opcional, hora Cancún). Vacía = tramo 1 sale a la fecha del vuelo. Es la salida programada del piloto; la fecha del PDF del cliente va en el itinerario de la hoja."
                  >
                    <FechaHoraCampo
                      className="[&_input]:h-8"
                      value={l.hora}
                      onChange={(v) =>
                        setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, hora: v } : x)))
                      }
                    />
                  </div>
                  <Input
                    className="h-8 min-w-[12rem] flex-1"
                    placeholder='Nota del tramo para el piloto · ej. "cargar gasolina aquí"'
                    value={l.nota}
                    onChange={(e) =>
                      setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, nota: e.target.value } : x)))
                    }
                  />
                </div>
                {!l.ferry &&
                  (l.showNombres ? (
                    <div className="space-y-1">
                      <Textarea
                        rows={3}
                        value={l.nombres}
                        onChange={(e) =>
                          setOpsLegs((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, nombres: e.target.value } : x)),
                          )
                        }
                        placeholder={"Nombres de pasajeros, uno por línea\nJuan Pérez\nMaría López"}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Específico de este tramo. Útil para permisos; puede ir vacío.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, showNombres: true } : x)))
                      }
                      className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
                    >
                      + nombres de pasajeros
                    </button>
                  ))}
              </div>
            ))
          )}
        </div>
      </div>
    </QuotePlegable>
  );
}
