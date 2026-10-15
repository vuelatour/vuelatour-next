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
import {
  AYUDA_MODO_UNIR,
  AYUDA_UN_SELECCIONADO,
  INSTRUCCION_MODO_UNIR,
  INSTRUCCION_MODO_UNIR_CORTA,
  TEXTO_BOTON_UNIR,
  TEXTO_LIMPIAR_SELECCION,
  TEXTO_MODO_UNIR,
  TEXTO_TERMINAR_BARRA,
  TEXTO_TERMINAR_UNIR,
  TEXTO_UNIR_SIN_LISTA,
  TITULO_MINIMO_UNIR,
  TITULO_TERMINAR_UNIR,
  textoGastosSeleccionados,
  tituloUnirSinSeleccionables,
} from "@/lib/admin/gastos-vista";
import { llamarSinLanzar } from "@/lib/admin/reparto-gasto";

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
  /**
   * Modo «Unir en compra» (14-oct-2026): las casillas SOLO aparecen con el
   * modo encendido («Unir en compra…» en la fila de vistas). Apagarlo limpia
   * la selección.
   */
  modoUnir: boolean;
  setModoUnir: (activo: boolean) => void;
  /** ¿La vista tiene gastos que se puedan unir? (la barra lo explica si no). */
  haySeleccionables: boolean;
  /**
   * La lista de la página NO cargó (revisión del 14-oct-2026): no se sabe qué
   * hay, así que la barra no dice «no hay gastos que se puedan unir», el
   * botón del modo no se ofrece apagado y lo marcado no se poda.
   */
  cargaFallida: boolean;
}

const Ctx = createContext<SeleccionCtx | null>(null);

/**
 * Selección múltiple de la tabla de Gastos (una sola tabla desde el
 * 14-oct-2026). Null fuera del provider: las tablas que no viven en
 * /admin/expenses (vuelo, caja chica) no muestran casillas.
 */
export function useSeleccionGastos(): SeleccionCtx | null {
  return useContext(Ctx);
}

export function ExpensesSeleccionProvider({
  idsVisibles,
  cargaFallida = false,
  modoInicial = false,
  children,
}: {
  /**
   * Ids de los gastos SUELTOS seleccionables que la página muestra ahora
   * (los arma page.tsx con la misma regla que la casilla). La selección se
   * poda a estos ids.
   */
  idsVisibles: string[];
  /** La lista principal NO cargó (`!lista.ok`): `idsVisibles` vacío no significa «no hay». */
  cargaFallida?: boolean;
  /** Modo «Unir en compra» al montar. SOLO para pruebas (la página no lo pasa). */
  modoInicial?: boolean;
  children: React.ReactNode;
}) {
  const [seleccion, setSeleccion] = useState<Map<string, GastoSeleccionado>>(() => new Map());
  const [modoUnir, setModoUnirEstado] = useState(modoInicial);

  // Poda anti "selección fantasma": tras eliminar un gasto, ligarlo a una
  // compra desde ⋯ o cambiar de filtro/pestaña, el provider sigue montado y
  // conservaba ids que ya no están en pantalla ("Unir" daba 404/409). Se
  // sincroniza con lo que el server mandó en esta vista.
  useEffect(() => {
    // Con la lista caída no se sabe qué hay: lo marcado se conserva.
    if (cargaFallida) return;
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
  }, [idsVisibles, cargaFallida]);

  const toggle = useCallback((g: GastoSeleccionado) => {
    setSeleccion((prev) => {
      const next = new Map(prev);
      if (next.has(g.id)) next.delete(g.id);
      else next.set(g.id, g);
      return next;
    });
  }, []);
  const limpiar = useCallback(() => setSeleccion(new Map()), []);
  // Apagar el modo limpia la selección: al volver a encenderlo no reaparecen
  // casillas marcadas de antes.
  const setModoUnir = useCallback((activo: boolean) => {
    setModoUnirEstado(activo);
    if (!activo) setSeleccion(new Map());
  }, []);
  const haySeleccionables = idsVisibles.length > 0;

  const value = useMemo(
    () => ({ seleccion, toggle, limpiar, modoUnir, setModoUnir, haySeleccionables, cargaFallida }),
    [seleccion, toggle, limpiar, modoUnir, setModoUnir, haySeleccionables, cargaFallida],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <UnirCompraBar />
    </Ctx.Provider>
  );
}

/** Unir exige la factura de mercancía + al menos otro pago (el API pide ≥2). */
const MIN_GASTOS_UNIR = 2;

/**
 * Botón de la fila de vistas que enciende/apaga el modo «Unir en compra»
 * (14-oct-2026): antes las casillas estaban SIEMPRE en la tabla. Siempre
 * habilitado (un botón deshabilitado no enseña su `title`); si la vista no
 * tiene nada que unir, la barra flotante lo explica. Null fuera del provider.
 */
