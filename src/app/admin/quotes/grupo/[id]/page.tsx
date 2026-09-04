import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { GrupoAvionesTable } from "@/components/admin/grupos/detalle/grupo-aviones-table";
import { GrupoAvisos } from "@/components/admin/grupos/detalle/grupo-avisos";
import { GrupoCobrosCard } from "@/components/admin/grupos/detalle/grupo-cobros-card";
import { GrupoConsolidadoCard } from "@/components/admin/grupos/detalle/grupo-consolidado-card";
import { GrupoHeaderActions } from "@/components/admin/grupos/detalle/grupo-header-actions";
import { GrupoOperacionCard } from "@/components/admin/grupos/detalle/grupo-operacion-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listAircraft } from "@/lib/api/aircraft";
import { getGrupo } from "@/lib/api/grupos-server";
import { getMe } from "@/lib/api/me";
import { getTipoCambioOficial } from "@/lib/api/tipo-cambio-server";
import { listUsers } from "@/lib/api/users-server";
import { pendienteCobro } from "@/lib/admin/cobros";
import { estadoGrupoBadge, etiquetaReparto, semaforoCobroGrupo } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { puntosRuta } from "@/lib/admin/ruta-comercial";
import { fmtDateTime, isoToCancunInput, TZ_LABEL } from "@/lib/datetime";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface GrupoDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Detalle de la cotización de GRUPO (4-sep-2026): cabecera sin dinero
 * propio + un vuelo hijo por avión. Todo total (consolidado, por persona,
 * cobrado/saldo) viene del API; aquí SOLO se pinta. Es la ruta a la que
 * enlazan las alertas del API (/admin/quotes/grupo/:id).
 */
