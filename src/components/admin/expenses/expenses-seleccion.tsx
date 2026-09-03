"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { ShoppingCartIcon, XMarkIcon } from "@heroicons/react/24/outline";
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
import { unirGastosEnCompraAction } from "@/app/admin/inventory/compras/actions";
import { fmtDateOnly } from "@/lib/datetime";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { fmtMontoMoneda, sugerirRolCompra, COMPRA_ROL_LABELS } from "@/types/compras";
import type { Gasto } from "@/types/expenses";

/** Lo mínimo del gasto para mostrarlo en el diálogo de unir. */
export interface GastoSeleccionado {
  id: string;
  categoria: string;
  monto: string;
  moneda: string;
  fecha_gasto: string | null;
  proveedor: string | null;
  descripcion: string | null;
}

export function aGastoSeleccionado(g: Gasto): GastoSeleccionado {
  return {
    id: g.id,
    categoria: g.categoria,
    monto: g.monto,
    moneda: g.moneda,
    fecha_gasto: g.fecha_gasto,
    proveedor: g.proveedor?.nombre ?? null,
    descripcion: (g.notas ?? "").split("\n")[0].trim() || null,
  };
}

interface SeleccionCtx {
  seleccion: Map<string, GastoSeleccionado>;
  toggle: (g: GastoSeleccionado) => void;
  limpiar: () => void;
}

const Ctx = createContext<SeleccionCtx | null>(null);

/**
 * Selección múltiple de gastos compartida entre las tablas de la página
 * (generales y operativos). Null fuera del provider: las tablas que no viven
 * en /admin/expenses (vuelo, caja chica) no muestran casillas.
 */
export function useSeleccionGastos(): SeleccionCtx | null {
  return useContext(Ctx);
}

export function ExpensesSeleccionProvider({
  idsVisibles,
  children,
}: {
  /**
   * Ids de los gastos SUELTOS seleccionables que la página muestra ahora
   * (los arma page.tsx con la misma regla que la casilla). La selección se
   * poda a estos ids.
   */
  idsVisibles: string[];
  children: React.ReactNode;
}) {
  const [seleccion, setSeleccion] = useState<Map<string, GastoSeleccionado>>(() => new Map());

  // Poda anti "selección fantasma": tras eliminar un gasto, ligarlo a una
  // compra desde ⋯ o cambiar de filtro/pestaña, el provider sigue montado y
  // conservaba ids que ya no están en pantalla ("Unir" daba 404/409). Se
  // sincroniza con lo que el server mandó en esta vista.
  useEffect(() => {
    const visibles = new Set(idsVisibles);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeleccion((prev) => {
      let cambio = false;
      const next = new Map<string, GastoSeleccionado>();
      for (const [id, g] of prev) {
        if (visibles.has(id)) next.set(id, g);
        else cambio = true;
      }
      return cambio ? next : prev;
    });
  }, [idsVisibles]);

  const toggle = useCallback((g: GastoSeleccionado) => {
    setSeleccion((prev) => {
      const next = new Map(prev);
      if (next.has(g.id)) next.delete(g.id);
      else next.set(g.id, g);
      return next;
    });
  }, []);
  const limpiar = useCallback(() => setSeleccion(new Map()), []);

  const value = useMemo(() => ({ seleccion, toggle, limpiar }), [seleccion, toggle, limpiar]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <UnirCompraBar />
    </Ctx.Provider>
  );
}

/** Unir exige la factura de mercancía + al menos otro pago (el API pide ≥2). */
const MIN_GASTOS_UNIR = 2;

