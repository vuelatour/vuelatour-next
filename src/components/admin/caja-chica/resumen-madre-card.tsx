import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CajaFondoDetail, ResumenCajaMadre } from "@/types/caja-chica";
import {
  DESCRIPCION_RESUMEN_MADRE,
  ENCABEZADOS_COLABORADORES,
  ETIQUETA_ASIGNADO,
  ETIQUETA_DIFERENCIA,
  ETIQUETA_EFECTIVO_ESPERADO,
  ETIQUETA_EFECTIVO_LIBRO,
  ETIQUETA_ENTREGAS_PENDIENTES,
  ETIQUETA_FONDO_PROPIO,
  ETIQUETA_FONDO_TOTAL,
  ETIQUETA_GASTOS_PENDIENTES,
  ETIQUETA_OTROS_PENDIENTES,
  ETIQUETA_POR_SOLICITAR,
  NOTA_FONDO_PROPIO,
  NOTA_POR_SOLICITAR,
  TITULO_COLABORADORES,
  TITULO_MI_CAJA,
  TITULO_RESUMEN_MADRE,
  estadoCuadreMadre,
  filasColaboradoresResumen,
  montoCaja,
  textoCajas,
  textoConteoMonto,
  tituloEnlaceCaja,
  type TonoCuadre,
} from "@/lib/admin/caja-chica-madre";

const CLASE_TONO_CUADRE: Record<TonoCuadre, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ambar: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  rojo: "border-destructive/40 bg-destructive/10 text-destructive",
  neutro: "border-border bg-muted/40 text-muted-foreground",
};

/**
 * FONDO CONSOLIDADO de una caja MADRE (27-oct-2026). Se monta bajo las
 * tarjetas del fondo solo cuando el API manda `resumen_madre` (la caja fondea
 * a alguien). Server-safe (sin hooks): todas las cifras vienen del API y aquí
 * solo se formatean (`lib/admin/caja-chica-madre.ts`).
 */
export function ResumenMadreCard({
  fondo,
  resumen,
}: {
  fondo: Pick<CajaFondoDetail, "moneda" | "cajas_fondeadas">;
  resumen: ResumenCajaMadre;
}) {
  const m = (n: number | null | undefined) => (n == null ? "—" : montoCaja(Number(n), fondo.moneda));
  const filas = filasColaboradoresResumen(fondo);
  const cuadre = estadoCuadreMadre(resumen, fondo.moneda);
  return (
    <Card data-resumen-madre="">
      <CardHeader>
        <CardTitle className="text-base">{TITULO_RESUMEN_MADRE}</CardTitle>
        <CardDescription>{DESCRIPCION_RESUMEN_MADRE}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra etiqueta={ETIQUETA_FONDO_TOTAL} valor={m(resumen.fondo_total)} />
          <Cifra
            etiqueta={ETIQUETA_ASIGNADO}
            valor={m(resumen.asignado_colaboradores)}
            nota={textoCajas(resumen.cajas)}
          />
          <Cifra etiqueta={ETIQUETA_FONDO_PROPIO} valor={m(resumen.fondo_propio)} nota={NOTA_FONDO_PROPIO} />
          <Cifra
            etiqueta={ETIQUETA_POR_SOLICITAR}
            valor={m(resumen.por_solicitar)}
            nota={NOTA_POR_SOLICITAR}
            clase={resumen.por_solicitar > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{TITULO_COLABORADORES}</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" data-colaboradores="">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {ENCABEZADOS_COLABORADORES.map((h, i) => (
                    <th key={h} className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.fondoId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link
                        href={f.href}
                        title={tituloEnlaceCaja(f.nombre)}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {f.nombre}
                      </Link>
                      {f.acumulada && (
                        <span className="ml-2 text-[11px] text-muted-foreground">gasta de su bolsa</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.fondoAsignado}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        f.efectivoTono === "rojo" ? "text-destructive" : ""
                      }`}
                    >
                      {f.efectivo}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{f.gastosPendientes}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        f.porReponerTono === "ambar" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"
                      }`}
                    >
                      {f.porReponer}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{f.ultimaReposicion}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-muted/20 font-medium">
                <tr>
                  <td className="px-3 py-2">Total · {textoCajas(resumen.cajas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(resumen.asignado_colaboradores)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(resumen.efectivo_colaboradores)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {textoConteoMonto(resumen.gastos_pendientes_colaboradores, fondo.moneda, "gasto", "gastos")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(resumen.pendiente_colaboradores)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{TITULO_MI_CAJA}</p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" data-mi-caja="">
            <Linea
              etiqueta={ETIQUETA_GASTOS_PENDIENTES}
              valor={textoConteoMonto(resumen.gastos_pendientes, fondo.moneda, "gasto", "gastos")}
            />
            <Linea
              etiqueta={ETIQUETA_ENTREGAS_PENDIENTES}
              valor={textoConteoMonto(resumen.entregas_pendientes, fondo.moneda, "entrega", "entregas")}
            />
            {resumen.otros_pendientes !== 0 && (
              <Linea etiqueta={ETIQUETA_OTROS_PENDIENTES} valor={m(resumen.otros_pendientes)} />
            )}
            <Linea etiqueta={ETIQUETA_EFECTIVO_ESPERADO} valor={m(resumen.efectivo_esperado)} />
            <Linea
              etiqueta={ETIQUETA_EFECTIVO_LIBRO}
              valor={m(resumen.efectivo_libro)}
              clase={resumen.efectivo_libro < 0 ? "text-destructive" : undefined}
            />
            <Linea
              etiqueta={ETIQUETA_DIFERENCIA}
              valor={m(resumen.diferencia)}
              clase={
                cuadre.tono === "rojo"
                  ? "text-destructive"
                  : cuadre.tono === "ambar"
                    ? "text-amber-600 dark:text-amber-400"
                    : undefined
              }
            />
          </dl>
          <div
            role="status"
            data-cuadre={cuadre.tono}
            className={`mt-3 rounded-lg border px-4 py-3 text-sm ${CLASE_TONO_CUADRE[cuadre.tono]}`}
          >
            <p className="font-medium">{cuadre.titulo}</p>
            {cuadre.detalle && <p className="mt-1 text-xs opacity-90">{cuadre.detalle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Cifra({
  etiqueta,
  valor,
  nota,
  clase,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  clase?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${clase ?? ""}`}>{valor}</p>
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Linea({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className={`tabular-nums font-medium ${clase ?? ""}`}>{valor}</dd>
    </div>
  );
}
