"use client";

import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BADGE_INACTIVO,
  BOTON_DIVIDIR_IGUALES,
  BOTON_EDITAR_REPARTO,
  BOTON_QUITAR_REPARTO,
  BOTON_REINTENTAR,
  TEXTO_CARGANDO_AVIONES,
  TEXTO_MARCA_AVIONES,
  TEXTO_SIN_AVIONES_ACTIVOS,
  TITLE_QUITAR_REPARTO,
  TITULO_RESUMEN_REPARTO,
  ariaMontoAvion,
  centavosDe,
  dividirIgualesCents,
  lineaResumenReparto,
  montoReparto,
  resumenReparto,
  siguienteMontoMarcado,
  textoRepartoInactivos,
  textoRepartoSinMonto,
  type AvionReparto,
  type ParteReparto,
  type SeleccionReparto,
} from "@/lib/admin/reparto-gasto";

/**
 * Editor EN LÍNEA del reparto de un gasto entre aviones (14-oct-2026,
 * «Verificar / editar»): presentación pura con el marcado del alta
 * (`expense-create-dialog.tsx`). Todos los textos salen de
 * `lib/admin/reparto-gasto.ts`; las sumas son GUÍA (la regla Σ ≤ monto es
 * del API). Vive DENTRO del formulario del diálogo: todo botón es
 * `type="button"` y lleva `cursor-pointer`, y Enter en una casilla o en un
 * monto NO envía el formulario (era «Guardar» con el reparto a medias):
 * en un monto pasa al del siguiente avión marcado.
 */
export function RepartoAvionesEditor({
  filas,
  seleccion,
  onSeleccion,
  techoCents,
  moneda,
  disabled,
  error,
  onReintentar,
  idPrefijo,
  cargando,
}: {
  /** null = aún sin aviones ni partes que pintar («Cargando aviones activos…»). */
  filas: AvionReparto[] | null;
  seleccion: SeleccionReparto;
  onSeleccion: (s: SeleccionReparto) => void;
  /** Total pagado en vivo, en centavos (techo del reparto). */
  techoCents: number;
  moneda: string;
  disabled?: boolean;
  /** Los aviones activos no cargaron: el editor no se usa (el texto + «Reintentar»). */
  error?: string | null;
  onReintentar?: () => void;
  /** Prefijo de los ids (únicos por gasto). */
  idPrefijo: string;
  /** Las filas son las partes guardadas mientras llegan los aviones activos. */
  cargando?: boolean;
}) {
  if (error) {
    return (
      <div
        data-reparto-editor=""
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        role="status"
      >
        <span>{error}</span>
        {onReintentar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 cursor-pointer text-xs"
            onClick={onReintentar}
          >
            {BOTON_REINTENTAR}
          </Button>
        )}
      </div>
    );
  }
  if (filas === null) {
    return (
      <p data-reparto-editor="" className="py-3 text-center text-xs text-muted-foreground">
        {TEXTO_CARGANDO_AVIONES}
      </p>
    );
  }

  const resumen = resumenReparto(filas, seleccion, techoCents);
  const fijar = (id: string, cambio: Partial<{ incluir: boolean; monto: string }>) => {
    const actual = seleccion[id] ?? { incluir: false, monto: "" };
    onSeleccion({ ...seleccion, [id]: { ...actual, ...cambio } });
  };
  /** Enter dentro del editor: nunca el «Guardar» implícito del formulario. */
  const sinEnviar = (e: React.KeyboardEvent<HTMLInputElement>, id: string, enMonto: boolean) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!enMonto) return;
    const siguiente = siguienteMontoMarcado(filas, seleccion, id);
    if (siguiente) document.getElementById(`${idPrefijo}-monto-${siguiente}`)?.focus();
  };
  const dividir = () => {
    const partes = dividirIgualesCents(techoCents, resumen.incluidos.length);
    const next: SeleccionReparto = { ...seleccion };
    resumen.incluidos.forEach((f, i) => {
      next[f.id] = { incluir: true, monto: ((partes[i] ?? 0) / 100).toFixed(2) };
    });
    onSeleccion(next);
  };

  return (
    <div data-reparto-editor="" className="space-y-2">
      {cargando && <p className="text-xs text-muted-foreground">{TEXTO_CARGANDO_AVIONES}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{TEXTO_MARCA_AVIONES}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 cursor-pointer gap-1.5"
          onClick={dividir}
          disabled={disabled || resumen.incluidos.length === 0}
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
          {BOTON_DIVIDIR_IGUALES}
        </Button>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {filas.map((f) => {
          const sel = seleccion[f.id] ?? { incluir: false, monto: "" };
          return (
            <label
              key={f.id}
              data-fila-reparto={f.matricula}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40"
            >
              <input
                id={`${idPrefijo}-incluir-${f.id}`}
                type="checkbox"
                checked={sel.incluir}
                disabled={disabled}
                onChange={(e) => fijar(f.id, { incluir: e.target.checked })}
                onKeyDown={(e) => sinEnviar(e, f.id, false)}
                className="h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
              />
              <span className="font-mono text-sm font-medium">{f.matricula}</span>
              {f.modelo && !f.inactivo && (
                <span className="truncate text-xs text-muted-foreground">{f.modelo}</span>
              )}
              {f.inactivo && (
                <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-600">
                  {BADGE_INACTIVO}
                </Badge>
              )}
              <Input
                id={`${idPrefijo}-monto-${f.id}`}
                aria-label={ariaMontoAvion(f.matricula)}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={sel.monto}
                placeholder="0.00"
                disabled={disabled || !sel.incluir}
                onChange={(e) => fijar(f.id, { monto: e.target.value })}
                onKeyDown={(e) => sinEnviar(e, f.id, true)}
                className="ml-auto h-8 w-28 text-right"
              />
            </label>
          );
        })}
        {filas.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {TEXTO_SIN_AVIONES_ACTIVOS}
          </p>
        )}
      </div>
      {/* Línea viva contra el TOTAL PAGADO: roja si la suma se pasa. */}
      <p
        data-linea-reparto=""
        className={
          resumen.excedidoCents > 0
            ? "text-xs font-medium text-red-600 dark:text-red-400"
            : "text-xs text-muted-foreground"
        }
      >
        {lineaResumenReparto({ ...resumen, techoCents, moneda })}
      </p>
      {resumen.sinMonto.length > 0 && (
        <p className="text-xs text-amber-600">{textoRepartoSinMonto(resumen.sinMonto)}</p>
      )}
      {resumen.inactivos.length > 0 && (
        <p className="text-xs text-amber-600">{textoRepartoInactivos(resumen.inactivos)}</p>
      )}
    </div>
  );
}

