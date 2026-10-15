"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SparklesIcon } from "@heroicons/react/24/outline";
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
  aplicarAsignacionesAction,
  sugerirAsignacionesBandejaAction,
  type SugerenciaBandeja,
} from "@/app/admin/expenses/actions";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  ayudaSugerirAsignaciones,
  textoAnalizandoPendientes,
  textoPendientesSinRevisar,
} from "@/lib/admin/gastos-vista";
import { llamarSinLanzar } from "@/lib/admin/reparto-gasto";

function fmtMonto(g: SugerenciaBandeja["gasto"]): string {
  if (g.monto == null) return "—";
  return `$${g.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${g.moneda ?? ""}`;
}

/**
 * Barrido de la bandeja: un clic evalúa los pendientes MÁS RECIENTES (el API
 * revisa a lo más `TOPE_SUGERIR_ASIGNACIONES` = 15 por pasada; piloto+fecha,
 * IA si es ambiguo), muestra cada sugerencia con su razón y la oficina aplica
 * en lote las palomeadas. Sin match → se queda pendiente para asignación
 * manual; los que no entraron en la pasada se dicen bajo el resultado.
 *
 * `pendientes` = el total GLOBAL de la bandeja (14-oct-2026): la acción no
 * mira los filtros, así que el número va en el `title`, no en la etiqueta (la
 * pestaña «Pendientes» ya lo enseña y antes contaba lo FILTRADO). 0 ⇒ no se
 * pinta; null (no se pudo contar) ⇒ se pinta igual, sin número: un conteo
 * que falló jamás se lee como «no hay pendientes».
 */
export function SuggestAssignmentsButton({ pendientes }: { pendientes: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resultados, setResultados] = useState<SugerenciaBandeja[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  if (pendientes === 0) return null;

  const run = async () => {
    setOpen(true);
    setLoading(true);
    setResultados([]);
    setSeleccion(new Set());
    // Sin lanzar: un fallo de transporte (red, deploy) se dice en un toast y
    // el diálogo no se queda «Analizando…» para siempre.
    const r = await llamarSinLanzar(() => sugerirAsignacionesBandejaAction());
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      setOpen(false);
      return;
    }
    const res = r.valor;
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "Sin respuesta" : res.error);
      setOpen(false);
      return;
    }
    setResultados(res.data.resultados);
    // Pre-palomea solo las sugerencias con match (la oficina puede despalomar).
    // Un vuelo CANCELADO nunca se pre-palomea: la oficina lo confirma a
    // propósito (el gasto sí cuenta en el balance, pero hay que estar seguros).
    setSeleccion(
      new Set(
        res.data.resultados
          .filter((r) => r.sugerido !== null && r.sugerido.estado !== "CANCELADO")
          .map((r) => r.gasto.id),
      ),
    );
  };

  const conMatch = resultados.filter((r) => r.sugerido !== null);
  const sinMatch = resultados.filter((r) => r.sugerido === null);

  const aplicar = async () => {
    const items = conMatch
      .filter((r) => seleccion.has(r.gasto.id))
      .map((r) => ({
        gasto_id: r.gasto.id,
        aeronave_id: r.sugerido!.aeronave_id,
        vuelo_id: r.sugerido!.vuelo_id,
      }));
    if (items.length === 0) return;
    setApplying(true);
    const r = await llamarSinLanzar(() => aplicarAsignacionesAction(items));
    setApplying(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const res = r.valor;
    if (res.ok && res.data) {
      toast.success(
        `${res.data.aplicados} gasto(s) asignados${res.data.fallidos ? ` · ${res.data.fallidos} fallaron` : ""}.`,
      );
      // El motivo del API tal cual (el primero; los demás son iguales o se
      // ven al reintentar uno por uno).
      if (res.data.fallidos && res.data.errores?.[0]) {
        toast.error(res.data.errores[0]);
      }
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.ok ? "Sin respuesta" : res.error);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="gap-2"
        onClick={run}
        title={ayudaSugerirAsignaciones(pendientes)}
      >
        <SparklesIcon className="h-4 w-4" />
        Sugerir asignaciones
      </Button>

      <Dialog open={open} onOpenChange={(o) => !applying && setOpen(o)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sugerencias para la bandeja de pendientes</DialogTitle>
            <DialogDescription>
              Cada gasto se cruza con los vuelos de quien lo capturó (fecha ±3
              días; IA cuando hay varios). Revisa, despaloma lo que no cuadre y
              aplica. Lo que quede sin match se asigna a mano.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {textoAnalizandoPendientes(pendientes)}
            </p>
          ) : (
            <div className="space-y-4">
              {conMatch.length > 0 && (
                <div className="space-y-2">
                  {conMatch.map((r) => (
                    <label
                      key={r.gasto.id}
                      className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={seleccion.has(r.gasto.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSeleccion((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(r.gasto.id);
                            else next.delete(r.gasto.id);
                            return next;
                          });
                        }}
                        className="mt-1 h-4 w-4 accent-red-500"
                      />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {categoriaGastoLabel(r.gasto.categoria ?? "GASTO")} · {fmtMonto(r.gasto)}
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · {r.gasto.fecha_gasto ?? "sin fecha"} ·{" "}
                            {r.gasto.capturo_nombre ?? "¿quién?"}
                          </span>
                        </p>
                        <p className="text-xs mt-0.5">
                          → vuelo{" "}
                          <span className="font-mono">#{r.sugerido!.folio ?? "?"}</span>
                          {r.sugerido!.estado === "CANCELADO" && (
                            <> · <span className="font-semibold">CANCELADO</span></>
                          )}
                          {r.sugerido!.matricula && (
                            <>
                              {" "}
                              · <span className="font-mono">{r.sugerido!.matricula}</span>
                            </>
                          )}
                          {r.sugerido!.ruta && <> · {r.sugerido!.ruta}</>}
                          <span className="text-muted-foreground">
                            {" "}
                            · {Math.round(r.confianza * 100)}%
                            {r.fuente === "ia" ? " (IA)" : ""}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.razon}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {sinMatch.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sin match ({sinMatch.length}) — asignación manual
                  </p>
                  {sinMatch.map((r) => (
                    <div
                      key={r.gasto.id}
                      className="rounded-lg border border-dashed border-border px-3 py-2 text-xs"
                    >
                      <span className="font-medium">
                        {categoriaGastoLabel(r.gasto.categoria ?? "GASTO")} · {fmtMonto(r.gasto)} ·{" "}
                        {r.gasto.capturo_nombre ?? "¿quién?"}
                      </span>
                      <span className="text-muted-foreground"> — {r.razon}</span>
                    </div>
                  ))}
                </div>
              )}

              {resultados.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hay gastos pendientes por revisar.
                </p>
              )}

              {/* El API revisa a lo más 15 por pasada: los demás se dicen. */}
              {textoPendientesSinRevisar(pendientes, resultados.length) && (
                <p className="text-xs text-amber-700 dark:text-amber-300" data-pendientes-sin-revisar="">
                  {textoPendientesSinRevisar(pendientes, resultados.length)}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={applying}
            >
              Cerrar
            </Button>
            {conMatch.length > 0 && (
              <Button onClick={aplicar} disabled={applying || seleccion.size === 0}>
                {applying
                  ? "Aplicando…"
                  : `Aplicar ${seleccion.size} asignación(es)`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
