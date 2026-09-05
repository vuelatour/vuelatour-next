import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PaperAirplaneIcon,
  BanknotesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FlightActionsBar } from "@/components/admin/flights/flight-actions-bar";
import { getMe } from "@/lib/api/me";
import { FlightReportButtons } from "@/components/admin/flights/flight-report-buttons";
import { CANCUN_TZ, cotizacionEditablePorFecha, fmtDateTime, TZ_LABEL } from "@/lib/datetime";
import { CobrosCard } from "@/components/admin/flights/cobros-card";
import { EscalasCard } from "@/components/admin/flights/escalas-card";
import { FlightTramosCard } from "@/components/admin/flights/flight-tramos-card";
import { FlightBitacoraCard } from "@/components/admin/flights/flight-bitacora-card";
import { FlightGastosHistorialCard } from "@/components/admin/flights/flight-gastos-historial-card";
import {
  getFlightSnapshot,
  getFlightTacoPhotos,
  getCobroVoucherUrls,
  getFlightBitacora,
  getFlightGastosHistorial,
  getFlightPlanUrl,
  getVueloAnterior,
} from "@/lib/api/flights-server";
import { listGastos, signFuelPhotos } from "@/lib/api/expenses-server";
import { listProviders } from "@/lib/api/providers-server";
import { FlightGastosCard } from "@/components/admin/flights/flight-gastos-card";
import { getClient } from "@/lib/api/clients-server";
import { getQuote } from "@/lib/api/quotes-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { listAirports } from "@/lib/api/airports-server";
import { getTipoCambioOficial } from "@/lib/api/tipo-cambio-server";
import { ApiError } from "@/lib/api/errors";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import { puntosRuta } from "@/lib/admin/ruta-comercial";
import {
  diferenciaRedondeo,
  estadoCobroSemaforo,
  pendienteCobro,
} from "@/lib/admin/cobros";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { ParticipacionAvionesNota } from "@/components/admin/flights/participacion-aviones-nota";
import { apoyosDeVuelo, combinadoFolio, type FlightSnapshot } from "@/types/flights";
import { grupoDeVuelo } from "@/lib/admin/grupos-ui";
import { GrupoBadge } from "@/components/admin/grupos/grupo-badge";
import type { VueloConGrupo } from "@/types/grupos";

export const dynamic = "force-dynamic";


interface FlightDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function FlightDetailPage({ params }: FlightDetailPageProps) {
  const me = await getMe().catch(() => null);
  const { id } = await params;

