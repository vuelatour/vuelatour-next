import Link from "next/link";
import {
  BanknotesIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";
import {
  ETIQUETA_VER_ENTREGAS_PREVIAS,
  TEXTO_CUENTAS_NO_DISPONIBLES,
  claseTextoSaldo,
  kpiSaldoCuenta,
  textoCuentaNoConfigurada,
  textoMesEnCurso,
} from "@/lib/admin/reparto-pagos";
import type { TotalesCuentasSocios, TotalesEstadoCuenta } from "@/types/reparto-pagos";
import { EstadoCuentaBadge } from "./estado-cuenta-badge";

/**
 * Piezas de las dos páginas de la cuenta corriente de los socios
 * (`/admin/profit-sharing/socios` y `/socios/[id]`), separadas de las
 * páginas para que las pruebas las rendericen de verdad: KPIs, banner de
 * cuenta sin configurar según el rol, «sin permiso», «disponible cuando…» y
 * el enlace a las entregas anteriores al arranque. Solo pintan números del
 * API; las etiquetas salen de `lib/admin/reparto-pagos.ts`.
 */

export function KpiCuenta({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
        <div className="mt-1">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * KPIs del estado de cuenta de UN socio: Generado · Entregado · Por entregar
 * hoy (o «Adelantado (a favor de VuelaTour)» sin signo) · Estatus. La parte
 * del mes EN CURSO se dice bajo «Generado» y bajo el saldo: esa utilidad
 * todavía cambia.
 */
export function KpisCuenta({
  totales,
  mesEnCurso,
}: {
  totales: TotalesEstadoCuenta;
  /** `YYYY-MM` del mes en curso (para «incluye $X de Octubre 2026»). */
  mesEnCurso: string | null;
}) {
  const enCurso = textoMesEnCurso(totales.mes_en_curso_usd ?? 0, mesEnCurso);
  const saldo = kpiSaldoCuenta(totales.estado, totales.por_entregar_usd);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-totales-estado-cuenta>
      <KpiCuenta etiqueta="Generado">
        <p className="font-mono text-xl font-semibold">{fmtUsd(totales.generado_usd)}</p>
        {enCurso && <p className="mt-0.5 text-[11px] text-muted-foreground">{enCurso}</p>}
      </KpiCuenta>
      <KpiCuenta etiqueta="Entregado">
        <p className="font-mono text-xl font-semibold">{fmtUsd(totales.entregado_usd)}</p>
      </KpiCuenta>
      <KpiCuenta etiqueta={saldo.etiqueta}>
        <p
          className={cn(
            "font-mono text-xl font-semibold",
            claseTextoSaldo(totales.estado, totales.por_entregar_usd),
          )}
          data-kpi-saldo={saldo.adelantado ? "adelantado" : "por-entregar"}
        >
          {fmtUsd(saldo.monto)}
        </p>
        {enCurso && <p className="mt-0.5 text-[11px] text-muted-foreground">{enCurso}</p>}
      </KpiCuenta>
      <KpiCuenta etiqueta="Estatus">
        <EstadoCuentaBadge
          estado={totales.estado}
          saldoUsd={totales.por_entregar_usd}
          className="text-sm"
        />
      </KpiCuenta>
    </div>
  );
}

/** KPIs de la lista «Pagos a socios» (solo oficina: un SOCIO no recibe totales). */
export function KpisCuentasSocios({ totales }: { totales: TotalesCuentasSocios }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-totales-cuentas>
      <KpiCuenta etiqueta="Por entregar (todos)">
        <p className="font-mono text-xl font-semibold">{fmtUsd(totales.por_entregar_usd)}</p>
      </KpiCuenta>
      <KpiCuenta etiqueta="Adelantado (todos)">
        <p className="font-mono text-xl font-semibold">{fmtUsd(totales.adelantado_usd ?? 0)}</p>
      </KpiCuenta>
      <KpiCuenta etiqueta="Socios con saldo por entregar">
        <p className="text-xl font-semibold">{totales.socios_por_entregar}</p>
      </KpiCuenta>
      <KpiCuenta etiqueta="Socios adelantados">
        <p className="text-xl font-semibold">{totales.socios_adelantados}</p>
      </KpiCuenta>
    </div>
  );
}

/**
 * Cuenta sin configurar (default del API). A quien puede configurarla
 * (ADMIN/FACTURACION), el aviso ámbar con la instrucción; a quien solo
 * consulta (ANALISTA/SOCIO), un texto informativo neutro — nunca una orden
 * que no puede cumplir.
 */
export function BannerCuentaNoConfigurada({
  puedeConfigurar,
  esPropia = false,
}: {
  puedeConfigurar: boolean;
  esPropia?: boolean;
}) {
  const texto = textoCuentaNoConfigurada({ puedeConfigurar, esPropia });
  if (!puedeConfigurar) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
        data-banner-sin-configurar="lectura"
      >
        <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{texto}</p>
      </div>
    );
  }
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
      data-banner-sin-configurar="oficina"
    >
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{texto}</p>
    </div>
  );
}

/** «Disponible cuando se actualice el servidor» (API previo o sin migración). */
export function TarjetaCuentasNoDisponibles({ titulo }: { titulo: string }) {
  return (
    <Card data-cuentas-no-disponibles>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
          {titulo}
        </CardTitle>
        <CardDescription>{TEXTO_CUENTAS_NO_DISPONIBLES}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** 401/403 del estado de cuenta (un SOCIO que abre la cuenta de otro). */
export function SinPermisoCuenta({ esSocio }: { esSocio: boolean }) {
  return (
    <EmptyState
      icon={LockClosedIcon}
      title={esSocio ? "Solo puedes ver tu propia cuenta" : "Sin permiso"}
      description={
        esSocio ? "Esta cuenta es de otro socio." : "Tu usuario no tiene acceso a las cuentas de los socios."
      }
    />
  );
}

/**
 * Entregas fechadas ANTES del arranque que el estado de cuenta junta en el
 * «Saldo al cierre»: el aviso y el enlace que las abre como movimientos
 * (con Editar, Eliminar y comprobante).
 */
export function AvisoEntregasPrevias({ texto, href }: { texto: string; href: string }) {
  return (
    <div
      className="flex flex-wrap items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
      data-aviso-entregas-previas
    >
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{texto}</p>
      <Link
        href={href}
        className="cursor-pointer whitespace-nowrap font-medium underline underline-offset-2 hover:no-underline"
        data-accion="ver-entregas-previas"
      >
        {ETIQUETA_VER_ENTREGAS_PREVIAS}
      </Link>
    </div>
  );
}
