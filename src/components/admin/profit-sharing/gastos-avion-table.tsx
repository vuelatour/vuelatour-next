import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn } from "@/lib/format";
import {
  ETIQUETA_REPARTO_PARCIAL,
  ETIQUETA_SIN_TC_GASTO,
  ETIQUETA_TC_OFICIAL,
  TEXTO_SIN_GASTOS_AVION,
  TITULO_REPARTO_PARCIAL,
  TITULO_SIN_TC_GASTO,
  TITULO_TC_OFICIAL_GASTO,
  agruparGastosDetalle,
  cascadaDelGrupo,
  diferenciaConCascada,
  hrefVueloGasto,
  montoGastoDetalle,
  textoCuadreGrupo,
  textoDescontadoGasto,
  textoMontoOriginalGasto,
  textoTcGasto,
  textoUsdGasto,
  textoVueloGasto,
} from "@/lib/admin/reparto-avion";
import { combustibleSeparado, montoPrincipal } from "@/lib/admin/reparto-pesos";
import type { AvionReparto, FilaGastoDetalle } from "@/types/profit-sharing";
import { MontoDobleCelda } from "./cascada-avion";

const BADGE_INFO = "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30";
const BADGE_AMBAR = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";

/**
 * «Gastos del periodo» de la pantalla del avión (20-oct-2026, API 0.0.101):
 * `detalle.gastos[]` agrupado como en el balance (directos, indirectos,
 * permisos, fijos repartidos a mano, no restan), con fecha, categoría,
 * concepto, vuelo (enlace), monto original, T.C. (badge si fue el oficial),
 * pesos y dólares; subtotal por grupo comparado con la fila de la cascada.
 * Es la respuesta a «para saber cuáles son esos permisos, gastos indirectos
 * y directos de los que habla el Excel». Con el combustible separado (API
 * 0.0.103) el grupo «Combustible» va tras los directos y cuadra contra su
 * fila de la cascada. Sin hooks (servidor).
 */
