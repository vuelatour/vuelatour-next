import { Card, CardContent } from "@/components/ui/card";
import { montoNomina, textoPagos, type PorMoneda } from "@/lib/admin/nomina";
import {
  ETIQUETA_POR_AVION,
  ETIQUETA_REMANENTE,
  ETIQUETA_REPARTIDO,
  ETIQUETA_SIN_REPARTIR,
  NOTA_SIN_REPARTIR,
  TEXTO_NADA_REPARTIDO,
  TITULO_RESUMEN_REPARTO_NOMINA,
  type ResumenRepartoNomina,
} from "@/lib/admin/nomina-reparto";

/**
 * «Reparto entre aviones» de la pantalla Nómina (16-oct-2026, API 0.0.90).
 * PRESENTACIONAL, sin hooks (se prueba con `renderToStaticMarkup`): pinta lo
 * que ya sumó `resumenRepartoNomina` (centavos, por moneda) con las partes
 * GUARDADAS de cada pago. «Repartido» vs «Sin repartir» y «Por avión»; cada
 * moneda en su renglón (MXN y USD jamás se suman). Solo lo repartido llega al
 * balance de cada avión: lo sin repartir se dice en ámbar.
 */
export function NominaRepartoResumen({ resumen }: { resumen: ResumenRepartoNomina }) {
  return (
    <section
      aria-label={TITULO_RESUMEN_REPARTO_NOMINA}
      className="space-y-2"
      data-resumen-reparto-nomina=""
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card data-tarjeta-reparto="repartido">
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">{ETIQUETA_REPARTIDO}</p>
            <Montos totales={resumen.repartido} vacio="$0" />
            <p className="text-xs text-muted-foreground">{textoPagos(resumen.pagosRepartidos)}</p>
          </CardContent>
        </Card>
        <Card data-tarjeta-reparto="sin-repartir">
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">{ETIQUETA_SIN_REPARTIR}</p>
            <Montos
              totales={resumen.sinRepartir}
              vacio="$0"
              clase={resumen.pagosSinRepartir > 0 ? "text-amber-700 dark:text-amber-300" : undefined}
            />
            <p className="text-xs text-muted-foreground">{textoPagos(resumen.pagosSinRepartir)}</p>
          </CardContent>
        </Card>
        <Card data-tarjeta-reparto="por-avion">
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">{ETIQUETA_POR_AVION}</p>
            {resumen.porAvion.length === 0 ? (
              <p className="text-sm text-muted-foreground">{TEXTO_NADA_REPARTIDO}</p>
            ) : (
              <ul className="space-y-1" role="list">
                {resumen.porAvion.map((a) => (
                  <li
                    key={a.matricula}
                    className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs"
                    data-avion={a.matricula}
                  >
                    <span className="font-mono">{a.matricula}</span>
                    <span className="ml-auto text-right font-mono font-medium tabular-nums">
                      {a.total.map((t) => montoNomina(t.total, t.moneda)).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {resumen.remanente.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {ETIQUETA_REMANENTE}: {resumen.remanente.map((t) => montoNomina(t.total, t.moneda)).join(" · ")}
        </p>
      )}
      {resumen.pagosSinRepartir > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{NOTA_SIN_REPARTIR}</p>
      )}
    </section>
  );
}

function Montos({ totales, vacio, clase }: { totales: PorMoneda[]; vacio: string; clase?: string }) {
  if (totales.length === 0) {
    return <p className="font-mono text-lg font-semibold tabular-nums text-muted-foreground">{vacio}</p>;
  }
  return (
    <div className="space-y-0.5">
      {totales.map((t) => (
        <p key={t.moneda} className={`font-mono text-lg font-semibold tabular-nums ${clase ?? ""}`}>
          {montoNomina(t.total, t.moneda)}
        </p>
      ))}
    </div>
  );
}
