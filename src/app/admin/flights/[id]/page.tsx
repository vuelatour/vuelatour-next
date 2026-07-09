import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  PaperAirplaneIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FlightActionsBar } from "@/components/admin/flights/flight-actions-bar";
import { FlightReportButtons } from "@/components/admin/flights/flight-report-buttons";
import { fmtDateTime, TZ_LABEL } from "@/lib/datetime";
import { CobrosCard } from "@/components/admin/flights/cobros-card";
import { EscalasCard } from "@/components/admin/flights/escalas-card";
import { FlightTramosCard } from "@/components/admin/flights/flight-tramos-card";
import { FlightBitacoraCard } from "@/components/admin/flights/flight-bitacora-card";
import {
  getFlightSnapshot,
  getFlightTacoPhotos,
  getCobroVoucherUrls,
  getFlightBitacora,
} from "@/lib/api/flights-server";
import { listGastos, signFuelPhotos } from "@/lib/api/expenses-server";
import { listProviders } from "@/lib/api/providers-server";
import { FlightGastosCard } from "@/components/admin/flights/flight-gastos-card";
import { getClient } from "@/lib/api/clients-server";
import { getQuote } from "@/lib/api/quotes-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { listAirports } from "@/lib/api/airports-server";
import { ApiError } from "@/lib/api/errors";
import { fmtUsd } from "@/lib/format";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";

export const dynamic = "force-dynamic";


interface FlightDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function FlightDetailPage({ params }: FlightDetailPageProps) {
  const { id } = await params;