export function GastosAvionTable({
  avion,
  filas,
  enPesos,
}: {
  avion: AvionReparto;
  filas: FilaGastoDetalle[] | null | undefined;
  enPesos: boolean;
}) {
  const grupos = agruparGastosDetalle(filas, { conCombustible: combustibleSeparado(avion) });
  if (grupos.length === 0) {
    return <p className="text-sm text-muted-foreground">{TEXTO_SIN_GASTOS_AVION}</p>;
  }
  return (
    <div className="space-y-5" data-gastos-avion>
      {grupos.map((g) => {
        const cascada = cascadaDelGrupo(avion, g.grupo);
        const cascadaMonto = cascada
          ? montoPrincipal({ mxn: cascada.mxn, usd: cascada.usd }, enPesos).principal
          : null;
        const dif = diferenciaConCascada(
          g.grupo,
          enPesos ? g.subtotalMxn : g.subtotalUsd,
          enPesos ? cascada?.mxn ?? null : cascada?.usd ?? null,
          g.filas.length,
        );
        const cuadre = textoCuadreGrupo(g.grupo, dif, cascadaMonto);
        const subtotal =
          g.grupo === "EXCLUIDO"
            ? null
            : montoPrincipal({ mxn: g.subtotalMxn, usd: g.subtotalUsd }, enPesos);
        return (
          <section key={g.grupo} data-grupo-gastos={g.grupo} className="space-y-1.5">
            <div>
              <h3 className="text-sm font-semibold">
                {g.etiqueta}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {g.filas.length} gasto(s)</span>
              </h3>
              <p className="text-xs text-muted-foreground">{g.descripcion}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Vuelo</TableHead>
                    <TableHead className="text-right">Monto original</TableHead>
                    <TableHead className="text-right">T.C.</TableHead>
                    <TableHead className="text-right">{enPesos ? "MXN" : "USD"}</TableHead>
                    {enPesos && <TableHead className="text-right">USD</TableHead>}
                    {g.grupo === "EXCLUIDO" && <TableHead>Por qué no resta</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.filas.map((f) => (
                    <FilaGasto key={f.id} fila={f} enPesos={enPesos} excluido={g.grupo === "EXCLUIDO"} />
                  ))}
                </TableBody>
                {subtotal && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs font-semibold">
                        Subtotal · {g.etiqueta}
                        {g.sinPesos > 0 && (
                          <span className="ml-1.5 font-normal text-amber-700 dark:text-amber-400">
                            · {g.sinPesos} sin T.C. (fuera del subtotal)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold" data-subtotal-grupo={g.grupo}>
                        {subtotal.principal}
                      </TableCell>
                      {enPesos && (
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {g.subtotalUsd === null ? "—" : textoUsdGasto({ usd: g.subtotalUsd })}
                        </TableCell>
                      )}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
            {cuadre && (
              <p
                className={`flex items-center gap-1 text-[11px] ${
                  dif === null ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"
                }`}
                data-cuadre-grupo={dif === null ? "ok" : "diferencia"}
              >
                {dif !== null && <ExclamationTriangleIcon className="h-3 w-3 shrink-0" aria-hidden />}
                {cuadre}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FilaGasto({
  fila: f,
  enPesos,
  excluido,
}: {
  fila: FilaGastoDetalle;
  enPesos: boolean;
  excluido: boolean;
}) {
  const href = hrefVueloGasto(f);
  const vuelo = textoVueloGasto(f);
  const descontado = textoDescontadoGasto(f);
  const monto = montoGastoDetalle(f, enPesos);
  return (
    <TableRow data-gasto-detalle={f.id}>
      <TableCell className="whitespace-nowrap text-xs">{f.fecha ? fmtDateOnly(f.fecha) : "—"}</TableCell>
      <TableCell className="text-xs">
        {f.etiqueta}
        {f.es_reparto_parcial && (
          <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px] text-muted-foreground" title={TITULO_REPARTO_PARCIAL}>
            {ETIQUETA_REPARTO_PARCIAL}
          </Badge>
        )}
      </TableCell>
      <TableCell className="min-w-[12rem] max-w-[22rem] whitespace-normal text-xs">
        {f.concepto?.trim() || <span className="text-muted-foreground">—</span>}
        {descontado && (
          <span className="mt-0.5 block text-[10px] text-muted-foreground">{descontado}</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {href && vuelo ? (
          <Link href={href} className="underline underline-offset-2 hover:text-foreground">
            {vuelo}
          </Link>
        ) : (
          (vuelo ?? <span className="text-muted-foreground">—</span>)
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-mono text-xs">{textoMontoOriginalGasto(f)}</TableCell>
      <TableCell className="whitespace-nowrap text-right font-mono text-xs">
        {textoTcGasto(f)}
        {f.tc_oficial && (
          <Badge variant="outline" className={`ml-1.5 h-4 px-1.5 text-[10px] ${BADGE_INFO}`} title={TITULO_TC_OFICIAL_GASTO}>
            {ETIQUETA_TC_OFICIAL}
          </Badge>
        )}
        {f.usd === null && f.mxn === null && (
          <Badge variant="outline" className={`ml-1.5 h-4 px-1.5 text-[10px] ${BADGE_AMBAR}`} title={TITULO_SIN_TC_GASTO}>
            {ETIQUETA_SIN_TC_GASTO}
          </Badge>
        )}
      </TableCell>
      <TableCell className={`whitespace-nowrap text-right font-mono text-xs ${excluido ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}`}>
        {enPesos ? (f.mxn === null ? "—" : fmtMxn(f.mxn)) : <MontoDobleCelda monto={monto} />}
      </TableCell>
      {enPesos && (
        <TableCell className="whitespace-nowrap text-right font-mono text-xs text-muted-foreground">
          {textoUsdGasto(f)}
        </TableCell>
      )}
      {excluido && (
        <TableCell className="min-w-[12rem] whitespace-normal text-xs text-muted-foreground">{f.clave}</TableCell>
      )}
    </TableRow>
  );
}
