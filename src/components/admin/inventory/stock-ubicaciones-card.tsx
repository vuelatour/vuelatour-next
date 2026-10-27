import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { cantidadConUnidad } from "@/lib/admin/inventario-eliminar";
import {
  AYUDA_STOCK_UBICACIONES,
  ETIQUETA_PRINCIPAL,
  ETIQUETA_TOTAL,
  ETIQUETA_TRASPASAR,
  SIN_DATO_UBICACIONES,
  SIN_STOCK_UBICACIONES,
  TITULO_PRINCIPAL,
  TITULO_STOCK_UBICACIONES,
  filasStockUbicacion,
  textoResumenStockUbicaciones,
  totalStockUbicaciones,
} from "@/lib/admin/inventario-ubicaciones-stock";
import { MovimientoButton } from "./movimiento-button";
import type { InventarioEmpaque, InventarioUbicacion, StockUbicacion } from "@/types/inventory";

/**
 * «Stock y ubicaciones» (27-oct-2026, API 0.0.111): la tablita que pidió la
 * oficina — de estos 200, 100 en Toledo, 5 en Mérida y 95 en Corner — al
 * fondo de la ficha, después de «Empaques y fotos». Los números los manda el
 * API (`item.stock_por_ubicacion`, derivados del cardex); aquí solo se
 * pintan. El botón «Traspasar» abre el movimiento con el tipo TRASPASO.
 */
export function StockUbicacionesCard(props: {
  itemId: string;
  itemNombre: string;
  unidad: string | null | undefined;
  /** `item.stock_por_ubicacion`; undefined = API previo (sin el dato). */
  stock: StockUbicacion[] | null | undefined;
  /** Existencia TOTAL del producto (la de siempre, `item.stock`). */
  existenciaTotal: number;
  /** Catálogo de bodegas (null = sin catálogo: no se ofrece «Traspasar»). */
  ubicaciones: InventarioUbicacion[] | null;
  ubicacionPrincipalId: string | null;
  /** Lo que necesita el diálogo del movimiento para «Traspasar». */
  traspaso: {
    empaques: InventarioEmpaque[];
    aircraft: { id: string; matricula: string }[];
    providers: { id: string; nombre: string }[];
    margenVentaPct?: number | null;
    tieneCostoVigente?: boolean;
    tcHoy?: number | null;
  };
}) {
  const filas = filasStockUbicacion(props.stock);
  const total = totalStockUbicaciones(filas);
  const resumen = textoResumenStockUbicaciones(filas, props.unidad);
  const conCatalogo = !!props.ubicaciones && props.ubicaciones.length > 0;
  const sinDato = props.stock === undefined;
  const totalDifiere = !sinDato && Math.abs(total - Number(props.existenciaTotal)) > 1e-9;
  return (
    <Card data-stock-ubicaciones="">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{TITULO_STOCK_UBICACIONES}</CardTitle>
          <CardDescription className="text-xs">{AYUDA_STOCK_UBICACIONES}</CardDescription>
        </div>
        {conCatalogo && (
          <MovimientoButton
            itemId={props.itemId}
            itemNombre={props.itemNombre}
            unidad={props.unidad}
            empaques={props.traspaso.empaques}
            aircraft={props.traspaso.aircraft}
            providers={props.traspaso.providers}
            margenVentaPct={props.traspaso.margenVentaPct}
            tieneCostoVigente={props.traspaso.tieneCostoVigente}
            tcHoy={props.traspaso.tcHoy}
            ubicaciones={props.ubicaciones}
            ubicacionPrincipalId={props.ubicacionPrincipalId}
            stockPorUbicacion={props.stock ?? null}
            initialTipo="TRASPASO"
            etiqueta={ETIQUETA_TRASPASAR}
            variant="outline"
          />
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {sinDato ? (
          <p className="text-sm text-muted-foreground">{SIN_DATO_UBICACIONES}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{SIN_STOCK_UBICACIONES}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Bodega</TableHead>
                  <TableHead className="text-right text-xs">Existencia</TableHead>
                  <TableHead className="text-right text-xs">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.ubicacion_id ?? "sin"} data-bodega={f.ubicacion_id ?? "sin"}>
                    <TableCell className="whitespace-normal">
                      {f.nombre}
                      {f.es_principal && (
                        <span
                          className="ml-1.5 inline-flex rounded-full bg-brand-600/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-brand-600 dark:text-brand-400"
                          title={TITULO_PRINCIPAL}
                        >
                          {ETIQUETA_PRINCIPAL}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        f.cantidad < 0 && "text-red-600",
                      )}
                    >
                      {cantidadConUnidad(f.cantidad, props.unidad)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {f.pct != null ? `${f.pct} %` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="text-xs font-semibold">{ETIQUETA_TOTAL}</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {cantidadConUnidad(total, props.unidad)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">100 %</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
        {resumen && <p className="text-xs text-muted-foreground">{resumen}</p>}
        {totalDifiere && (
          <p className="text-xs text-amber-700 dark:text-amber-400" data-total-difiere="">
            El reparto suma {cantidadConUnidad(total, props.unidad)} y la existencia del producto es{" "}
            {cantidadConUnidad(Number(props.existenciaTotal), props.unidad)}: recarga la página; si
            sigue así, avisa a soporte.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