/**
 * Resumen de SOLO LECTURA de un reparto guardado: una línea por avión, la
 * línea del total pagado y los botones «Quitar el reparto» (solo cambia a
 * «Un avión»: se confirma al guardar) y «Editar reparto» (abre el editor).
 */
export function RepartoResumen({
  partes,
  moneda,
  techoCents,
  onEditar,
  onQuitar,
  disabled,
}: {
  partes: ParteReparto[];
  moneda: string;
  techoCents: number;
  onEditar: () => void;
  onQuitar: () => void;
  disabled?: boolean;
}) {
  const sumaCents = partes.reduce((acc, p) => acc + centavosDe(p.monto), 0);
  return (
    <div data-reparto-resumen="" className="space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-xs font-medium">{TITULO_RESUMEN_REPARTO}</p>
      <ul className="space-y-0.5">
        {partes.map((p) => (
          <li key={p.aeronave_id} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-mono font-medium">{p.matricula ?? "¿?"}</span>
            <span className="font-mono">{montoReparto(p.monto, moneda)}</span>
          </li>
        ))}
      </ul>
      <p
        className={
          sumaCents > techoCents
            ? "text-xs font-medium text-red-600 dark:text-red-400"
            : "text-xs text-muted-foreground"
        }
      >
        {lineaResumenReparto({
          sumaCents,
          techoCents,
          restoCents: Math.max(0, techoCents - sumaCents),
          excedidoCents: Math.max(0, sumaCents - techoCents),
          moneda,
        })}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="cursor-pointer"
          title={TITLE_QUITAR_REPARTO}
          onClick={onQuitar}
          disabled={disabled}
        >
          {BOTON_QUITAR_REPARTO}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="cursor-pointer gap-1.5"
          onClick={onEditar}
          disabled={disabled}
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
          {BOTON_EDITAR_REPARTO}
        </Button>
      </div>
    </div>
  );
}