/** Barra flotante: aparece con la primera casilla marcada. */
function UnirCompraBar() {
  const ctx = useContext(Ctx);
  const [open, setOpen] = useState(false);
  if (!ctx || ctx.seleccion.size === 0) return null;
  const n = ctx.seleccion.size;
  const puedeUnir = n >= MIN_GASTOS_UNIR;
  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 shadow-lg">
        <div className="flex items-center gap-3">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{n}</span>{" "}
            {n === 1 ? "gasto seleccionado" : "gastos seleccionados"}
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setOpen(true)}
            disabled={!puedeUnir}
            title={puedeUnir ? undefined : "Marca al menos dos gastos para unirlos"}
          >
            <ShoppingCartIcon className="h-4 w-4" />
            Unir en compra
          </Button>
          <Button size="sm" variant="ghost" onClick={ctx.limpiar} className="gap-1">
            <XMarkIcon className="h-4 w-4" />
            Limpiar
          </Button>
        </div>
        {!puedeUnir && (
          <p className="max-w-md text-center text-[11px] text-muted-foreground">
            Marca la factura de mercancía y al menos otro pago (envío, impuestos…). Para un solo
            gasto usa &ldquo;Crear compra con esta factura&rdquo; en su menú.
          </p>
        )}
      </div>
      <UnirCompraDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Elegir cuál de los seleccionados es la factura de MERCANCÍA (las
 * refacciones); el resto los clasifica el API como envío/impuestos/otro
 * (corregible en la compra). Confirmar crea la compra y navega a ella.
 */
function UnirCompraDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ctx = useContext(Ctx);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mercanciaId, setMercanciaId] = useState<string | null>(null);

  const gastos = useMemo(() => {
    const arr = [...(ctx?.seleccion.values() ?? [])];
    return arr.sort((a, b) => (a.fecha_gasto ?? "").localeCompare(b.fecha_gasto ?? ""));
  }, [ctx?.seleccion]);

  // Propuesta: la única REFACCION; si hay varias o ninguna, la de mayor monto.
  const propuesta = useMemo(() => {
    const refacciones = gastos.filter((g) => g.categoria === "REFACCION");
    if (refacciones.length === 1) return refacciones[0].id;
    return [...gastos].sort((a, b) => Number(b.monto) - Number(a.monto))[0]?.id ?? null;
  }, [gastos]);
  const elegido = mercanciaId && gastos.some((g) => g.id === mercanciaId) ? mercanciaId : propuesta;

  // Defensa en profundidad: la barra ya no abre el diálogo con < 2, pero la
  // selección puede encoger (poda) con el diálogo abierto.
  const suficientes = gastos.length >= MIN_GASTOS_UNIR;

  const confirmar = () => {
    if (!ctx || !elegido || !suficientes) return;
    startTransition(async () => {
      const r = await unirGastosEnCompraAction({
        gasto_ids: gastos.map((g) => g.id),
        mercancia_gasto_id: elegido,
      });
      if (r.ok && r.data) {
        toast.success(`Compra #${r.data.folio} creada con ${gastos.length} pagos`);
        ctx.limpiar();
        onOpenChange(false);
        router.push(`/admin/inventory/compras/${r.data.id}`);
      } else {
        toast.error(r.error ?? "No se pudieron unir los gastos");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Unir {gastos.length} {gastos.length === 1 ? "gasto" : "gastos"} en una compra
          </DialogTitle>
          <DialogDescription>
            Marca cuál es la factura de la mercancía (las refacciones). Los demás se clasifican
            solos como envío, impuestos u otro; lo puedes corregir en la compra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {gastos.map((g) => {
            const esMercancia = g.id === elegido;
            const rolPrevisto = esMercancia
              ? "MERCANCIA"
              : sugerirRolCompra(g.categoria, [g.proveedor, g.descripcion].join(" "));
            return (
              <label
                key={g.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                  esMercancia ? "border-brand-600/60 bg-brand-600/5" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="mercancia"
                  checked={esMercancia}
                  onChange={() => setMercanciaId(g.id)}
                  className="mt-1 h-4 w-4 accent-brand-600"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {fmtDateOnly(g.fecha_gasto)} · {categoriaGastoLabel(g.categoria)} ·{" "}
                    <span className="tabular-nums">{fmtMontoMoneda(g.monto, g.moneda)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[g.proveedor, g.descripcion].filter(Boolean).join(" · ") || "Sin descripción"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {esMercancia ? "Mercancía" : `→ ${COMPRA_ROL_LABELS[rolPrevisto]}`}
                </span>
              </label>
            );
          })}
        </div>
        {!suficientes && (
          <p className="text-xs text-amber-600">
            Se necesitan al menos dos gastos: la factura de mercancía y otro pago (envío,
            impuestos…). Para un solo gasto usa &ldquo;Crear compra con esta factura&rdquo; en su
            menú.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !elegido || !suficientes}>
            {pending ? "Creando compra…" : "Unir en compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
