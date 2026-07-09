"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { MapPinIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
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
import { Badge } from "@/components/ui/badge";
import { fmtDateOnly } from "@/lib/datetime";
import {
  deleteTarifaAction,
  generarPistasAction,
  listTarifasAction,
  pistasPendientesAction,
  saveTarifaAction,
} from "@/app/admin/expenses/actions";
import type { PistaPendiente, TarifaAerodromo } from "@/types/expenses";

/** Mes corriente en hora Cancún (UTC−5 fija): [primer día, hoy]. */
function periodoDefault(): { desde: string; hasta: string } {
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

interface Seleccion {
  incluir: boolean;
  monto: string;
}

/**
 * Pistas por pagar: el sistema propone un gasto por cada aterrizaje fuera de
 * CUN (con la tarifa del aeródromo); la oficina ajusta montos y confirma.
 * Los gastos quedan SIN_COMPROBANTE hasta amarrar la factura de VIP SAESA.
 */
export function PistasDialog() {
  const [open, setOpen] = useState(false);
  const [periodo, setPeriodo] = useState(periodoDefault());
  const [pendientes, setPendientes] = useState<PistaPendiente[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, Seleccion>>({});
  const [cargando, setCargando] = useState(false);
  const [verTarifario, setVerTarifario] = useState(false);
  const [pending, startTransition] = useTransition();

  const buscar = useCallback(
    (desde: string, hasta: string) => {
      setCargando(true);
      pistasPendientesAction(desde, hasta)
        .then((res) => {
          if (!res.ok || !res.data) {
            toast.error(res.error ?? "No se pudieron cargar los aterrizajes");
            return;
          }
          const filas = res.data.data;
          setPendientes(filas);
          const sel: Record<string, Seleccion> = {};
          for (const p of filas) {
            sel[p.escala_id] = {
              // Preselecciona solo lo que tiene tarifa conocida y no variable.
              incluir: p.monto_sugerido != null && !p.tarifa_variable,
              monto: p.monto_sugerido != null ? String(p.monto_sugerido) : "",
            };
          }
          setSeleccion(sel);
        })
        .finally(() => setCargando(false));
    },
    [],
  );

  const abrir = () => {
    setOpen(true);
    buscar(periodo.desde, periodo.hasta);
  };

  const elegidos = useMemo(
    () =>
      pendientes.filter(
        (p) => seleccion[p.escala_id]?.incluir && Number(seleccion[p.escala_id]?.monto) > 0,
      ),
    [pendientes, seleccion],
  );

  const generar = () => {
    startTransition(async () => {
      const res = await generarPistasAction(
        elegidos.map((p) => ({
          escala_id: p.escala_id,
          monto: Number(seleccion[p.escala_id].monto),
          moneda: p.moneda,
          notas: `Cuota de aterrizaje ${p.destino_iata} · vuelo #${p.folio ?? "?"} · ${p.matricula ?? ""}`,
        })),
      );
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudieron generar los gastos");
        return;
      }
      const fallidos = res.data.resultados.filter((r) => !r.ok);
      if (fallidos.length > 0) {
        toast.warning(
          `${res.data.creados} gastos creados; ${fallidos.length} fallaron (${fallidos[0].error ?? ""})`,
        );
      } else {
        toast.success(`${res.data.creados} gastos de pista creados`);
      }
      buscar(periodo.desde, periodo.hasta);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={abrir} className="gap-2">
        <MapPinIcon className="h-4 w-4" />
        Pistas por pagar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pistas por pagar (cuotas de aeródromo)</DialogTitle>
            <DialogDescription>
              Aterrizajes fuera de CUN del periodo que aún no tienen gasto de pista. El monto
              viene del tarifario (editable — PCE es variable). Al confirmar se crea un gasto
              por aterrizaje, ligado a su vuelo, pendiente de amarrar la factura de VIP SAESA.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Desde</p>
              <Input
                type="date"
                value={periodo.desde}
                onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Hasta</p>
              <Input
                type="date"
                value={periodo.hasta}
                onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))}
                className="w-40"
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => buscar(periodo.desde, periodo.hasta)}
              disabled={cargando}
            >
              {cargando ? "Buscando…" : "Buscar"}
            </Button>
            <Button
              variant="ghost"
              className="gap-1.5 ml-auto text-muted-foreground"
              onClick={() => setVerTarifario((v) => !v)}
            >
              <Cog6ToothIcon className="h-4 w-4" />
              Tarifario
            </Button>
          </div>

          {verTarifario && <TarifarioEditor />}

          {cargando ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Buscando aterrizajes del periodo…
            </p>
          ) : pendientes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin aterrizajes pendientes de gasto en el periodo. Todo cubierto.
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Vuelo</th>
                    <th className="px-3 py-2">Tramo</th>
                    <th className="px-3 py-2">Avión</th>
                    <th className="px-3 py-2 text-right">Cuota (MXN)</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((p) => {
                    const sel = seleccion[p.escala_id] ?? { incluir: false, monto: "" };
                    return (
                      <tr key={p.escala_id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={sel.incluir}
                            onChange={(e) =>
                              setSeleccion((s) => ({
                                ...s,
                                [p.escala_id]: { ...sel, incluir: e.target.checked },
                              }))
                            }
                            className="h-4 w-4 accent-brand-600"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {p.fecha_gasto ? fmtDateOnly(p.fecha_gasto) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono">#{p.folio ?? "?"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {p.tramo}
                          {p.tarifa_variable && (
                            <Badge
                              variant="outline"
                              className="ml-1.5 border-amber-500/50 text-amber-600 text-[10px]"
                            >
                              Tarifa variable
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{p.matricula ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={sel.monto}
                            placeholder={p.monto_sugerido != null ? String(p.monto_sugerido) : "0.00"}
                            onChange={(e) =>
                              setSeleccion((s) => ({
                                ...s,
                                [p.escala_id]: { ...sel, monto: e.target.value },
                              }))
                            }
                            className="h-8 w-28 text-right ml-auto"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter className="items-center gap-3">
            {elegidos.length > 0 && (
              <p className="text-xs text-muted-foreground mr-auto">
                {elegidos.length} aterrizaje{elegidos.length === 1 ? "" : "s"} · suma{" "}
                {elegidos
                  .reduce((acc, p) => acc + Number(seleccion[p.escala_id].monto), 0)
                  .toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
              </p>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cerrar
            </Button>
            <Button onClick={generar} disabled={pending || elegidos.length === 0}>
              {pending
                ? "Generando…"
                : `Generar ${elegidos.length} gasto${elegidos.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Tarifario editable: cuota por aeródromo/modelo (vacío = cualquiera). */
function TarifarioEditor() {
  const [tarifas, setTarifas] = useState<TarifaAerodromo[]>([]);
  const [nuevo, setNuevo] = useState({ codigo_iata: "", modelo: "", monto: "" });
  const [aEliminar, setAEliminar] = useState<TarifaAerodromo | null>(null);
  const [pending, startTransition] = useTransition();

  const cargar = useCallback(() => {
    listTarifasAction().then((res) => {
      if (res.ok && res.data) setTarifas(res.data);
    });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarMonto = (t: TarifaAerodromo, monto: string) => {
    const n = Number(monto);
    if (!(n >= 0)) return;
    startTransition(async () => {
      const res = await saveTarifaAction(t.id, { monto: n });
      if (res.ok) {
        toast.success("Tarifa actualizada");
        cargar();
      } else toast.error(res.error ?? "Error");
    });
  };

  const agregar = () => {
    const n = Number(nuevo.monto);
    if (!(n > 0)) {
      toast.error("Captura el monto de la tarifa");
      return;
    }
    startTransition(async () => {
      const res = await saveTarifaAction(null, {
        codigo_iata: nuevo.codigo_iata || undefined,
        modelo: nuevo.modelo || undefined,
        monto: n,
      });
      if (res.ok) {
        toast.success("Tarifa agregada");
        setNuevo({ codigo_iata: "", modelo: "", monto: "" });
        cargar();
      } else toast.error(res.error ?? "Error");
    });
  };

  const eliminar = () => {
    if (!aEliminar) return;
    const id = aEliminar.id;
    startTransition(async () => {
      const res = await deleteTarifaAction(id);
      if (res.ok) {
        toast.success("Tarifa eliminada");
        setAEliminar(null);
        cargar();
      } else toast.error(res.error ?? "Error");
    });
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        Cuota por aterrizaje. Aeródromo o modelo vacíos = aplica a cualquiera; la más
        específica gana (aeródromo+modelo &gt; aeródromo &gt; modelo).
      </p>
      <div className="space-y-1.5">
        {tarifas.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-sm">
            <span className="font-mono w-14">{t.codigo_iata ?? "*"}</span>
            <span className="w-24 truncate">{t.modelo ?? "Cualquiera"}</span>
            {t.variable && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
                Variable
              </Badge>
            )}
            <Input
              type="number"
              step="0.01"
              min="0"
              defaultValue={t.monto}
              onBlur={(e) => {
                if (e.target.value !== String(t.monto)) guardarMonto(t, e.target.value);
              }}
              disabled={pending}
              className="h-8 w-28 text-right ml-auto"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => setAEliminar(t)}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <Input
          placeholder="IATA"
          value={nuevo.codigo_iata}
          onChange={(e) => setNuevo((n) => ({ ...n, codigo_iata: e.target.value.toUpperCase() }))}
          className="h-8 w-20"
        />
        <Input
          placeholder="Modelo (Kodiak…)"
          value={nuevo.modelo}
          onChange={(e) => setNuevo((n) => ({ ...n, modelo: e.target.value }))}
          className="h-8 w-36"
        />
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="Monto MXN"
          value={nuevo.monto}
          onChange={(e) => setNuevo((n) => ({ ...n, monto: e.target.value }))}
          className="h-8 w-28 text-right ml-auto"
        />
        <Button variant="secondary" size="sm" className="h-8" onClick={agregar} disabled={pending}>
          Agregar
        </Button>
      </div>

      <AlertDialog open={aEliminar != null} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              {aEliminar
                ? `${aEliminar.codigo_iata ?? "Cualquier aeródromo"} · ${aEliminar.modelo ?? "cualquier modelo"} · $${aEliminar.monto} ${aEliminar.moneda}. `
                : ""}
              Los aterrizajes de ese aeródromo quedarán sin monto sugerido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                eliminar();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
