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

function fmtMonto(g: SugerenciaBandeja["gasto"]): string {
  if (g.monto == null) return "—";
  return `$${g.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${g.moneda ?? ""}`;
}

/**
 * Barrido de la bandeja completa: un clic evalúa TODOS los pendientes
 * (piloto+fecha; IA si es ambiguo), muestra cada sugerencia con su razón y la
 * oficina aplica en lote las palomeadas. Sin match → se queda pendiente para
 * asignación manual.
 */
export function SuggestAssignmentsButton({ pendientes }: { pendientes: number }) {
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
    const res = await sugerirAsignacionesBandejaAction();
    setLoading(false);
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
    const res = await aplicarAsignacionesAction(items);
    setApplying(false);
    if (res.ok && res.data) {
      toast.success(
        `${res.data.aplicados} gasto(s) asignados${res.data.fallidos ? ` · ${res.data.fallidos} fallaron` : ""}.`,
      );
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.ok ? "Sin respuesta" : res.error);
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={run}>
        <SparklesIcon className="h-4 w-4" />
        Sugerir asignaciones ({pendientes})
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
              Analizando {pendientes} pendiente(s)… esto toma unos segundos.
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
                          {r.gasto.categoria ?? "GASTO"} · {fmtMonto(r.gasto)}
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
                        {r.gasto.categoria ?? "GASTO"} · {fmtMonto(r.gasto)} ·{" "}
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