export function UnirCompraToggle() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const activo = ctx.modoUnir;
  // Lista caída: no se ofrece ENTRAR al modo (no hay qué unir a la vista);
  // si ya estaba encendido, sigue para poder terminarlo.
  if (ctx.cargaFallida && !activo) return null;
  return (
    <Button
      variant={activo ? "secondary" : "outline"}
      aria-pressed={activo}
      onClick={() => ctx.setModoUnir(!activo)}
      className="gap-1.5"
      title={activo ? TITULO_TERMINAR_UNIR : AYUDA_MODO_UNIR}
    >
      {activo ? (
        <XMarkIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <ShoppingCartIcon className="h-4 w-4" aria-hidden="true" />
      )}
      {activo ? TEXTO_TERMINAR_UNIR : TEXTO_MODO_UNIR}
    </Button>
  );
}

/**
 * Barra flotante del modo «Unir en compra» (solo con el modo encendido): sin
 * nada que unir en la vista lo dice; sin marcas, la instrucción; con marcas,
 * cuántas, «Unir en compra», «Limpiar» y «Terminar».
 */
function UnirCompraBar() {
  const ctx = useContext(Ctx);
  const [open, setOpen] = useState(false);
  // Alto REAL de la barra (cambia con el ancho y con lo marcado): el hueco al
  // final de la página mide lo mismo, así nunca tapa el paginador (revisión
  // del 14-oct-2026: el h-20 fijo no alcanzaba en teléfono).
  const [altoBarra, setAltoBarra] = useState(0);
  const medirBarra = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setAltoBarra(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!ctx || !ctx.modoUnir) return null;
  const n = ctx.seleccion.size;
  const puedeUnir = n >= MIN_GASTOS_UNIR;
  const terminar = (
    <Button size="sm" variant="ghost" onClick={() => ctx.setModoUnir(false)} title={TITULO_TERMINAR_UNIR}>
      {TEXTO_TERMINAR_BARRA}
    </Button>
  );
  return (
    <>
      {/* Hueco al final de la página: con el modo encendido la barra fija no
          tapa el paginador ni las últimas filas (alto de la barra + su
          `bottom-6` + aire; h-20 hasta medirla). */}
      <div
        aria-hidden="true"
        data-hueco-barra-unir=""
        className={altoBarra > 0 ? undefined : "h-20"}
        style={altoBarra > 0 ? { height: Math.ceil(altoBarra) + 32 } : undefined}
      />
      {/* Ancho: del teléfono completo (con 1rem de margen) y centrada con
          `mx-auto` + `w-fit`. Con `left-1/2` + translate el ancho disponible
          era MEDIO viewport: en 390 px medía 195 × 218 y tapaba «Página
          anterior» (revisión del 14-oct-2026). */}
      <div
        ref={medirBarra}
        data-barra-unir
        className="fixed inset-x-4 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 shadow-lg"
      >
        {ctx.cargaFallida ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <p className="max-w-md text-sm text-muted-foreground" role="status">
              {TEXTO_UNIR_SIN_LISTA}
            </p>
            {terminar}
          </div>
        ) : !ctx.haySeleccionables && n === 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <p className="max-w-md text-sm text-muted-foreground">{tituloUnirSinSeleccionables()}</p>
            {terminar}
          </div>
        ) : n === 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <p className="max-w-md text-sm text-muted-foreground">
              {/* Corta en teléfono: la barra no debe tapar media pantalla. */}
              <span className="sm:hidden">{INSTRUCCION_MODO_UNIR_CORTA}</span>
              <span className="hidden sm:inline">{INSTRUCCION_MODO_UNIR}</span>
            </p>
            <Button size="sm" className="gap-1.5" disabled>
              <ShoppingCartIcon className="h-4 w-4" />
              {TEXTO_BOTON_UNIR}
            </Button>
            {terminar}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{n}</span> {textoGastosSeleccionados(n)}
              </p>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setOpen(true)}
                disabled={!puedeUnir}
                title={puedeUnir ? undefined : TITULO_MINIMO_UNIR}
              >
                <ShoppingCartIcon className="h-4 w-4" />
                {TEXTO_BOTON_UNIR}
              </Button>
              <Button size="sm" variant="ghost" onClick={ctx.limpiar} className="gap-1">
                <XMarkIcon className="h-4 w-4" />
                {TEXTO_LIMPIAR_SELECCION}
              </Button>
              {terminar}
            </div>
            {!puedeUnir && (
              <p className="max-w-md text-center text-[11px] text-muted-foreground">
                {AYUDA_UN_SELECCIONADO}
              </p>
            )}
          </>
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
      // Sin lanzar: un fallo de transporte (red, deploy) no tumba la página
      // al error boundary; se dice en el toast y el diálogo sigue abierto.
      const llamada = await llamarSinLanzar(() =>
        unirGastosEnCompraAction({
          gasto_ids: gastos.map((g) => g.id),
          mercancia_gasto_id: elegido,
        }),
      );
      const r: Awaited<ReturnType<typeof unirGastosEnCompraAction>> = llamada.ok
        ? llamada.valor
        : { ok: false, error: llamada.error };
      if (r.ok && r.data) {
        toast.success(`Compra #${r.data.folio} creada con ${gastos.length} pagos`);
        // Unir con éxito apaga el modo (y con él la selección).
        ctx.setModoUnir(false);
        onOpenChange(false);
        router.push(`/admin/inventory/compras/${r.data.id}`);
      } else {
        toast.error(r.error || "No se pudieron unir los gastos");
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