  let snapshot;
  try {
    snapshot = await getFlightSnapshot(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Solo SOLICITUD queda fuera (aún no hay nada operativo que ver). Un
  // vuelo COTIZADO SÍ abre su detalle (petición del cliente, jul 2026):
  // escalas, asignación y datos operativos son visibles desde que existe
  // la cotización — con un banner que recuerda que el precio sigue abierto.
  if (snapshot.estado === "SOLICITUD") {
    return (
      <div className="space-y-6">
        <BackLink href="/admin/flights">Vuelos</BackLink>
        <Card>
          <CardHeader>
            <CardTitle>Cotización en proceso</CardTitle>
            <CardDescription>
              El vuelo #{snapshot.folio} aún está en estado{" "}
              <Badge variant="outline" className={ESTADO_STYLES[snapshot.estado]}>
                {ESTADO_LABELS[snapshot.estado]}
              </Badge>
              . Gestiónalo desde{" "}
              <Link
                href={`/admin/quotes/${snapshot.id}`}
                className="underline font-medium"
              >
                Cotizaciones
              </Link>{" "}
              hasta que sea confirmado.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [client, aircraftRes, pilotsRes, airportsRes, tacoPhotos, bitacora, gastosHistorial, planVuelo, quote, gastosRes, vueloAnteriorRes] =
    await Promise.all([
      getClient(snapshot.cliente_id).catch(() => null),
      listAircraft({ limit: 100, activa: true }),
      listUsers({ rol: "PILOTO", limit: 50 }),
      listAirports({ limit: 200, activo: true }),
      getFlightTacoPhotos(id).catch(() => []),
      getFlightBitacora(id),
      // Historial de gastos (gasto_bitacora): best-effort dentro del propio
      // helper — con API viejo simplemente no se pinta la card.
      getFlightGastosHistorial(id),
      // Foto del plan de vuelo: el bucket es privado, así que se firma en el
      // backend (guarda el path; con URLs viejas completas también resuelve).
      snapshot.foto_plan_vuelo_url
        ? getFlightPlanUrl(id).catch(() => ({ url: null }))
        : Promise.resolve({ url: null }),
      // Solo para pintar la ruta COMERCIAL cotizada (vive en el snapshot del
      // cálculo, no en las escalas, que son la operación). Best-effort.
      getQuote(id).catch(() => null),
      // Gastos del vuelo (operativos y generales) con su desglose.
      listGastos({ vuelo_id: id, limit: 200 }).catch(
        () => ({ data: [], count: 0, limit: 0, offset: 0 }),
      ),
      // Vuelo anterior del mismo avión (auditar la cadena de tacómetros).
      getVueloAnterior(id).catch(() => ({ anterior: null })),
    ]);
  // TC oficial de referencia del DÍA DE LA COTIZACIÓN (pedido 29-ago: no el
  // de hoy) para prellenar el TC al cobrar en MXN cuando la cotización no lo
  // fijó — la misma fecha que usan los Excel del balance (fecha_solicitud ??
  // fecha_vuelo, en día Cancún). Best-effort: null en cualquier fallo.
  const diaCotizacion = (() => {
    const iso = quote?.fecha_solicitud ?? snapshot.fecha_vuelo;
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? null
      : new Intl.DateTimeFormat("en-CA", { timeZone: CANCUN_TZ }).format(d);
  })();
  const tcOficial = diaCotizacion ? await getTipoCambioOficial(diaCotizacion) : null;
  const vueloAnterior = vueloAnteriorRes.anterior;
  const gastos = gastosRes.data;
  // Resumen para el aviso al cancelar el vuelo (los gastos se conservan).
  const gastosPorMoneda = new Map<string, number>();
  for (const g of gastos) {
    gastosPorMoneda.set(g.moneda, (gastosPorMoneda.get(g.moneda) ?? 0) + Number(g.monto));
  }
  const gastosResumen =
    gastos.length > 0
      ? `${gastos.length} gasto${gastos.length === 1 ? "" : "s"} · ${[...gastosPorMoneda.entries()]
          .map(([m, t]) => `${t.toLocaleString("es-MX", { style: "currency", currency: m })} ${m}`)
          .join(" · ")}`
      : null;
  const [gastoFotoUrls, providersRes] = await Promise.all([
    signFuelPhotos(gastos.map((g) => g.foto_url).filter((p): p is string => !!p)).catch(
      () => ({}) as Record<string, string>,
    ),
    listProviders({ limit: 200 }).catch(() => ({ data: [] })),
  ]);
  const providerOptions = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  // Ruta OPERATIVA (lo que se vuela), derivada de las escalas ACTIVAS (los
  // tramos cancelados no volaron). El origen/destino del vuelo es el espejo
  // comercial (CUN→CUN) y engaña cuando la operación sale de otra base.
  const escalasOrden = [...snapshot.escalas]
    .filter((e) => !e.cancelada_at)
    .sort((a, b) => a.orden - b.orden);
  // Walk con manejo de huecos (2-sep-2026): al filtrar un tramo intermedio
  // cancelado, el origen del siguiente entra como punto propio (el walk
  // ingenuo "origen del 1º + destinos" pintaba una continuidad falsa).
  const rutaOperativa =
    escalasOrden.length > 0
      ? puntosRuta(
          escalasOrden.map((e) => ({
            origen: e.origen_iata,
            destino: e.destino_iata,
          })),
        ).join(" → ")
      : `${snapshot.origen_iata} → ${snapshot.destino_iata}`;
  // Vuelo de SERVICIO (regla 27 jul 2026): algún tramo de parada Servicio y
  // CERO pasajeros en los tramos activos = llevar el avión a taller. No es
  // del cliente: no se cotiza (el backend también lo rechaza).
  const esVueloServicio =
    escalasOrden.length > 0 &&
    escalasOrden.some((e) => e.tipo_parada === "SERVICIO") &&
    escalasOrden.every((e) => !(Number(e.pasajeros) > 0));
  const tramosCotizados = quote?.calculo_snapshot?.tramos;
  const rutaComercial =
    tramosCotizados && tramosCotizados.length > 0
      ? puntosRuta(tramosCotizados).join(" → ")
      : `${snapshot.origen_iata} → ${snapshot.destino_iata}`;

  const aircraft = aircraftRes.data.find((a) => a.id === snapshot.aeronave_id);
  // Ficha del avión AJENO (externo): del snapshot, con fallback a la
  // cotización (misma fila de `vuelo`) para respuestas de APIs previas.
  const avionExternoModelo =
    snapshot.avion_externo_modelo ?? quote?.avion_externo_modelo ?? null;
  const avionExternoMatricula =
    snapshot.avion_externo_matricula ?? quote?.avion_externo_matricula ?? null;
  // Etiqueta de la ficha (mismo patrón del PDF): modelo, matrícula o ambos —
  // una matrícula SOLA también se muestra.
  const avionExternoFicha = [avionExternoModelo, avionExternoMatricula]
    .filter(Boolean)
    .join(" · ");
  // Vuelo COMBINADO (estrategia de pernocta): folio del vuelo ligado — el
  // join puede llegar como objeto o arreglo (PostgREST) o faltar (API vieja).
  const folioCombinado = combinadoFolio(snapshot);
  // Hijo de una cotización de GRUPO (4-sep): badge con link al grupo; el
  // total de aviones vivos lo manda el snapshot (grupo_total_aviones).
  const snapshotConGrupo = snapshot as FlightSnapshot & VueloConGrupo;
  const grupoHijo = grupoDeVuelo(snapshotConGrupo);
  // Apoyo en tierra: CUALQUIER usuario activo de la operación (admin,
  // coordinación, mecánico, visitante…), no solo pilotos (pedido 29-ago; el
  // API ya lo permitía y la app ya listaba a todos). Best-effort: si el rol
  // no puede listar usuarios, el selector cae a los pilotos.
  const usuariosRes = await listUsers({ estado: "ACTIVO", limit: 200 }).catch(
    () => null,
  );
  const rolLabel: Record<string, string> = {
    ADMIN: "admin",
    COORDINADOR: "coordinación",
    ANALISTA: "analista",
    FACTURACION: "facturación",
    PILOTO: "piloto",
    SOCIO: "socio",
    MECANICO: "mecánico",
    VISITANTE: "visitante",
  };
  const apoyoOptions = (usuariosRes?.data ?? [])
    // Un piloto externo (freelance sin app) no puede apoyar.
    .filter((u) => !(u as { es_piloto_externo?: boolean }).es_piloto_externo)
    .map((u) => ({
      id: u.id,
      nombre:
        u.rol === "PILOTO"
          ? u.nombre
          : `${u.nombre} · ${rolLabel[u.rol] ?? String(u.rol).toLowerCase()}`,
      email: u.email,
    }));
  const piloto = pilotsRes.data.find((p) => p.id === snapshot.piloto_id);
  const copiloto = pilotsRes.data.find((p) => p.id === snapshot.copiloto_id);
  // Apoyos en tierra de NIVEL VUELO (0..N, 29-ago): la lista del snapshot con
  // fallback al espejo apoyo_id/apoyo_nombre (API previo). El apoyo puede ser
  // cualquier usuario, no solo pilotos: los nombres que falten se resuelven
  // contra el catálogo.
  const nombreUsuario = (id: string) =>
    pilotsRes.data.find((p) => p.id === id)?.nombre ??
    usuariosRes?.data.find((u) => u.id === id)?.nombre ??
    null;
  const apoyosVuelo = apoyosDeVuelo(snapshot).map((a) => ({
    ...a,
    nombre: a.nombre || nombreUsuario(a.id) || "Usuario",
  }));
  const apoyoNombre =
    apoyosVuelo.length > 0 ? apoyosVuelo.map((a) => a.nombre).join(", ") : null;

  const aircraftOptions = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts),
  }));
  const pilotOptions = pilotsRes.data.map((p) => ({
    id: p.id,
    // El sufijo distingue a los freelance sin app en TODOS los selects de
    // asignación (vuelo, tramo y meta): la oficina captura por ellos.
    nombre: p.es_piloto_externo ? `${p.nombre} · externo` : p.nombre,
    email: p.email,
  }));

