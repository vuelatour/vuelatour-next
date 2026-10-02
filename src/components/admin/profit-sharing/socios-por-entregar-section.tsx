import Link from "next/link";
import { ArrowRightIcon, BanknotesIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";
import {
  AYUDA_SECCION_POR_ENTREGAR,
  ETIQUETA_COLUMNA_SALDO_ACUMULADO,
  ETIQUETA_VER_CUENTA,
  RUTA_PAGOS_SOCIOS,
  TEXTO_CUENTAS_NO_DISPONIBLES,
  TEXTO_ERROR_CARGA_CUENTAS,
  claseTextoSaldo,
  contextoEntrega,
  etiquetaGeneroPeriodo,
  filasSociosPorEntregar,
  generadoPorSocioEnPeriodo,
  hrefCuentaSocio,
  marcaSaldoAdelantado,
  mesDePeriodo,
  type CargaCuentas,
  type ContextoRegistro,
} from "@/lib/admin/reparto-pagos";
import type { AvionReparto } from "@/types/profit-sharing";
import type { SociosCuentaRespuesta } from "@/types/reparto-pagos";
import { EstadoCuentaBadge } from "./estado-cuenta-badge";
import { BotonRegistrarEntrega } from "./entrega-socio-dialog";

export const TITULO_SECCION_POR_ENTREGAR = "Socios · por entregar";

/**
 * «Socios · por entregar» en el Reparto de utilidades (cuenta corriente,
 * 1-oct-2026): por socio, lo que GENERÓ en el periodo mostrado (la suma de
 * sus renglones en las tarjetas de abajo) y su saldo ACUMULADO por entregar
 * (del API, `GET /v1/profit-sharing/socios`), con «Registrar entrega» y «Ver
 * cuenta». Se pinta con cualquier periodo (ya no exige un mes completo).
 */
export function SociosPorEntregarSection({
  carga,
  aviones,
  desde,
  hasta,
  puedeRegistrar,
  registro,
}: {
  /** null = no se pidió (rol sin lectura). */
  carga: CargaCuentas<SociosCuentaRespuesta> | null;
  aviones: Pick<AvionReparto, "reparto">[];
  desde: string;
  hasta: string;
  puedeRegistrar: boolean;
  registro: ContextoRegistro;
}) {
  if (!carga || carga.estado === "sin-permiso") return null;

  if (carga.estado === "no-disponible") {
    return (
      <Card data-seccion-por-entregar="no-disponible">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
            {TITULO_SECCION_POR_ENTREGAR}
          </CardTitle>
          <CardDescription>{TEXTO_CUENTAS_NO_DISPONIBLES}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (carga.estado !== "ok") {
    return (
      <TarjetaErrorCarga
        titulo={`${TITULO_SECCION_POR_ENTREGAR}: no se pudieron cargar`}
        descripcion={TEXTO_ERROR_CARGA_CUENTAS}
      />
    );
  }

  const filas = filasSociosPorEntregar(carga.datos.socios, generadoPorSocioEnPeriodo(aviones));
  const columnaGenero = etiquetaGeneroPeriodo(desde, hasta);
  // Con un MES completo a la vista (p. ej. «Mes pasado»), el diálogo
  // prellena «Corresponde al mes» con ese mes: es el que se está pagando.
  const mesSugerido = mesDePeriodo(desde, hasta);
  const mesEnCurso = carga.datos.hasta_mes || null;

  return (
    <Card data-seccion-por-entregar="ok">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
              {TITULO_SECCION_POR_ENTREGAR}
            </CardTitle>
            <CardDescription className="mt-1">{AYUDA_SECCION_POR_ENTREGAR}</CardDescription>
          </div>
          <Link
            href={RUTA_PAGOS_SOCIOS}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5")}
            data-accion="ver-pagos-socios"
          >
            Pagos a socios
            <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin socios en los aviones. Configúralos en la ficha de cada avión.
          </p>
        ) : (
          <Table data-tabla-por-entregar>
            <TableHeader>
              <TableRow>
                <TableHead>Socio</TableHead>
                <TableHead className="text-right">{columnaGenero}</TableHead>
                <TableHead className="text-right">{ETIQUETA_COLUMNA_SALDO_ACUMULADO}</TableHead>
                <TableHead>Estatus</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map(({ resumen: r, genero_periodo_usd }) => {
                const adelantado = marcaSaldoAdelantado(r.estado, r.por_entregar_usd);
                return (
                  <TableRow key={r.socio.id} data-socio-por-entregar={r.socio.id}>
                    <TableCell className="min-w-[10rem] whitespace-normal text-sm font-medium">
                      {r.socio.nombre}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtUsd(genero_periodo_usd)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-sm font-semibold",
                        claseTextoSaldo(r.estado, r.por_entregar_usd),
                      )}
                    >
                      {fmtUsd(r.por_entregar_usd)}
                      {adelantado && (
                        <span className="mt-0.5 block font-sans text-[10px] font-normal" data-marca-adelantado>
                          {adelantado}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <EstadoCuentaBadge estado={r.estado} saldoUsd={r.por_entregar_usd} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        {puedeRegistrar && (
                          <BotonRegistrarEntrega
                            contexto={contextoEntrega(r, { mesEnCurso, mesSugerido })}
                            registro={registro}
                          />
                        )}
                        <Link
                          href={hrefCuentaSocio(r.socio.id)}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer gap-1")}
                          data-accion="ver-cuenta-socio"
                          aria-label={`${ETIQUETA_VER_CUENTA} de ${r.socio.nombre}`}
                        >
                          {ETIQUETA_VER_CUENTA}
                          <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
