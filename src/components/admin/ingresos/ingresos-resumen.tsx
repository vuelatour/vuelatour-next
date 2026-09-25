import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  PIE_RESUMEN_INGRESOS,
  lineaConciliacionResumen,
  monedaConMovimiento,
  textoPeriodo,
} from "@/lib/admin/ingresos-ui";
import { fmtMonto } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ResumenIngresos, ResumenIngresosMoneda } from "@/types/ingresos";

/**
 * Resumen del periodo POR MONEDA (24-sep-2026). Todas las cifras vienen del
 * API (`GET /v1/ingresos/resumen`): aquí no se suma ni se convierte nada. El
 * total se rotula «Dinero que entró» —NO es utilidad: incluye anticipos y
 * préstamos— y los cobros que salieron de un anticipo no se suman otra vez.
 */
export function IngresosResumen({
  resumen,
  puedeConciliar,
  hrefPorConciliar,
  hrefAnticipos,
}: {
  resumen: ResumenIngresos;
  /** ADMIN/FACTURACION: la tarjeta de abonos lleva a una pestaña que solo ellos abren. */
  puedeConciliar: boolean;
  hrefPorConciliar: string;
  hrefAnticipos: string;
}) {
  const monedas = resumen.por_moneda.filter(monedaConMovimiento);
  const varias = monedas.length > 1;
  const conSaldo = resumen.anticipos_con_saldo.filter((a) => a.saldo > 0.005);

  return (
    <section className="space-y-3" aria-label="Resumen del periodo">
      <p className="text-xs text-muted-foreground">
        Periodo: {textoPeriodo(resumen.desde, resumen.hasta)}
      </p>
      {monedas.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No entró dinero en el periodo (ni cobros de vuelos ni ingresos registrados).
          </CardContent>
        </Card>
      ) : (
        monedas.map((m) => (
          <div key={m.moneda} className="space-y-2">
            {varias && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {m.moneda === "MXN" ? "Pesos (MXN)" : "Dólares (USD)"}
              </p>
            )}
            <FilaMoneda m={m} puedeConciliar={puedeConciliar} hrefPorConciliar={hrefPorConciliar} />
          </div>
        ))
      )}
      {conSaldo.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Anticipos con saldo por aplicar (todas las fechas):{" "}
          {conSaldo
            .map((a) => `${fmtMonto(a.saldo, a.moneda)} (${a.n} ${a.n === 1 ? "anticipo" : "anticipos"})`)
            .join(" · ")}{" "}
          ·{" "}
          <Link href={hrefAnticipos} className="cursor-pointer text-brand-600 underline-offset-2 hover:underline">
            Ver anticipos
          </Link>
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{PIE_RESUMEN_INGRESOS}</p>
    </section>
  );
}

function Tarjeta({
  titulo,
  monto,
  moneda,
  children,
  destacada,
  className,
}: {
  titulo: string;
  monto: number;
  moneda: string;
  children?: React.ReactNode;
  destacada?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn(destacada && "border-emerald-500/40 bg-emerald-500/5", className)}>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={cn("font-mono text-lg font-semibold tabular-nums", destacada && "text-emerald-700 dark:text-emerald-300")}>
          {fmtMonto(monto, moneda)}
        </p>
        {children && <div className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">{children}</div>}
      </CardContent>
    </Card>
  );
}

function FilaMoneda({
  m,
  puedeConciliar,
  hrefPorConciliar,
}: {
  m: ResumenIngresosMoneda;
  puedeConciliar: boolean;
  hrefPorConciliar: string;
}) {
  const mon = m.moneda;
  const lineaCobros = lineaConciliacionResumen(m.cobros_vuelo, mon);
  const lineaOtros = lineaConciliacionResumen(m.otros_ingresos, mon);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Tarjeta titulo="Dinero que entró" monto={m.total_recibido} moneda={mon} destacada>
        <p>No es utilidad: incluye anticipos y préstamos.</p>
        {m.cobros_vuelo.reembolsos > 0 && (
          <p>Neto de reembolsos: {fmtMonto(m.neto_de_reembolsos, mon)}</p>
        )}
      </Tarjeta>
      <Tarjeta titulo={`Cobros de vuelos (${m.cobros_vuelo.n})`} monto={m.cobros_vuelo.recibido} moneda={mon}>
        {lineaCobros && <p>{lineaCobros}</p>}
        {m.cobros_vuelo.reembolsos > 0 && (
          <p className="text-red-600 dark:text-red-400">
            Reembolsos a clientes: −{fmtMonto(m.cobros_vuelo.reembolsos, mon)}
          </p>
        )}
        {m.depositos_por_volar.monto > 0 && (
          <p>
            De ellos, depósitos de vuelos que aún no vuelan: {fmtMonto(m.depositos_por_volar.monto, mon)}
          </p>
        )}
        {m.aplicado_de_anticipos.monto > 0 && (
          <p>
            Además, {fmtMonto(m.aplicado_de_anticipos.monto, mon)} aplicados de anticipos (no se suman otra
            vez).
          </p>
        )}
      </Tarjeta>
      <Tarjeta titulo={`Otros ingresos (${m.otros_ingresos.n})`} monto={m.otros_ingresos.monto} moneda={mon}>
        <p className="text-green-600 dark:text-green-400">Suma a resultados</p>
        {lineaOtros && <p>{lineaOtros}</p>}
      </Tarjeta>
      <Tarjeta titulo={`Anticipos (${m.anticipos.n})`} monto={m.anticipos.recibido} moneda={mon}>
        <p>
          Aplicado {fmtMonto(m.anticipos.aplicado, mon)} ·{" "}
          <span className={cn(m.anticipos.saldo > 0.005 && "font-medium text-amber-700 dark:text-amber-300")}>
            saldo por aplicar {fmtMonto(m.anticipos.saldo, mon)}
          </span>
        </p>
        <p>Fuera de resultados hasta aplicarse a un vuelo.</p>
      </Tarjeta>
      <Tarjeta
        titulo={`Aportaciones y préstamos (${m.fuera_de_resultados.n})`}
        monto={m.fuera_de_resultados.monto}
        moneda={mon}
      >
        <p>No es resultado: es capital o deuda.</p>
      </Tarjeta>
      {puedeConciliar && (
        <Link href={hrefPorConciliar} className="block cursor-pointer rounded-xl transition-opacity hover:opacity-90">
          <Tarjeta
            titulo="Abonos del banco por identificar"
            monto={m.abonos_por_identificar.monto}
            moneda={mon}
            className={cn("h-full", m.abonos_por_identificar.n > 0 && "border-amber-500/50")}
          >
            <p className={cn(m.abonos_por_identificar.n > 0 && "text-amber-700 dark:text-amber-300")}>
              {m.abonos_por_identificar.n === 0
                ? "Todos identificados"
                : `${m.abonos_por_identificar.n} ${m.abonos_por_identificar.n === 1 ? "abono" : "abonos"} → Por conciliar`}
            </p>
          </Tarjeta>
        </Link>
      )}
    </div>
  );
}