  const voucherUrls = await getCobroVoucherUrls(
    snapshot.cobros.map((c) => c.foto_voucher_url).filter((p): p is string => !!p),
  ).catch(() => ({}) as Record<string, string>);

  // Tacómetro incompleto: vuelos propios en curso/cerrados sin todas las
  // lecturas de sus tramos ACTIVOS (los cancelados no piden lectura).
  const faltaTaco =
    !snapshot.es_externo &&
    (snapshot.estado === "EN_VUELO" || snapshot.estado === "COMPLETADO") &&
    (escalasOrden.length === 0 ||
      escalasOrden.some((e) => e.taco_salida == null || e.taco_llegada == null));

  // Misma tolerancia de redondeo que el API (1 USD): un cobro en pesos que
  // cubre el total MXN no deja "pendiente $0.01".
  // Vuelo CANCELADO (regla cliente 28-ago): no existe "pendiente" — lo
  // cobrado queda retenido al 100 % y no se persigue el saldo de la cotización
  // (misma regla que estadoCobroSemaforo en las listas).
  const vueloCancelado = snapshot.estado === "CANCELADO";
  const pendingCobro = vueloCancelado
    ? 0
    : pendienteCobro(Number(snapshot.monto_total_usd), snapshot.total_cobrado);
  const redondeoCobro = vueloCancelado
    ? 0
    : diferenciaRedondeo(Number(snapshot.monto_total_usd), snapshot.total_cobrado);
  // Vuelo MULTI-AVIÓN (regla 28-ago): la venta del avión se reparte por tramo
  // entre los aviones. Lo calcula el API (fuente única); el snapshot lo manda
  // y la cotización (misma fila) es el respaldo. Externos no reparten.
  const participacionAviones = snapshot.es_externo
    ? null
    : (snapshot.participacion_aviones ?? quote?.participacion_aviones ?? null);
  const participacionFuente =
    snapshot.participacion_fuente ?? quote?.participacion_fuente ?? null;