export default async function GrupoDetailPage({ params }: GrupoDetailPageProps) {
  const { id } = await params;
  const [me, grupo] = await Promise.all([getMe().catch(() => null), getGrupo(id)]);
  if (!grupo) notFound();

  const puedeEditar = me?.rol === "ADMIN" || me?.rol === "COORDINADOR";
  // Sobre de cobro (Fase 2): mismos roles que el API (COBRA_GRUPO /
  // DELETE sobre = paridad con el cobro por vuelo).
  const puedeCobrar = puedeEditar || me?.rol === "FACTURACION";
  const puedeEliminarCobro = me?.rol === "ADMIN" || me?.rol === "FACTURACION";
  // Día Cancún en que se cotizó el grupo: TC oficial de respaldo al cobrar
  // en pesos cuando el grupo no fijó TC (misma regla que el cobro por vuelo).
  const diaCotizacion = isoToCancunInput(grupo.created_at).slice(0, 10) || null;
  // Catálogos para «Reemplazar avión» (solo quien edita los necesita).
  const [aircraftRes, pilotsRes, tcOficial] = await Promise.all([
    puedeEditar
      ? listAircraft({ limit: 100, activa: true }).catch(() => ({ data: [] as Awaited<ReturnType<typeof listAircraft>>["data"] }))
      : Promise.resolve({ data: [] as Awaited<ReturnType<typeof listAircraft>>["data"] }),
    puedeEditar
      ? listUsers({ rol: "PILOTO", limit: 50 }).catch(() => ({ data: [] as Awaited<ReturnType<typeof listUsers>>["data"] }))
      : Promise.resolve({ data: [] as Awaited<ReturnType<typeof listUsers>>["data"] }),
    puedeCobrar && grupo.tc_usd_mxn == null && diaCotizacion
      ? getTipoCambioOficial(diaCotizacion)
      : Promise.resolve<number | null>(null),
  ]);

  const estadoBadge = estadoGrupoBadge(grupo.estado);
  const ruta = puntosRuta(
    (grupo.escalas_plantilla ?? []).map((t) => ({ origen: t.origen_iata, destino: t.destino_iata })),
  );
  const vivos = grupo.aviones.filter((a) => !a.cancelado);
  const semaforo = semaforoCobroGrupo(grupo);
  const total = grupo.consolidado?.total_usd ?? 0;
  const pendiente = pendienteCobro(total, grupo.cobrado_usd ?? 0);
  const pdfToggles: { label: string; on: boolean }[] = [
    { label: "Anexo de aviones (flota asignada)", on: grupo.pdf_mostrar_anexo_aviones },
    { label: "Subtotal por avión", on: grupo.pdf_mostrar_subtotal_por_avion },
    { label: "Precio por persona", on: grupo.pdf_mostrar_precio_por_persona },
    { label: "Tarifa por hora", on: grupo.pdf_mostrar_tarifa },
  ];

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/quotes/grupo">Grupos</BackLink>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Grupo <span className="font-mono">{grupo.folio_texto}</span>
              </h1>
              <Badge variant={estadoBadge.variant} className={estadoBadge.className} title={estadoBadge.title}>
                {estadoBadge.label}
              </Badge>
              <Badge variant="secondary" className="font-mono">
                v{grupo.version}
              </Badge>
              {grupo.cliente?.es_interno && (
                <Badge variant="outline" className="text-xs" title="Cliente interno: cotiza $0 a propósito">
                  Interno
                </Badge>
              )}
            </div>
            <p className="mt-1 text-base font-medium">{grupo.nombre}</p>
            <p className="text-sm text-muted-foreground">
              {grupo.cliente?.nombre ?? grupo.cliente_id} · {ruta.join(" → ") || "sin ruta"} ·{" "}
              {grupo.pasajeros_total} {grupo.pasajeros_total === 1 ? "pasajero" : "pasajeros"} ·{" "}
              {vivos.length} {vivos.length === 1 ? "avión" : "aviones"} ·{" "}
              {fmtDateTime(grupo.fecha_vuelo)}
              {grupo.fecha_fin && grupo.fecha_fin !== grupo.fecha_vuelo
                ? ` → ${fmtDateTime(grupo.fecha_fin)}`
                : ""}
            </p>
          </div>
          <GrupoHeaderActions grupo={grupo} puedeEditar={puedeEditar} />
        </div>
      </div>

      {/* Avisos/problemas del API: SIEMPRE visibles. */}
      <GrupoAvisos grupo={grupo} />

      {grupo.cancelado_at && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Grupo cancelado el {fmtDateTime(grupo.cancelado_at)}
          {grupo.cancelado_motivo ? ` — ${grupo.cancelado_motivo}` : ""}. Sus vuelos
          quedaron cancelados; cobros y gastos ya registrados se conservan.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* TOTAL del grupo (Σ hijos vivos, del API) */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Total del grupo
                  </p>
                  <p className="text-4xl md:text-5xl font-bold tracking-tight">{fmtUsd(total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    USD · {grupo.consolidado.aviones}{" "}
                    {grupo.consolidado.aviones === 1 ? "avión" : "aviones"} ·{" "}
                    {fmtDecimal(grupo.consolidado.horas_total_hr, 2)} hr cobrables
                  </p>
                </div>
                <div className="text-right space-y-1">
                  {grupo.consolidado.total_mxn != null && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">MXN</p>
                      <p className="text-xl font-semibold">{fmtMxn(grupo.consolidado.total_mxn)}</p>
                      {grupo.tc_usd_mxn != null && (
                        <p className="text-[10px] text-muted-foreground">
                          tc {fmtDecimal(grupo.tc_usd_mxn, 4)}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Por persona
                    </p>
                    <p className="text-lg font-semibold font-mono">
                      {grupo.consolidado.por_persona_usd != null
                        ? fmtUsd(grupo.consolidado.por_persona_usd)
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
              {/* Cada celda es un número del API tal cual (nada se suma aquí). */}
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Cell label="Servicio aéreo" value={fmtUsd(grupo.consolidado.subtotal_aereo_usd)} />
                <Cell label="TUAS" value={fmtUsd(grupo.consolidado.tuas_usd)} />
                <Cell label="Cargos del grupo" value={fmtUsd(grupo.consolidado.extras_usd)} />
                {grupo.consolidado.pernocta_usd !== 0 && (
                  <Cell label="Pernocta" value={fmtUsd(grupo.consolidado.pernocta_usd)} />
                )}
                {grupo.consolidado.ajuste_usd !== 0 && (
                  <Cell
                    label={grupo.consolidado.ajuste_usd < 0 ? "Descuento" : "Ajuste"}
                    value={fmtUsd(grupo.consolidado.ajuste_usd)}
                  />
                )}
                <Cell label="IVA" value={fmtUsd(grupo.consolidado.iva_usd)} />
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap text-sm">
                <div className="flex items-center gap-3">
                  <CobroEstadoBadge estado={semaforo} />
                  <span className="text-muted-foreground">
                    Cobrado <span className="font-mono text-foreground">{fmtUsd(grupo.cobrado_usd)}</span>
                    {" · "}
                    Saldo{" "}
                    <span
                      className={cn(
                        "font-mono",
                        pendiente > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                      )}
                    >
                      {fmtUsd(grupo.saldo_usd)}
                    </span>
                  </span>
                </div>
                <a
                  href="#cobros-grupo"
                  className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Registrar un pago del cliente → Cobros del grupo
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Aviones del grupo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Aviones del grupo</CardTitle>
              <CardDescription className="text-xs">
                Un vuelo por avión con su piloto, salida escalonada y precio propio. Las
                acciones por avión están en el menú de cada fila.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <GrupoAvionesTable
                grupo={grupo}
                aircraft={aircraftRes.data.map((a) => ({
                  id: a.id,
                  matricula: a.matricula,
                  modelo: a.modelo,
                  asientos: a.asientos ?? null,
                }))}
                pilots={pilotsRes.data.map((p) => ({ id: p.id, nombre: p.nombre }))}
                puedeEditar={puedeEditar}
              />
            </CardContent>
          </Card>

          {/* Sobres de cobro del grupo (Fase 2): un pago → N partes por avión. */}
          <GrupoCobrosCard
            grupo={grupo}
            semaforo={semaforo}
            puedeCobrar={puedeCobrar}
            puedeEliminar={puedeEliminarCobro}
            tcOficial={tcOficial}
            tcOficialFecha={diaCotizacion}
          />

          <GrupoConsolidadoCard
            consolidado={grupo.consolidado}
            pasajerosTotal={grupo.pasajeros_total}
            tcUsdMxn={grupo.tc_usd_mxn}
          />

          <GrupoOperacionCard grupo={grupo} />

          {(grupo.notas || grupo.notas_internas) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {grupo.notas && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Notas (visibles en PDF)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{grupo.notas}</p>
                  </CardContent>
                </Card>
              )}
              {grupo.notas_internas && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Notas internas</CardTitle>
                    <CardDescription className="text-xs">
                      Solo para el equipo. No aparecen en el PDF al cliente.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{grupo.notas_internas}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Itinerario común (plantilla) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Itinerario del grupo</CardTitle>
              <CardDescription className="text-xs">
                Ruta comercial común; cada avión la vuela con sus pasajeros
                (doble vuelta agrega tramos de reposicionamiento).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5 text-xs">
                {(grupo.escalas_plantilla ?? []).map((t, i) => (
                  <li
                    key={`${i}-${t.origen_iata}-${t.destino_iata}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className={cn("font-mono flex items-center gap-1.5", t.pdf_oculto && "opacity-60")}>
                      <span className="text-muted-foreground">{i + 1}.</span>
                      {t.origen_iata} → {t.destino_iata}
                      {t.es_ferry && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          ferry
                        </Badge>
                      )}
                      {t.requiere_pernocta && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          pernocta
                        </Badge>
                      )}
                      {t.tipo_parada === "SERVICIO" && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          servicio
                        </Badge>
                      )}
                      {t.pdf_oculto && (
                        <span className="text-[9px] text-muted-foreground">(oculto en PDF)</span>
                      )}
                    </span>
                    <span className="font-mono text-muted-foreground shrink-0">
                      {t.millas_nauticas ? `${fmtDecimal(t.millas_nauticas)} NM` : "—"}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Cargos del grupo (definiciones; el monto vive en los hijos) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cargos del grupo</CardTitle>
              <CardDescription className="text-xs">
                Se reparten a cada avión según sus pasajeros. Se editan con «Revisar».
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(grupo.extras_grupo ?? []).length === 0 && grupo.ajuste_grupo_usd === 0 && (
                <p className="text-xs text-muted-foreground">Sin cargos adicionales.</p>
              )}
              {(grupo.extras_grupo ?? []).map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium break-words">{e.concepto}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {etiquetaReparto(e.reparto)}
                      {e.aplica_iva === false ? " · sin IVA" : ""}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-right shrink-0">
                    {e.por_persona ? grupo.pasajeros_total : (e.cantidad ?? "—")} ×{" "}
                    {e.moneda === "MXN" ? fmtMxn(e.unitario) : fmtUsd(e.unitario)}
                  </span>
                </div>
              ))}
              {grupo.ajuste_grupo_usd !== 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                  <span className="text-muted-foreground">
                    {grupo.ajuste_grupo_usd < 0 ? "Descuento del grupo" : "Redondeo del grupo"}
                    <span className="block text-[11px]">pre-IVA, repartido por avión</span>
                  </span>
                  <span className="font-mono">{fmtUsd(grupo.ajuste_grupo_usd)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Datos de la cotización */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cotización</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Cell
                label="Tarifa"
                value={
                  <Badge variant="outline" className="font-mono text-xs">
                    {grupo.tarifa_tipo}
                  </Badge>
                }
              />
              <Cell label="Método de cobro" value={metodoPagoLabel(grupo.metodo_cobro)} />
              <Cell label="Tipo de cambio" value={grupo.tc_usd_mxn != null ? fmtDecimal(grupo.tc_usd_mxn, 4) : "—"} />
              <Cell label="Pase de abordar" value={grupo.pase_abordar ? "Sí (exenta TUA)" : "No"} />
              <Cell label="Creado" value={fmtDateTime(grupo.created_at)} />
              <Cell label="Última edición" value={fmtDateTime(grupo.updated_at)} />
              <div className="col-span-2 pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">PDF del cliente</p>
                <ul className="space-y-0.5 text-xs">
                  {pdfToggles.map((t) => (
                    <li key={t.label} className="flex items-center justify-between gap-2">
                      <span className={cn(!t.on && "text-muted-foreground")}>{t.label}</span>
                      <span className={cn("font-mono", t.on ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                        {t.on ? "Sí" : "No"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Los toggles del PDF se cambian con «Revisar». Vuelos ligados:{" "}
                  <Link href={`/admin/quotes?grupo_id=${grupo.id}`} className="underline underline-offset-2 hover:text-foreground">
                    cotizaciones
                  </Link>{" "}
                  ·{" "}
                  <Link href={`/admin/flights?grupo_id=${grupo.id}`} className="underline underline-offset-2 hover:text-foreground">
                    vuelos
                  </Link>
                  .
                </p>
              </div>
              <p className="col-span-2 px-1 text-[11px] text-muted-foreground">{TZ_LABEL}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
