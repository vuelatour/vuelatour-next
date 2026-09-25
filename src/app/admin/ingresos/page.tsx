import Link from "next/link";
import {
  ArrowTrendingUpIcon,
  ExclamationTriangleIcon,
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
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { ImportButton } from "@/components/admin/conciliacion/import-button";
import { IngresosResumen } from "@/components/admin/ingresos/ingresos-resumen";
import {
  DescargarExcelIngresos,
  IngresosFiltros,
} from "@/components/admin/ingresos/ingresos-filtros";
import { EntradasTable } from "@/components/admin/ingresos/entradas-table";
import { IngresosTable } from "@/components/admin/ingresos/ingresos-table";
import { AnticiposTable } from "@/components/admin/ingresos/anticipos-table";
import { DepositosPorVolarTable } from "@/components/admin/ingresos/depositos-por-volar-table";
import { AbonosPendientesTable } from "@/components/admin/ingresos/abonos-pendientes-table";
import { IngresoDetalleSheet } from "@/components/admin/ingresos/ingreso-detalle-sheet";
import {
  RegistrarIngresoBoton,
  type CatalogosIngreso,
} from "@/components/admin/ingresos/registrar-ingreso-dialog";
import { getMe } from "@/lib/api/me";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { listClients } from "@/lib/api/clients-server";
import { listAircraft } from "@/lib/api/aircraft";
import {
  getIngreso,
  getResumenIngresos,
  listAbonosPendientes,
  listEntradasAll,
  listIngresosAll,
} from "@/lib/api/ingresos-server";
import { Degradaciones, esErrorDeNext } from "@/lib/api/degradar";
import { isApiError } from "@/lib/api/errors";
import {
  ETIQUETA_TAB_INGRESOS,
  esIngresosNoDisponible,
  etiquetaCuentaIngreso,
  hrefIngresos,
  mensajeErrorIngreso,
  puedeConciliarIngresos,
  puedeVerIngresos,
  queryAbonosPendientes,
  queryDepositosPorVolar,
  queryEntradas,
  queryIngresos,
  tabsIngresos,
  filtrosIngresosDeUrl,
  type CuentaIngresoOpcion,
} from "@/lib/admin/ingresos-ui";
import { todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { IngresoDetalle } from "@/types/ingresos";

export const dynamic = "force-dynamic";
// «Sugerir con IA» (hasta ~130 s) y «Subir estado de cuenta» (la lectura IA
// de un PDF tarda minutos) son server actions invocadas DESDE esta página: en
// Vercel heredan el límite del SEGMENTO. Sin esto se cortaban (misma razón
// que /admin/conciliacion). Congelado en `lib/admin/__tests__/ingresos-page.test.ts`.
export const maxDuration = 300;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Carga<T> =
  | { ok: true; datos: T }
  | { ok: false; noDisponible: boolean; mensaje: string | null };

/** Carga PRINCIPAL: distingue «falta la migración» (503 con su code) de «falló». */
async function cargar<T>(p: Promise<T>): Promise<Carga<T>> {
  try {
    return { ok: true, datos: await p };
  } catch (e) {
    if (esErrorDeNext(e)) throw e;
    // 503 INGRESOS_NO_DISPONIBLE (falta la migración) o 404 «Cannot GET» (API
    // previo, sin el módulo): las dos son «todavía no está», no «falló».
    const noDisponible =
      isApiError(e) &&
      (esIngresosNoDisponible(e) || (e.status === 404 && /^Cannot (GET|POST)\b/.test(e.message)));
    if (!noDisponible) console.error("[admin] ingresos: falló la carga", e);
    // Un periodo demasiado grande es una respuesta legítima que dice qué hacer.
    const mensaje =
      isApiError(e) && e.code === "PERIODO_MUY_GRANDE"
        ? mensajeErrorIngreso(e.code, e.message, e.status)
        : null;
    return { ok: false, noDisponible, mensaje };
  }
}

async function cargarDetalle(id: string): Promise<{ detalle: IngresoDetalle | null; noExiste: boolean }> {
  try {
    return { detalle: await getIngreso(id), noExiste: false };
  } catch (e) {
    if (esErrorDeNext(e)) throw e;
    return { detalle: null, noExiste: isApiError(e) && e.status === 404 };
  }
}

const nada = <T,>() => Promise.resolve<T | null>(null);

function Encabezado({ derecha }: { derecha?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Operación</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Ingresos</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Todo el dinero que entra: cobros de vuelos, anticipos y otros ingresos. Los cobros de vuelos
          se registran en cada vuelo; aquí se ven y se concilian.
        </p>
      </div>
      {derecha}
    </div>
  );
}

function ErrorDeLista({ carga, titulo }: { carga: { mensaje: string | null }; titulo: string }) {
  return carga.mensaje ? (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{carga.mensaje}</span>
    </div>
  ) : (
    <TarjetaErrorCarga titulo={titulo} />
  );
}

function AvisoCorte({ mostrados, total }: { mostrados: number; total: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
      <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
      <span>
        Mostrando {mostrados} de {total} registros — acota el periodo o usa los filtros.
      </span>
    </div>
  );
}

/**
 * INGRESOS (24-sep-2026). Pedido del cliente: «faltarían las categorías de
 * "ingresos" de igual manera de como están ya ahorita las de "gastos"» y del
 * usuario: «que tengamos un espacio para ingresos como en Gastos y podamos
 * conciliar … subiendo un estado de cuenta y con IA marcar los que sí empatan
 * con los cobros de los vuelos … y la sección de ingresos para registrar
 * otros ingresos».
 *
 * La lista de la PESTAÑA es la llamada principal (nunca se traga); el
 * resumen y los catálogos degradan con aviso. Todo el dinero lo dice el API
 * (contrato INGRESOS): aquí no se suma ni se convierte nada.
 */
export default async function IngresosPage({ searchParams }: PageProps) {
  const [me, sp] = await Promise.all([getMe(), searchParams]);

  if (!puedeVerIngresos(me.rol)) {
    return (
      <div className="space-y-6">
        <Encabezado />
        <EmptyState
          icon={LockClosedIcon}
          title="Solo oficina"
          description="Ingresos lo ven administración, coordinación y facturación."
        />
      </div>
    );
  }

  const hoy = todayCancun();
  const f = filtrosIngresosDeUrl(sp, me.rol, hoy);
  const conciliador = puedeConciliarIngresos(me.rol);
  const degradado = new Degradaciones();

  const [entradas, ingresos, depositos, abonos, resumen, cuentasRes, clientesRes, aeronavesRes, detalle] =
    await Promise.all([
      f.tab === "todos" || f.tab === "cobros"
        ? cargar(listEntradasAll(queryEntradas(f, f.tab)))
        : nada<never>(),
      f.tab === "otros" || f.tab === "anticipos"
        ? cargar(listIngresosAll(queryIngresos(f, f.tab)))
        : nada<never>(),
      f.tab === "anticipos" ? cargar(listEntradasAll(queryDepositosPorVolar(f))) : nada<never>(),
      f.tab === "por-conciliar" ? cargar(listAbonosPendientes(queryAbonosPendientes(f))) : nada<never>(),
      cargar(getResumenIngresos({ desde: f.desde, hasta: f.hasta })),
      degradado.opcional("las cuentas bancarias", listBankAccounts({ limit: 100 }), {
        data: [] as Awaited<ReturnType<typeof listBankAccounts>>["data"],
      }),
      degradado.opcional("los clientes", listClients({ limit: 200, activo: true }), {
        data: [] as Awaited<ReturnType<typeof listClients>>["data"],
      }),
      degradado.opcional("las aeronaves", listAircraft({ limit: 100 }), {
        data: [] as Awaited<ReturnType<typeof listAircraft>>["data"],
      }),
      f.ingreso ? cargarDetalle(f.ingreso) : nada<never>(),
    ]);

  // Sin la migración (503 INGRESOS_NO_DISPONIBLE): tarjeta ámbar, nunca la pantalla rota.
  const cargas = [entradas, ingresos, depositos, abonos, resumen].filter(
    (c): c is { ok: false; noDisponible: boolean; mensaje: string | null } => !!c && !c.ok,
  );
  if (cargas.some((c) => c.noDisponible)) {
    return (
      <div className="space-y-6">
        <Encabezado />
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Los ingresos todavía no están habilitados en la base de datos.</p>
            <p>
              Falta aplicar una actualización del servidor. Vuelve a intentarlo en unos minutos; si
              sigue igual, avisa a sistemas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cuentas: CuentaIngresoOpcion[] = cuentasRes.data.map((c) => ({
    id: c.id,
    alias: c.alias,
    banco: c.banco,
    moneda: c.moneda,
    tipo: c.tipo === "PASARELA" ? "PASARELA" : "BANCO",
    activa: c.activa,
  }));
  const catalogos: CatalogosIngreso = {
    cuentas,
    clientes: clientesRes.data.map((c) => ({ id: c.id, nombre: c.nombre })),
    aeronaves: aeronavesRes.data.map((a) => ({ id: a.id, matricula: a.matricula })),
  };
  const cuentasSelect = cuentas
    .filter((c) => c.activa)
    .map((c) => ({ id: c.id, label: etiquetaCuentaIngreso(c) }));
  const cuentasImport = cuentasRes.data.map((c) => ({
    id: c.id,
    label: `${c.alias} · ${c.banco} (${c.moneda})${c.tipo === "PASARELA" ? " · pasarela" : ""}`,
    tipo: c.tipo ?? null,
  }));

  const porIdentificar =
    resumen.ok ? resumen.datos.por_moneda.reduce((s, m) => s + (m.abonos_por_identificar?.n ?? 0), 0) : null;

  return (
    <div className="space-y-6">
      <Encabezado
        derecha={
          <div className="flex flex-wrap items-center gap-2">
            {conciliador && <ImportButton cuentas={cuentasImport} label="Subir estado de cuenta" variant="outline" />}
            <DescargarExcelIngresos filtros={f} />
            <RegistrarIngresoBoton {...catalogos} />
          </div>
        }
      />

      <AvisoDegradado
        faltantes={degradado.faltantes}
        extra={[
          // Sin resumen se DICE por qué (también el 400 PERIODO_MUY_GRANDE,
          // que antes escondía las tarjetas sin ningún aviso).
          !resumen.ok
            ? resumen.mensaje
              ? `Resumen del periodo: ${resumen.mensaje}`
              : "No se pudo cargar el resumen del periodo; recarga para reintentar."
            : null,
        ]}
      />

      {resumen.ok && (
        <IngresosResumen
          resumen={resumen.datos}
          puedeConciliar={conciliador}
          hrefPorConciliar={hrefIngresos(f, { tab: "por-conciliar" })}
          hrefAnticipos={hrefIngresos(f, { tab: "anticipos", saldo: null })}
        />
      )}

      {/* Pestañas: chips que CONSERVAN los filtros de la vista. */}
      <nav className="flex flex-wrap gap-2" aria-label="Vistas de ingresos">
        {tabsIngresos(me.rol).map((t) => (
          <Link
            key={t}
            href={hrefIngresos(f, { tab: t })}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              f.tab === t ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {ETIQUETA_TAB_INGRESOS[t]}
            {t === "por-conciliar" && porIdentificar != null && porIdentificar > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  f.tab === t ? "bg-white/20" : "bg-amber-500/20 text-amber-600",
                )}
                title="Abonos del banco sin identificar en el periodo"
              >
                {porIdentificar}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <IngresosFiltros key={`${f.tab}:${f.q ?? ""}`} filtros={f} cuentas={cuentasSelect} hoy={hoy} />

      {(f.tab === "todos" || f.tab === "cobros") &&
        entradas &&
        (entradas.ok ? (
          <>
            {entradas.datos.huboCorte && (
              <AvisoCorte mostrados={entradas.datos.data.length} total={entradas.datos.total} />
            )}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {f.tab === "cobros" ? "Cobros de vuelos" : "Todo el dinero que entró"}
                </CardTitle>
                <CardDescription>
                  {f.tab === "cobros"
                    ? "Se registran en cada vuelo (solo lectura aquí). Los que salieron de un anticipo se ven en gris: no se suman otra vez."
                    : "Cobros de vuelos e ingresos registrados, por fecha de pago. Los reembolsos a clientes van en rojo."}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {entradas.datos.data.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">
                    Nada con estos filtros en el periodo.
                  </p>
                ) : (
                  <EntradasTable
                    entradas={entradas.datos.data}
                    filtros={f}
                    huboCorte={entradas.datos.huboCorte}
                  />
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <ErrorDeLista carga={entradas} titulo="No se pudo cargar el dinero del periodo" />
        ))}

      {f.tab === "otros" &&
        ingresos &&
        (ingresos.ok ? (
          <>
            {ingresos.datos.huboCorte && (
              <AvisoCorte mostrados={ingresos.datos.data.length} total={ingresos.datos.total} />
            )}
            {ingresos.datos.data.length === 0 ? (
              <EmptyState
                icon={ArrowTrendingUpIcon}
                title="Sin otros ingresos en el periodo"
                description="Registra aquí el dinero que entra y NO es el cobro de un vuelo: intereses del banco, reembolsos que te regresan, venta de refacciones a terceros, aportaciones…"
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <IngresosTable
                    ingresos={ingresos.datos.data}
                    filtros={f}
                    catalogos={catalogos}
                    huboCorte={ingresos.datos.huboCorte}
                  />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <ErrorDeLista carga={ingresos} titulo="No se pudieron cargar los ingresos" />
        ))}

      {f.tab === "anticipos" && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Anticipos sin vuelo</CardTitle>
              <CardDescription>
                El cliente pagó y su vuelo todavía no existe. No suman a resultados hasta aplicarse a
                un vuelo (ahí cuentan como cobro del vuelo). Regístralos con «Registrar ingreso» →
                «Anticipos y depósitos de clientes».
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ingresos && ingresos.ok ? (
                <AnticiposTable
                  anticipos={ingresos.datos.data}
                  filtros={f}
                  catalogos={catalogos}
                  huboCorte={ingresos.datos.huboCorte}
                />
              ) : ingresos ? (
                <ErrorDeLista carga={ingresos} titulo="No se pudieron cargar los anticipos" />
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Depósitos de vuelos que aún no vuelan</CardTitle>
              <CardDescription>
                Pagos del periodo de reservas y vuelos confirmados que todavía no vuelan. Ya son
                cobros de su vuelo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {depositos && depositos.ok ? (
                <DepositosPorVolarTable depositos={depositos.datos.data} huboCorte={depositos.datos.huboCorte} />
              ) : depositos ? (
                <ErrorDeLista carga={depositos} titulo="No se pudieron cargar los depósitos" />
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      {f.tab === "por-conciliar" &&
        abonos &&
        (abonos.ok ? (
          <Card>
            <CardContent className="pt-6">
              <AbonosPendientesTable
                respuesta={abonos.datos}
                catalogos={catalogos}
                cuentasIa={cuentasSelect}
                cuentaId={f.cuenta}
                desde={f.desde}
                hasta={f.hasta}
              />
            </CardContent>
          </Card>
        ) : (
          <ErrorDeLista carga={abonos} titulo="No se pudieron cargar los abonos por identificar" />
        ))}

      {f.ingreso && (
        <IngresoDetalleSheet
          detalle={detalle?.detalle ?? null}
          noExiste={detalle?.noExiste ?? false}
          filtros={f}
          catalogos={catalogos}
          rol={me.rol ?? null}
        />
      )}
    </div>
  );
}