  return (
    <div className="space-y-6">
      {snapshot.estado === "COTIZADO" && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sky-700 dark:text-sky-300">
            <span className="font-semibold">Vuelo en cotización</span> — el
            precio sigue abierto hasta que el cliente confirme; la operación
            (escalas, asignación) ya se puede preparar desde aquí.
          </p>
          <Link
            href={`/admin/quotes/${snapshot.id}`}
            className="shrink-0 text-sm font-medium text-sky-700 dark:text-sky-300 underline underline-offset-2 hover:opacity-80"
          >
            Editar cotización →
          </Link>
        </div>
      )}
      <div>
        <BackLink href="/admin/flights">Vuelos</BackLink>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Vuelo <span className="font-mono">#{snapshot.folio}</span>
              </h1>
              <Badge variant="outline" className={ESTADO_STYLES[snapshot.estado]}>
                {ESTADO_LABELS[snapshot.estado]}
              </Badge>
              {snapshot.es_externo && (
                <Badge variant="outline" className="text-xs">
                  {/* Con ficha capturada: "Externo · HAWKER 400 A · XA-REG"
                      (modelo, matrícula o ambos); si no, el operador. */}
                  {avionExternoFicha
                    ? `Externo · ${avionExternoFicha}`
                    : `Externo ${snapshot.operador_externo ?? ""}`}
                </Badge>
              )}
              {snapshot.cotizacion_abierta && (
                <Badge
                  variant="outline"
                  className="text-xs bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                  title="Vuelo abierto: el itinerario/precio se cierra al final re-cotizando con los tramos reales."
                >
                  Cotización abierta
                </Badge>
              )}
              {snapshot.combinado_con_id && (
                <Link href={`/admin/flights/${snapshot.combinado_con_id}`}>
                  <Badge
                    variant="outline"
                    className="text-xs bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/25 transition-colors"
                    title="Vuelos combinados (estrategia de pernocta): comparten avión, se cancelaron sus tramos ferry vacíos y los precios de ambos clientes no cambiaron. Clic para abrir el otro vuelo."
                  >
                    {folioCombinado != null
                      ? `♻ Combinado con #${folioCombinado}`
                      : "♻ Vuelo combinado"}
                  </Badge>
                </Link>
              )}
              {grupoHijo && (
                <GrupoBadge
                  grupoId={grupoHijo.id}
                  folio={grupoHijo.folio}
                  posicion={snapshotConGrupo.grupo_posicion}
                  total={snapshot.grupo_total_aviones ?? null}
                  nombre={grupoHijo.nombre}
                  className="text-xs"
                />
              )}
              {!snapshot.es_externo &&
                snapshot.estado === "CONFIRMADO" &&
                (!snapshot.piloto_id || !snapshot.aeronave_id ? (
                  <Badge
                    variant="outline"
                    className="text-xs bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30"
                  >
                    ⚠ {!snapshot.piloto_id ? "Falta piloto" : "Falta avión"}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                  >
                    ✓ Asignado
                  </Badge>
                ))}
              {apoyoNombre && (
                <Badge
                  variant="outline"
                  className="text-xs"
                  title="Apoyo en tierra de todo el vuelo: va al aeropuerto a apoyar (maletas, pagos, cobros y gastos). Ve el vuelo como el piloto en su app, pero no captura tacómetros. Los apoyos de un solo tramo se ven en Asignación por tramo."
                >
                  Apoyo: {apoyoNombre}
                </Badge>
              )}
              {snapshot.estado_permiso === "pendiente" && (
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  title="Un aeropuerto de la ruta requiere permiso de pista/operación y aún no se ha emitido. Trámitalo y márcalo como “Emitido” en Editar → Permiso de pista."
                >
                  ⚠ Permiso de pista pendiente
                </Badge>
              )}
              {snapshot.estado_permiso === "emitido" && (
                <Badge
                  variant="outline"
                  className="text-xs bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                  title="El permiso de pista/operación requerido por la ruta ya fue emitido."
                >
                  Permiso de pista emitido
                </Badge>
              )}
              {faltaTaco && (
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                >
                  ⚠ Tacómetro incompleto
                </Badge>
              )}
              {esVueloServicio && (
                <Badge
                  variant="outline"
                  className="text-xs bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                  title="Llevar el avión a taller/parada técnica sin pasajeros: no es del cliente y no se cotiza."
                >
                  Vuelo de servicio
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {client?.nombre ?? snapshot.cliente_id} ·{" "}
              <span className="font-mono">{rutaOperativa}</span> ·{" "}
              {snapshot.pasajeros}{" "}
              {snapshot.pasajeros === 1 ? "pasajero" : "pasajeros"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FlightReportButtons flightId={snapshot.id} folio={snapshot.folio} />
            {/* Ventana de edición (regla del cliente): la cotización solo se
                ajusta con vuelo del mes corriente o anterior (hora Cancún);
                más atrás pertenece a cierres pasados. */}
            {snapshot.estado === "RESERVA" &&
              (esVueloServicio ? (
                <span
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground cursor-not-allowed"
                  title="Vuelo de servicio (taller/parada técnica sin pasajeros): no es del cliente y no se cotiza. Si sí es un viaje del cliente, quita la marca de Servicio del tramo o captura sus pasajeros."
                >
                  <WrenchScrewdriverIcon className="h-4 w-4" />
                  Vuelo de servicio · no se cotiza
                </span>
              ) : cotizacionEditablePorFecha(snapshot.fecha_vuelo) ? (
                <Link
                  href={`/admin/quotes/${snapshot.id}?revisar=1`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-600/90 transition-colors"
                >
                  <BanknotesIcon className="h-4 w-4" />
                  Cotizar
                </Link>
              ) : (
                <span
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground cursor-not-allowed"
                  title="El vuelo es de un mes ya cerrado (anterior al mes pasado): la cotización ya no puede ajustarse."
                >
                  <BanknotesIcon className="h-4 w-4" />
                  Cotizar · mes cerrado
                </span>
              ))}
            {snapshot.cotizacion_abierta &&
              snapshot.estado !== "RESERVA" &&
              snapshot.estado !== "CANCELADO" &&
              !snapshot.cobrado &&
              !snapshot.facturado &&
              (cotizacionEditablePorFecha(snapshot.fecha_vuelo) ? (
                <Link
                  href={`/admin/quotes/${snapshot.id}?revisar=1`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <BanknotesIcon className="h-4 w-4" />
                  {snapshot.estado === "COMPLETADO"
                    ? "Cerrar cotización"
                    : "Ajustar cotización"}
                </Link>
              ) : (
                <span
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground cursor-not-allowed"
                  title="El vuelo es de un mes ya cerrado (anterior al mes pasado): la cotización ya no puede ajustarse."
                >
                  <BanknotesIcon className="h-4 w-4" />
                  Cotización · mes cerrado
                </span>
              ))}
            <FlightActionsBar
              esAdmin={me?.rol === "ADMIN"}
              // Ficha del avión ajeno resuelta vía cotización: así el diálogo
              // «Editar externo» prellena modelo/matrícula y no los pisa.
              flight={{
                ...snapshot,
                avion_externo_modelo: avionExternoModelo,
                avion_externo_matricula: avionExternoMatricula,
              }}
              aircraft={aircraftOptions}
              pilots={pilotOptions}
              apoyoCandidatos={apoyoOptions.length > 0 ? apoyoOptions : undefined}
              gastosResumen={gastosResumen}
              planVueloUrl={planVuelo.url}
              // Externos SIN desglose de cotización (creados con el form
              // externo viejo): el método de cobro se captura en Editar para
              // que entren a la bandeja de Facturas. Con desglose, el método
              // se cambia revisando la cotización (recalcula IVA).
              metodoCobroEditable={
                snapshot.es_externo && !quote?.calculo_snapshot && !snapshot.facturado
              }
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Cobro (reutilizado en ambos layouts) */}
          {(() => {
            const cobroCard = (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
                    Cobro
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label={vueloCancelado ? "Cotizado" : "Monto total"}>
                    <span className="font-mono font-semibold">
                      {fmtUsd(snapshot.monto_total_usd)}
                    </span>
                  </Row>
                  <ParticipacionAvionesNota
                    aviones={participacionAviones}
                    fuente={participacionFuente}
                    className="text-right"
                  />
                  <Row label="Cobrado">
                    <span className="font-mono">
                      {fmtUsd(snapshot.total_cobrado)}
                    </span>
                  </Row>
                  <Row label="Pendiente">
                    {vueloCancelado ? (
                      <span
                        className="font-mono text-muted-foreground"
                        title="Vuelo cancelado: no hay saldo por cobrar; lo cobrado queda retenido."
                      >
                        —
                      </span>
                    ) : (
                    <span
                      className={`font-mono ${pendingCobro > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                      title={
                        redondeoCobro > 0
                          ? `Diferencia de redondeo de ${fmtUsd(redondeoCobro)} USD por la conversión MXN→USD: cuenta como pagado.`
                          : undefined
                      }
                    >
                      {fmtUsd(pendingCobro)}
                      {redondeoCobro > 0 && (
                        <span className="ml-1 text-[10px] font-sans text-muted-foreground">
                          (redondeo {fmtUsd(redondeoCobro)})
                        </span>
                      )}
                    </span>
                    )}
                  </Row>
                  <Row label="Estado">
                    <div className="flex gap-1">
                      {/* Misma fuente única que las listas: un cancelado con
                          cobros pinta "Con cobros" (gris), nunca "Por cobrar". */}
                      <CobroEstadoBadge
                        estado={estadoCobroSemaforo({
                          montoTotalUsd: Number(snapshot.monto_total_usd) || 0,
                          cobrado: snapshot.cobrado,
                          esInterno: client?.es_interno ?? false,
                          totalCobradoUsd: snapshot.total_cobrado,
                          cotizacionAbierta: snapshot.cotizacion_abierta,
                          enCotizacion: snapshot.estado === "COTIZADO",
                          cancelado: vueloCancelado,
                        })}
                      />
                      {snapshot.facturado ? (
                        <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 text-[10px]">
                          Facturado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Sin factura
                        </Badge>
                      )}
                    </div>
                  </Row>
                </CardContent>
              </Card>
            );

            // Con tramos (REDONDO/MULTIESCALA ya inicializados): asignación por tramo.
            if (snapshot.escalas.length > 0) {
              return (
                <div className="space-y-4">
                  <FlightTramosCard
                    flightId={snapshot.id}
                    flightFolio={snapshot.folio}
                    esExterno={snapshot.es_externo}
                    estado={snapshot.estado}
                    escalas={snapshot.escalas}
                    aircraft={aircraftOptions}
                    pilots={pilotOptions}
                    vueloAeronaveId={snapshot.aeronave_id}
                    vueloPilotoId={snapshot.piloto_id}
                    vueloPilotoNombre={piloto?.nombre ?? null}
                    vueloCopilotoId={snapshot.copiloto_id}
                    vueloCopilotoNombre={copiloto?.nombre ?? null}
                    apoyosVuelo={apoyosVuelo}
                    apoyoCandidatos={apoyoOptions.length > 0 ? apoyoOptions : undefined}
                    airports={airportsRes.data.map((a) => ({
                      iata: a.iata,
                      nombre: a.nombre,
                    }))}
                  />
                  {cobroCard}
                </div>
              );
            }

            // Fallback (sin tramos, p. ej. externo): asignación a nivel de vuelo.
            return (
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <PaperAirplaneIcon className="h-4 w-4 text-muted-foreground" />
                      Asignación
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Row label="Aeronave">
                      {snapshot.es_externo ? (
                        avionExternoFicha ? (
                          <span className="font-mono font-semibold">
                            {avionExternoFicha}{" "}
                            <span className="text-muted-foreground font-normal">
                              (externo)
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">N/A (externo)</span>
                        )
                      ) : aircraft ? (
                        <span className="font-mono font-semibold">
                          {aircraft.matricula}{" "}
                          <span className="text-muted-foreground font-normal">
                            {aircraft.modelo}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin asignar</span>
                      )}
                    </Row>
                    <Row label="Piloto">
                      {piloto ? (
                        <span>{piloto.nombre}</span>
                      ) : (
                        <span className="text-muted-foreground">Sin asignar</span>
                      )}
                    </Row>
                    {/* Siempre visibles (feedback 29-ago): así se ve que existen
                        y dónde se editan, aunque vayan vacíos. */}
                    <Row label="Copiloto">
                      {copiloto ? (
                        <span>{copiloto.nombre}</span>
                      ) : (
                        <span
                          className="text-muted-foreground"
                          title="Se agrega con el botón «Piloto y tripulación»"
                        >
                          Sin copiloto
                        </span>
                      )}
                    </Row>
                    <Row label="Apoyo en tierra">
                      {apoyosVuelo.length > 0 ? (
                        <span className="flex flex-wrap justify-end gap-1">
                          {apoyosVuelo.map((a) => (
                            <Badge key={a.id} variant="outline" className="text-[10px]">
                              {a.nombre}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span
                          className="text-muted-foreground"
                          title="Se agrega con el botón «Piloto y tripulación»"
                        >
                          Sin apoyo
                        </span>
                      )}
                    </Row>
                    <Row label="Traslado inicial">
                      {snapshot.fecha_vuelo ? (
                        fmtDateTime(snapshot.fecha_vuelo)
                      ) : (
                        <span className="text-muted-foreground">Sin fecha</span>
                      )}
                    </Row>
                    <Row label="Traslado final">
                      {snapshot.fecha_traslado_final ? (
                        fmtDateTime(snapshot.fecha_traslado_final)
                      ) : snapshot.fecha_fin &&
                        snapshot.fecha_fin !== snapshot.fecha_vuelo ? (
                        // Sin traslado capturado pero el viaje termina otro
                        // día: fecha_fin la deriva el trigger (GREATEST de
                        // los tramos) y se muestra como referencia.
                        <span>
                          {fmtDateTime(snapshot.fecha_fin)}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            · derivado del itinerario
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin fecha</span>
                      )}
                    </Row>
                    {snapshot.fecha_confirmacion && (
                      <Row label="Confirmado">{fmtDateTime(snapshot.fecha_confirmacion)}</Row>
                    )}
                    <p className="px-1 pt-1 text-[11px] text-muted-foreground">{TZ_LABEL}</p>
                  </CardContent>
                </Card>
                {cobroCard}
              </div>
            );
          })()}

          {/* Escalas */}
          <EscalasCard
            flightId={snapshot.id}
            escalas={snapshot.escalas}
            tacoPhotos={tacoPhotos}
            pilotoExterno={piloto?.es_piloto_externo === true}
            vueloAnterior={vueloAnterior}
          />

          {/* Cobros */}
          <CobrosCard
            flightId={snapshot.id}
            flightFolio={snapshot.folio}
            flightEstado={snapshot.estado}
            montoTotalUsd={Number(snapshot.monto_total_usd)}
            pendingUsd={pendingCobro}
            cobradoUsd={snapshot.total_cobrado}
            cobros={snapshot.cobros}
            voucherUrls={voucherUrls}
            tcCotizacion={snapshot.tc_usd_mxn ? Number(snapshot.tc_usd_mxn) : null}
            tcOficial={tcOficial}
            tcOficialFecha={diaCotizacion}
            // Reembolsos: solo roles de oficina.
            puedeReembolsar={me?.rol === "ADMIN" || me?.rol === "COORDINADOR"}
          />

          {/* Gastos del vuelo: desglose completo (el piloto solo ve el total;
              oficina revisa aquí Operación/FBO, combustible, viáticos...).
              En vuelos CUBIERTOS por externo los gastos SÍ se capturan
              (pistas, comisiones, apoyos) — lo único que no aplica son los
              tacómetros. */}
          {snapshot.es_externo && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Apoyo externo</CardTitle>
                <CardDescription className="text-xs">
                  Este vuelo lo opera un tercero: los tacómetros no aplican;
                  los gastos sí se capturan abajo como en cualquier vuelo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Operador">
                  {snapshot.operador_externo ?? (
                    <span className="text-muted-foreground">Sin registrar</span>
                  )}
                </Row>
                {avionExternoFicha && (
                  <Row label="Avión">
                    <span className="font-mono">{avionExternoFicha}</span>
                  </Row>
                )}
                <Row label="Lo que cobra el operador externo">
                  <span className="font-semibold">
                    {fmtUsd(Number(snapshot.costo_externo_usd) || 0)}
                  </span>
                  {/* Costo capturado en MXN: el USD es DERIVADO por el API
                      (monto ÷ tc); el nativo se muestra al lado. */}
                  {snapshot.costo_externo_moneda === "MXN" &&
                    Number(snapshot.costo_externo_monto) > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                        ({fmtMxn(Number(snapshot.costo_externo_monto))}
                        {Number(snapshot.costo_externo_tc) > 0
                          ? ` · tc ${Number(snapshot.costo_externo_tc)}`
                          : ""}
                        )
                      </span>
                    )}
                </Row>
                <Row label="Margen vs cobro">
                  {fmtUsd(
                    Number(snapshot.monto_total_usd) -
                      (Number(snapshot.costo_externo_usd) || 0),
                  )}
                </Row>
                <p className="text-xs text-muted-foreground pt-1">
                  Edita operador/avión/costo con el botón «Editar externo» de
                  arriba.
                </p>
              </CardContent>
            </Card>
          )}
          <FlightGastosCard
            gastos={gastos}
            fotoUrls={gastoFotoUrls}
            aircraft={aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }))}
            providers={providerOptions}
            vueloId={snapshot.id}
            vueloFolio={snapshot.folio}
            vueloCancelado={snapshot.estado === "CANCELADO"}
            aeronaveId={snapshot.aeronave_id}
            pilotoNombre={piloto?.nombre ?? null}
          />

          {/* Historial de gastos: quién capturó/editó/eliminó y qué cambió
              (gasto_bitacora por trigger — auditoría pedida el 31-ago). */}
          <FlightGastosHistorialCard eventos={gastosHistorial} />

          {/* Bitácora: recordatorios de tacómetro + capturas (punto 5) */}
          <FlightBitacoraCard eventos={bitacora} />
        </div>

        <div className="space-y-6">
          {/* Cotización */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cotización</CardTitle>
              <CardDescription className="text-xs">
                Snapshot v{snapshot.cotizacion_version} del cálculo aplicado al
                vuelo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Tipo">{snapshot.tipo}</Row>
              <Row label="Ruta cotizada">
                <span className="font-mono">{rutaComercial}</span>
              </Row>
              <Row label="Total USD">
                <span className="font-mono font-semibold">
                  {fmtUsd(snapshot.monto_total_usd)}
                </span>
              </Row>
              <Link
                href={`/admin/quotes/${snapshot.id}`}
                className="text-xs underline text-muted-foreground hover:text-foreground"
              >
                Ver detalle de cotización →
              </Link>
            </CardContent>
          </Card>

          {/* Pasajeros (manifiesto) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pasajeros</CardTitle>
              <CardDescription className="text-xs">
                {snapshot.pasajeros}{" "}
                {snapshot.pasajeros === 1 ? "pasajero declarado" : "pasajeros declarados"}.
                Los nombres son necesarios para tramitar permisos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(snapshot.pasajeros_nombres?.length ?? 0) > 0 ? (
                <ol className="space-y-1 text-sm list-decimal list-inside">
                  {snapshot.pasajeros_nombres!.map((n, i) => (
                    <li key={`${n}-${i}`}>{n}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin nombres registrados. Agrégalos en{" "}
                  <span className="font-medium">Editar → Nombres de pasajeros</span>.
                </p>
              )}
              {(snapshot.pasajeros_nombres?.length ?? 0) > 0 &&
                snapshot.pasajeros_nombres!.length !== snapshot.pasajeros && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    ⚠ {snapshot.pasajeros_nombres!.length}{" "}
                    {snapshot.pasajeros_nombres!.length === 1 ? "nombre" : "nombres"} vs{" "}
                    {snapshot.pasajeros} pax declarados.
                  </p>
                )}
            </CardContent>
          </Card>

          {(snapshot.notas || snapshot.notas_internas) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Notas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {snapshot.notas && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Visible en PDF
                    </p>
                    <p className="whitespace-pre-wrap">{snapshot.notas}</p>
                  </div>
                )}
                {snapshot.notas_internas && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Solo equipo
                    </p>
                    <p className="whitespace-pre-wrap">
                      {snapshot.notas_internas}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="text-sm text-right">{children}</div>
    </div>
  );
}