  let snapshot;
  try {
    snapshot = await getFlightSnapshot(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Si está aún en SOLICITUD/COTIZADO, redirigir mentalmente al usuario:
  // este módulo es para vuelos operativos.
  if (snapshot.estado === "SOLICITUD" || snapshot.estado === "COTIZADO") {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/flights"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Vuelos
        </Link>
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

  const [client, aircraftRes, pilotsRes, airportsRes, tacoPhotos, bitacora, quote, gastosRes] =
    await Promise.all([
      getClient(snapshot.cliente_id).catch(() => null),
      listAircraft({ limit: 100, activa: true }),
      listUsers({ rol: "PILOTO", limit: 50 }),
      listAirports({ limit: 200, activo: true }),
      getFlightTacoPhotos(id).catch(() => []),
      getFlightBitacora(id),
      // Solo para pintar la ruta COMERCIAL cotizada (vive en el snapshot del
      // cálculo, no en las escalas, que son la operación). Best-effort.
      getQuote(id).catch(() => null),
      // Gastos del vuelo (operativos y generales) con su desglose.
      listGastos({ vuelo_id: id, limit: 200 }).catch(
        () => ({ data: [], count: 0, limit: 0, offset: 0 }),
      ),
    ]);
  const gastos = gastosRes.data;
  const [gastoFotoUrls, providersRes] = await Promise.all([
    signFuelPhotos(gastos.map((g) => g.foto_url).filter((p): p is string => !!p)).catch(
      () => ({}) as Record<string, string>,
    ),
    listProviders({ limit: 200 }).catch(() => ({ data: [] })),
  ]);
  const providerOptions = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  // Ruta OPERATIVA (lo que se vuela), derivada de las escalas. El
  // origen/destino del vuelo es el espejo comercial (CUN→CUN) y engaña
  // cuando la operación sale de otra base.
  const escalasOrden = [...snapshot.escalas].sort((a, b) => a.orden - b.orden);
  const rutaOperativa =
    escalasOrden.length > 0
      ? [escalasOrden[0].origen_iata, ...escalasOrden.map((e) => e.destino_iata)].join(" → ")
      : `${snapshot.origen_iata} → ${snapshot.destino_iata}`;
  const tramosCotizados = quote?.calculo_snapshot?.tramos;
  const rutaComercial =
    tramosCotizados && tramosCotizados.length > 0
      ? [tramosCotizados[0].origen, ...tramosCotizados.map((t) => t.destino)].join(" → ")
      : `${snapshot.origen_iata} → ${snapshot.destino_iata}`;

  const aircraft = aircraftRes.data.find((a) => a.id === snapshot.aeronave_id);
  const piloto = pilotsRes.data.find((p) => p.id === snapshot.piloto_id);
  const copiloto = pilotsRes.data.find((p) => p.id === snapshot.copiloto_id);

  const aircraftOptions = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts),
  }));
  const pilotOptions = pilotsRes.data.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    email: p.email,
  }));

  const voucherUrls = await getCobroVoucherUrls(
    snapshot.cobros.map((c) => c.foto_voucher_url).filter((p): p is string => !!p),
  ).catch(() => ({}) as Record<string, string>);

  // Tacómetro incompleto: vuelos propios en curso/cerrados sin todas las lecturas.
  const faltaTaco =
    !snapshot.es_externo &&
    (snapshot.estado === "EN_VUELO" || snapshot.estado === "COMPLETADO") &&
    (snapshot.escalas.length === 0 ||
      snapshot.escalas.some((e) => e.taco_salida == null || e.taco_llegada == null));

  const pendingCobro = Math.max(
    0,
    Number(snapshot.monto_total_usd) - snapshot.total_cobrado,
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/flights"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Vuelos
        </Link>
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
                  Externo {snapshot.operador_externo ?? ""}
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
            {snapshot.estado === "RESERVA" && (
              <Link
                href={`/admin/quotes/${snapshot.id}/revise`}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-600/90 transition-colors"
              >
                <BanknotesIcon className="h-4 w-4" />
                Cotizar
              </Link>
            )}
            {snapshot.cotizacion_abierta &&
              snapshot.estado !== "RESERVA" &&
              snapshot.estado !== "CANCELADO" &&
              !snapshot.cobrado &&
              !snapshot.facturado && (
                <Link
                  href={`/admin/quotes/${snapshot.id}/revise`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <BanknotesIcon className="h-4 w-4" />
                  {snapshot.estado === "COMPLETADO"
                    ? "Cerrar cotización"
                    : "Ajustar cotización"}
                </Link>
              )}
            <FlightActionsBar
              flight={snapshot}
              aircraft={aircraftOptions}
              pilots={pilotOptions}
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
                  <Row label="Monto total">
                    <span className="font-mono font-semibold">
                      {fmtUsd(snapshot.monto_total_usd)}
                    </span>
                  </Row>
                  <Row label="Cobrado">
                    <span className="font-mono">
                      {fmtUsd(snapshot.total_cobrado)}
                    </span>
                  </Row>
                  <Row label="Pendiente">
                    <span
                      className={`font-mono ${pendingCobro > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                    >
                      {fmtUsd(pendingCobro)}
                    </span>
                  </Row>
                  <Row label="Estado">
                    <div className="flex gap-1">
                      {snapshot.cobrado ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 text-[10px]">
                          Cobrado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Por cobrar
                        </Badge>
                      )}
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
                        <span className="text-muted-foreground">N/A (externo)</span>
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
                    {copiloto && <Row label="Copiloto">{copiloto.nombre}</Row>}
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
          />

          {/* Cobros */}
          <CobrosCard
            flightId={snapshot.id}
            flightFolio={snapshot.folio}
            flightEstado={snapshot.estado}
            montoTotalUsd={Number(snapshot.monto_total_usd)}
            pendingUsd={pendingCobro}
            cobros={snapshot.cobros}
            voucherUrls={voucherUrls}
          />

          {/* Gastos del vuelo: desglose completo (el piloto solo ve el total;
              oficina revisa aquí Operación/FBO, combustible, viáticos...) */}
          <FlightGastosCard
            gastos={gastos}
            fotoUrls={gastoFotoUrls}
            aircraft={aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }))}
            providers={providerOptions}
          />

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
