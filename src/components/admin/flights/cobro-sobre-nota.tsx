import { Fragment } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  claseBadgeCobro,
  estadoBancoCobro,
  lineaBancoCobro,
  textoBadgeCobro,
  tituloBadgeCobro,
} from "@/lib/admin/cobro-banco";
import {
  abreDetalleEntrada,
  estadoFilaDeCobroVuelo,
  filaBancoDeCobroVuelo,
  nombreAccesibleEntrada,
} from "@/lib/admin/entrada-banco";
import { tituloConClic } from "@/lib/admin/ingresos-ui";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FlightCobro } from "@/types/flights";

/**
 * Nota de un cobro que es PARTE de un SOBRE de grupo: "Parte del sobre G-12
 * · $2,060.16 de $10,800.76" con link al grupo. Montos tal cual los manda
 * el API (la parte y el total del sobre); nada se calcula aquí. Sin hooks:
 * sirve en la card del vuelo y en la de la cotización. Devuelve null si el
 * cobro no es parte de un sobre.
 */
export function CobroSobreNota({
  cobro,
  className,
}: {
  cobro: FlightCobro;
  className?: string;
}) {
  const sobre = cobro.cobro_grupo;
  if (!sobre) return null;
  const folio = folioTexto(sobre.grupo_folio);
  return (
    <p className={cn("text-[11px]", className)}>
      <Link
        href={`/admin/quotes/grupo/${sobre.grupo_id}`}
        className="text-fuchsia-700 dark:text-fuchsia-300 underline underline-offset-2 hover:opacity-80"
        title="Abrir el grupo: el sobre se edita, re-parte o elimina desde Cobros del grupo"
      >
        Parte del sobre {folio}
      </Link>
      <span className="text-muted-foreground">
        {" "}
        · <span className="font-mono">{fmtUsd(cobro.monto)}</span> de{" "}
        <span className="font-mono">{fmtUsd(sobre.monto_total)}</span> {sobre.moneda}
      </span>
    </p>
  );
}

/** true si el cobro es parte de un sobre de grupo (se gestiona desde el grupo). */
export function esParteDeSobre(cobro: FlightCobro): boolean {
  return cobro.cobro_grupo != null || cobro.cobro_grupo_id != null;
}

/**
 * Badge del cobro contra el BANCO (UN COBRO, VARIOS ABONOS: 14-oct-2026, API
 * 0.0.78, invariante 77): «Conciliado» (verde; también vía su sobre o su
 * anticipo), «Conciliado parcial · faltan $1,700 MXN» (ámbar) o «Sin
 * conciliar» (rosa). El ESTADO lo manda el API (`conciliacion_estado`); con
 * un API previo, `conciliado === true` ⇒ «Conciliado» como siempre y nada
 * más. No bancario (efectivo, dólares, BillPocket, reembolso) ⇒ sin badge.
 * Texto, clases y tooltip: `lib/admin/cobro-banco.ts`; nunca se deduce aquí.
 *
 * 15-oct-2026 («conciliación al revés» de una entrada, API 0.0.78): con
 * `alAbrir` (ADMIN/FACTURACION o rol desconocido) el badge es un BOTÓN que
 * abre la hoja «Conciliación con el banco» de ESE cobro: mismas clases +
 * cursor de mano, `aria-haspopup="dialog"`, el `title` con lo que hace el clic
 * y un nombre accesible que empieza con el texto visible («Conciliado: ver la
 * conciliación con el banco del cobro de $977.45 del 15 sep 2026»). Sin
 * `alAbrir`, el marcado de siempre.
 */
export function CobroConciliadoBadge({
  cobro,
  alAbrir,
}: {
  cobro: FlightCobro;
  alAbrir?: (() => void) | null;
}) {
  const texto = textoBadgeCobro(cobro);
  if (!texto) return null;
  const estado = estadoBancoCobro(cobro);
  const clase = cn(
    `ml-2 ${claseBadgeCobro(estado)} font-sans font-medium`,
    // «Conciliado parcial · faltan $68,205.55 MXN» es largo: en un
    // celular envuelve en vez de encimarse con los botones del cobro.
    estado === "PARCIAL" && "h-auto max-w-full whitespace-normal text-left",
  );
  const titulo = tituloBadgeCobro(cobro) ?? undefined;
  const estadoHoja = estadoFilaDeCobroVuelo(cobro);
  if (alAbrir && abreDetalleEntrada(estadoHoja)) {
    return (
      <Badge
        variant="outline"
        className={cn(clase, "cursor-pointer hover:bg-muted/60")}
        title={titulo ? tituloConClic(titulo, estadoHoja) : undefined}
        render={
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={nombreAccesibleEntrada(texto, filaBancoDeCobroVuelo(cobro))}
            onClick={alAbrir}
          />
        }
      >
        {texto}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={clase} title={titulo}>
      {texto}
    </Badge>
  );
}

/**
 * Renglón «Banco» debajo del cobro (API 0.0.78), SOLO cuando dice algo que el
 * badge no dice: un PARCIAL (lo vinculado, sus abonos, lo que falta y
 * «Buscar el abono que falta»), un cobro completo con 2+ abonos, o un abono
 * que trae de más (liga vieja). Los enlaces a Conciliación (pestaña nueva)
 * solo para quien concilia (ADMIN/FACTURACION, `puedeConciliar`); los demás
 * leen el mismo texto sin ligas. Textos y URLs: `lineaBancoCobro`.
 */
export function CobroBancoDetalle({
  cobro,
  puedeConciliar = false,
  className,
}: {
  cobro: FlightCobro;
  puedeConciliar?: boolean;
  className?: string;
}) {
  const linea = lineaBancoCobro(cobro, { conEnlaces: puedeConciliar });
  if (!linea) return null;
  return (
    <p
      className={cn(
        "text-[11px]",
        linea.tono === "aviso" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
        className,
      )}
      data-cobro-banco={linea.tono}
    >
      {linea.piezas.map((p, i) =>
        p.tipo === "texto" ? (
          <Fragment key={i}>{p.texto}</Fragment>
        ) : (
          <Link
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            prefetch={false}
            title={p.titulo}
            className="cursor-pointer font-medium underline underline-offset-2 hover:opacity-80"
          >
            {p.texto}
          </Link>
        ),
      )}
    </p>
  );
}
