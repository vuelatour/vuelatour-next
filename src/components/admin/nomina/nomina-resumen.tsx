import { Card, CardContent } from "@/components/ui/card";
import {
  ETIQUETA_POR_MEDIO_NOMINA,
  ETIQUETA_RESUMEN_NOMINA,
  NOTA_QUINCENA,
  SIN_PAGOS_QUINCENA,
  etiquetaMedioNomina,
  etiquetaQuincena,
  montoNomina,
  textoPagos,
  textoSinQuincena,
  tituloTotalMesNomina,
  type PorMoneda,
  type ResumenNomina,
} from "@/lib/admin/nomina";

/**
 * Resumen del mes de la pantalla «Nómina» (15-oct-2026). PRESENTACIONAL, sin
 * hooks (se prueba con `renderToStaticMarkup`): pinta lo que ya sumó
 * `resumenNomina` (centavos, por moneda) y no suma nada. Tres tarjetas —1
 * columna en teléfono, 3 desde `sm`—: el total del mes con su desglose por
 * medio de pago y las dos quincenas («Sin pagos» cuando no hubo). Cada moneda
 * va en su renglón: MXN y USD jamás se suman. La página lo monta SOLO con la
 * lista cargada (con la lista caída no hay resumen: ni ceros).
 */
export function NominaResumen({
  mes,
  resumen,
  aviso,
}: {
  /** «YYYY-MM» ya validado (`mesNominaDeUrl`). */
  mes: string;
  resumen: ResumenNomina;
  /** Aviso ámbar bajo las tarjetas (p. ej. el resumen de una lista con corte). */
  aviso?: string | null;
}) {
  return (
    <section aria-label={ETIQUETA_RESUMEN_NOMINA} className="space-y-2" data-resumen-nomina="">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card data-tarjeta-nomina="mes">
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">{tituloTotalMesNomina(mes)}</p>
            <Montos totales={resumen.total} />
            <p className="text-xs text-muted-foreground">{textoPagos(resumen.pagos)}</p>
            {resumen.porMedio.length > 0 && (
              <ul aria-label={ETIQUETA_POR_MEDIO_NOMINA} className="space-y-1 border-t border-border pt-2">
                {resumen.porMedio.map((m) => (
                  <li
                    key={`${m.moneda}|${m.medio}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs"
                  >
                    <span className="text-muted-foreground">{etiquetaMedioNomina(m.medio)}</span>
                    {/* `ml-auto`: si el renglón envuelve (tarjeta angosta: 640–~715 px,
                        o 7 cifras), el monto sigue a la DERECHA y la columna de
                        montos no queda dentada. */}
                    <span className="ml-auto text-right font-mono font-medium tabular-nums">
                      {montoNomina(m.total, m.moneda)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {resumen.quincenas.map((q) => (
          <Card key={q.quincena} data-tarjeta-nomina={`q${q.quincena}`}>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{etiquetaQuincena(mes, q.quincena)}</p>
              {q.pagos === 0 ? (
                <p className="text-sm text-muted-foreground">{SIN_PAGOS_QUINCENA}</p>
              ) : (
                <>
                  <Montos totales={q.total} />
                  <p className="text-xs text-muted-foreground">{textoPagos(q.pagos)}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{NOTA_QUINCENA}</p>
      {resumen.sinQuincena > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{textoSinQuincena(resumen.sinQuincena)}</p>
      )}
      {aviso && <p className="text-xs text-amber-600 dark:text-amber-400">{aviso}</p>}
    </section>
  );
}

/** Un renglón por moneda (MXN, USD, el resto): jamás una suma entre monedas. */
function Montos({ totales }: { totales: PorMoneda[] }) {
  return (
    <div className="space-y-0.5">
      {totales.map((t) => (
        <p key={t.moneda} className="font-mono text-lg font-semibold tabular-nums xl:text-xl">
          {montoNomina(t.total, t.moneda)}
        </p>
      ))}
    </div>
  );
}
