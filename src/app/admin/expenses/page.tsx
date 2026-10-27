import type { Metadata } from "next";
import { PESTANAS_GASTOS, tituloGastos } from "@/lib/admin/titulos-pestana";
import Link from "next/link";
import {
  BanknotesIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExpensesTable } from "@/components/admin/expenses/expenses-table";
import { listGastos, listGastosAll, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { listPilots } from "@/lib/api/pilots-server";
import { listUsers } from "@/lib/api/users-server";
import { getMe } from "@/lib/api/me";
import { ExpensesFilterBar } from "@/components/admin/expenses/expenses-filter-bar";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { tituloExcelGastos } from "@/lib/admin/gasto-banco";
import { SuggestAssignmentsButton } from "@/components/admin/expenses/suggest-assignments-button";
import { ExpenseCreateDialog } from "@/components/admin/expenses/expense-create-dialog";
import { PistasDialog } from "@/components/admin/expenses/pistas-dialog";
import {
  ExpensesSeleccionProvider,
  UnirCompraToggle,
} from "@/components/admin/expenses/expenses-seleccion";
import { IndicadorEnlace } from "@/components/admin/indicador-enlace";
import { EmptyState } from "@/components/admin/empty-state";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { esCategoriaCompra } from "@/types/compras";
import { todayCancun } from "@/lib/datetime";
import { FranjaPreCierre } from "@/components/admin/franja-pre-cierre";
import { FranjaGastoEnfocado } from "@/components/admin/expenses/franja-gasto-enfocado";
import {
  filasResaltadasPrimero,
  hrefQuitarResaltado,
  hrefVolverPreCierre,
  leerFocoPreCierre,
} from "@/lib/admin/pre-cierre-resolver";
import { hrefQuitarGastoEnfocado, leerGastoEnfocado } from "@/lib/admin/gasto-enfocado";
import { Degradaciones, principal } from "@/lib/api/degradar";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { avionCatalogoGasto } from "@/lib/admin/combustibles";
import {
  AVION_FILTRO_DESCONOCIDO,
  CAMPOS_OPCIONALES_GASTOS,
  DESCRIPCION_ERROR_LISTA_GASTOS,
  DESCRIPCION_NOMINA_FUERA_DE_GASTOS,
  ETIQUETA_IR_A_NOMINA,
  ETIQUETA_CHIP_AVION,
  ETIQUETA_FOTOS_COMPROBANTES,
  ETIQUETA_LISTA_GASTOS,
  ETIQUETA_TOTAL_PENDIENTES,
  TEXTO_QUITAR_FILTROS_GASTOS,
  TITULO_ERROR_LISTA_GASTOS,
  TITULO_NOMINA_FUERA_DE_GASTOS,
  TITULO_QUITAR_FILTRO_AVION,
  ariaQuitarFiltroAvion,
  hayFiltrosGastos,
  hrefNominaDesdeGastos,
  hrefQuitarFiltrosGastos,
  leerFiltrosGastos,
  queryBaseGastos,
  queryExcelGastos,
  queryListaGastos,
  textoCorteGastos,
  tituloVistaGastos,
  vacioGastos,
  type FiltrosGastos,
  type VistaGastos,
} from "@/lib/admin/gastos-vista";
import { getInicioOficial } from "@/lib/api/inicio-oficial";
import type { InicioOficial } from "@/lib/admin/inicio-oficial";
import { AvisoPeriodoAjustado } from "@/components/admin/aviso-inicio-oficial";
import {
  CLAVE_PRECIERRE_GASTOS_POR_PAGAR,
  DESCRIPCION_POR_PAGAR_IGNORADO,
  NOTA_VISTA_POR_PAGAR_GASTOS,
  TITULO_POR_PAGAR_IGNORADO,
  capacidadPorPagarDeMe,
} from "@/lib/admin/gasto-por-pagar";

export const dynamic = "force-dynamic";
// «Subir facturas» del gasto (16-oct-2026): la server action vive en esta
// página y el API procesa cada factura en fila (lee el XML, sube los
// archivos); sin esto Vercel podía cortar un lote a medias.
export const maxDuration = 60;

/**
 * Filtros de la URL (`?f=`, avión, categoría…) con la MISMA lectura y
 * validación que la barra de filtros (`leerFiltrosGastos`): la pantalla y su
 * título de pestaña no pueden divergir.
 */
function filtroGastosDeUrl(
  sp: Record<string, string | undefined>,
  inicio: InicioOficial = null,
  porPagarDisponible = false,
): FiltrosGastos {
  return leerFiltrosGastos((k) => sp[k], inicio, porPagarDisponible);
}

/** «Gastos» (Todos) · «Gastos · Pendientes» · «Gastos · Duplicados». */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return { title: tituloGastos(filtroGastosDeUrl(sp).vista) };
}

/**
 * Gastos: UNA sola tabla (14-oct-2026). Pedido del cliente: unir en una sola
 * tabla las dos tarjetas de antes (generales y operativos) — «está como
 * ambigua la información… toda la vista debe quedar bien e intuitiva». La
 * división vieja partía en dos tarjetas los gastos de un mismo vuelo (233
 * directos del vuelo caían en «generales») y no decía a dónde iba el dinero;
 * ahora cada renglón lo dice en «Avión · vuelo» y el filtro de SERVIDOR
 * «Categoría» sustituye a la división (lo heredan las pestañas y el Excel).
 * Reglas y textos en `lib/admin/gastos-vista.ts`; columnas en
 * `expenses-table.tsx`.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    f?: string;
    aeronave_id?: string;
    /** Una de las 22 categorías (filtro de servidor, 14-oct-2026). */
    categoria?: string;
    medio?: string;
    piloto?: string;
    desde?: string;
    hasta?: string;
    facturacion?: string;
    /** conciliados | sin_conciliar (columna «Banco», 9-oct-2026). */
    banco?: string;
    /** "7d" = solo lo CAPTURADO en los últimos 7 días (aunque el ticket
     *  traiga otra fecha): «Esta semana» de «Fecha de captura». */
    cap?: string;
    /** Rango explícito de CAPTURA (día Cancún, 7-sep): mismo eje que `cap`
     *  — si viene un rango, la semana se ignora. */
    cap_desde?: string;
    cap_hasta?: string;
    /** fecha (default) | captura: orden del listado y del Excel. */
    orden?: string;
    /** Foco del pre-cierre («Resolver →», 15-oct-2026): SOLO del panel; NO
        entran a `FILTROS_URL` ni a `claveVista` ni viajan al API. */
    pc?: string;
    ids?: string;
    pcn?: string;
    pct?: string;
    pcd?: string;
    pcp?: string;
    /** «Por pagar» (19-oct-2026, API 0.0.95): `1` ⇒ estado ≠ PAGADO. Solo
        con la capacidad de `/v1/me`; viaja al API y al Excel. */
    por_pagar?: string;
    /** Gasto que se viene a VER desde Conciliación (27-oct-2026, `?gasto=`,
        `lib/admin/gasto-enfocado.ts`): primero y en ámbar. SOLO del panel. */
    gasto?: string;
  }>;
}) {
  const sp = await searchParams;
  const hoy = todayCancun();
  // Lectura y validación de la URL: la MISMA función que usa la barra de
  // filtros en el navegador (un filtro inválido se IGNORA: jamás viaja al API
  // ni provoca un 400 que tumbe la pantalla, 21-sep-2026).
  // Inicio oficial (16-oct-2026, API 0.0.84): un `?desde` anterior se sube con aviso.
  const inicio = await getInicioOficial();
  // Gastos por pagar (19-oct-2026, API 0.0.95): el filtro `?por_pagar=1`
  // SOLO con la capacidad (`config.gastos_por_pagar`; `/me` ya está cacheado
  // por el layout). Sin ella se ignora y se dice (un API previo daría 400).
  const porPagar = capacidadPorPagarDeMe(await getMe().catch(() => null));
  const filtros = filtroGastosDeUrl(
    sp as Record<string, string | undefined>,
    inicio,
    porPagar.habilitado,
  );
  const filtro = filtros.vista;
  const conFiltros = hayFiltrosGastos(filtros);
  // Filtro por avión (link desde el expediente del avión); lo respetan las
  // pestañas, el Excel y la barra.
  const aeronaveId = filtros.aeronave_id;
  const base = queryBaseGastos(filtros, hoy);

  // Los GASTOS son la llamada principal (no se degrada: una lista de dinero
  // vacía por un 502 llevaría a recapturar; si falla se dice con
  // TarjetaErrorCarga y la cabecera y los filtros siguen vivos). Los
  // contadores de pestaña y los catálogos de los selectores sí degradan, con
  // aviso (21-sep-2026).
  const degradado = new Degradaciones();
  const [lista, pendientesRes, duplicadosRes, totalPendientesRes, aircraftRes, providersRes, pilotsRes, me] =
    await Promise.all([
      // SIN cap (anti-cap-200): prod ya rebasó los 1,000 gastos y el corte
      // silencioso hacía parecer "no guardado" un gasto que sí existía.
      principal(listGastosAll(queryListaGastos(filtros, hoy))),
      degradado.opcional(
        "el contador de pendientes",
        listGastos({ ...base, pendientes: true, limit: 1 }),
        // `null` = no se sabe; la pestaña NO pinta "0" (sería «ya no hay
        // pendientes», justo lo contrario de lo que esta bandeja vigila).
        { count: null as number | null },
      ),
      degradado.opcional(
        "el contador de duplicados",
        listGastos({ ...base, duplicados: true, limit: 1 }),
        { count: null as number | null },
      ),
      // «Sugerir asignaciones» no mira los filtros (revisa los 15 pendientes
      // más recientes de la bandeja): con filtros puestos, su title lleva el
      // total GLOBAL (una lectura más, solo entonces).
      conFiltros
        ? degradado.opcional(
            ETIQUETA_TOTAL_PENDIENTES,
            listGastos({ pendientes: true, limit: 1 }),
            { count: null as number | null },
          )
        : Promise.resolve(null),
      degradado.opcional("las aeronaves", listAircraft({ limit: 100 }), {
        data: [] as Awaited<ReturnType<typeof listAircraft>>["data"],
      }),
      degradado.opcional("los proveedores", listProviders({ limit: 200 }), {
        data: [] as Awaited<ReturnType<typeof listProviders>>["data"],
      }),
      // Filtro "Capturó": TODO el personal activo — la oficina (Jimmy, Mary,
      // Itzi…) también captura gastos y con /pilots no aparecía (queja del
      // cliente, 24-ago). /users es solo ADMIN: si el rol no alcanza (403),
      // se cae a la lista de pilotos — mejor una lista corta que ninguna.
      degradado.opcional(
        "el personal que captura",
        listUsers({ estado: "ACTIVO", limit: 200 })
          .then((r) =>
            r.data
              .filter((u) => !u.es_piloto_externo) // externos jamás capturan (sin app)
              .map((u) => ({ id: u.id, nombre: u.nombre })),
          )
          .catch(() =>
            listPilots({ estado: "ACTIVO", limit: 200 }).then((r) =>
              r.data.map((u) => ({ id: u.id, nombre: u.nombre })),
            ),
          ),
        [] as { id: string; nombre: string }[],
      ),
      // Rol (de `/me`, ya cacheado por el layout): el menú ⋯ esconde lo que
      // el API le rechazaría. Si no llega, el menú no esconde nada.
      getMe().catch(() => null),
    ]);
  const personas = [...pilotsRes].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );
  const pendientesGlobal = conFiltros
    ? (totalPendientesRes?.count ?? null)
    : pendientesRes.count;

  // Con el combustible de cada avión: los diálogos prellenan y avisan (5-oct-2026).
  const aircraft = aircraftRes.data.map(avionCatalogoGasto);
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  const aeronaveFiltro = aeronaveId
    ? (aircraft.find((a) => a.id === aeronaveId)?.matricula ?? AVION_FILTRO_DESCONOCIDO)
    : null;

  // Filtros de oficina que TODO link interno conserva (pestañas y «quitar
  // avión»): agregar aquí cualquier filtro nuevo de la barra.
  const FILTROS_URL = [
    "medio",
    "piloto",
    "desde",
    "hasta",
    "facturacion",
    // Filtro «Banco» (9-oct-2026): faltaba aquí y las pestañas, la semana
    // de captura y «quitar avión» lo tiraban (13-oct-2026).
    "banco",
    "cap",
    "cap_desde",
    "cap_hasta",
    "orden",
    // Filtro «Categoría» (14-oct-2026, una sola tabla): al final, así las
    // URLs de antes se escriben igual.
    "categoria",
    // «Por pagar» (19-oct-2026): las pestañas y «quitar avión» lo conservan.
    "por_pagar",
  ] as const;
  const paramsFiltros = (key: VistaGastos, conAvion: boolean) => {
    const params = new URLSearchParams();
    if (key !== "todos") params.set("f", key);
    if (conAvion && aeronaveId) params.set("aeronave_id", aeronaveId);
    for (const k of FILTROS_URL) {
      // `?categoria=NOMINA` se IGNORA (la nómina vive en su módulo): ningún
      // enlace interno la arrastra (16-oct-2026).
      if (k === "categoria" && filtros.nominaIgnorada) continue;
      if (sp[k]) params.set(k, sp[k]);
    }
    return params;
  };
  const hrefCon = (params: URLSearchParams) => {
    const qs = params.toString();
    return qs ? `/admin/expenses?${qs}` : "/admin/expenses";
  };
  const hrefTab = (key: VistaGastos) => hrefCon(paramsFiltros(key, true));
  // Clave de la tabla: cambiar de pestaña o de filtro la REMONTA (página 1,
  // compras plegadas, sin fila activa); un refresh deja la misma clave.
  const claveVista = paramsFiltros(filtro, true).toString();

  const gastosLista = lista.ok ? lista.datos.data : [];
  // «Resolver →» del pre-cierre (15-oct-2026): los gastos que manda resolver
  // van PRIMERO (ANTES de la tabla: la compra de un pago resaltado sube con
  // él, porque la tabla agrupa por la primera aparición) y en ámbar.
  const foco = leerFocoPreCierre(sp);
  // «Ver el gasto con el que se concilió» (27-oct-2026): `?gasto=` trae ESE
  // gasto PRIMERO y en ámbar con la MISMA mecánica; si vienen los dos manda
  // el foco del pre-cierre (no se mezclan dos resaltados).
  const gastoEnfocado = foco ? null : leerGastoEnfocado(sp);
  const idsResaltados = foco ? foco.ids : gastoEnfocado ? [gastoEnfocado] : [];
  const conFoco =
    idsResaltados.length > 0
      ? filasResaltadasPrimero(gastosLista, idsResaltados, (g) => g.id)
      : { filas: gastosLista, encontrados: 0 };
  const gastos = conFoco.filas;
  // Corte defensivo del anti-cap (count cambió a media carga): avisar en vez
  // de dejar que un gasto "desaparezca" en silencio (auditoría 29-ago).
  const huboCorte = lista.ok && gastos.length < lista.datos.count;

  // Firma las fotos de los comprobantes (bucket privado). Si la firma falla
  // se DICE (aviso discreto y «Sin vista previa» en la fila), en vez de
  // dejar celdas vacías que parecen «sin comprobante».
  const fotoPaths = gastos.map((g) => g.foto_url).filter((p): p is string => !!p);
  const fotoUrls = fotoPaths.length
    ? await degradado.opcional(
        ETIQUETA_FOTOS_COMPROBANTES,
        signFuelPhotos(fotoPaths),
        {} as Record<string, string>,
      )
    : {};

  // Gastos que pueden marcarse para "Unir en compra" en ESTA vista (sueltos y
  // de categoría de compra: misma regla que la casilla). El provider poda la
  // selección a estos ids al cambiar de filtro/pestaña o tras borrar/ligar.
  const idsSeleccionables = gastos
    .filter((g) => !g.compra_id && esCategoriaCompra(g.categoria))
    .map((g) => g.id);

  const tabs: { key: VistaGastos; count?: number | null }[] = [
    { key: "todos" },
    { key: "pendientes", count: pendientesRes.count },
    { key: "duplicados", count: duplicadosRes.count },
  ];
  const vacio = vacioGastos(filtro, conFiltros, !!filtros.por_pagar);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-3xl">
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifica los gastos capturados: asigna avión, confirma comprobante y descarta
            duplicados. La bandeja de pendientes debe quedar siempre vacía.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExpenseCreateDialog aircraft={aircraft} providers={providers} varianteBoton="default" />
          <PistasDialog />
          <SuggestAssignmentsButton pendientes={pendientesGlobal} />
          <ExcelExportButton
            path="/v1/expenses/export"
            filename="gastos.xlsx"
            label="Exportar Excel"
            className="h-8"
            // A quien concilia (o rol desconocido) el API le agrega factura,
            // cargo del banco y estado de cuenta (pestaña «Cargos del banco»).
            title={tituloExcelGastos(me?.rol ?? null)}
            // El Excel sale con LOS MISMOS filtros que se ven en pantalla
            // (incluye el resumen de efectivos por persona y su facturado) y,
            // desde el 14-oct-2026, con la pestaña (Pendientes/Duplicados).
            query={queryExcelGastos(filtros, hoy)}
            // Un API ≤ 0.0.89 no conoce `excluir_categoria`: el Excel se
            // vuelve a pedir sin él (16-oct-2026).
            camposOpcionales={CAMPOS_OPCIONALES_GASTOS}
          />
        </div>
      </div>

      {/* Con la lista caída el modo «Unir en compra» no dice «no hay gastos
          que se puedan unir» ni poda lo marcado (no se sabe qué hay). */}
      <ExpensesSeleccionProvider idsVisibles={idsSeleccionables} cargaFallida={!lista.ok}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Vistas de gastos" className="flex flex-wrap gap-2">
              {tabs.map((t) => (
                <Link
                  key={t.key}
                  href={hrefTab(t.key)}
                  prefetch={false}
                  aria-current={filtro === t.key ? "page" : undefined}
                  title={tituloVistaGastos(t.key, t.count)}
                  className={cn(
                    "relative inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    filtro === t.key
                      ? "bg-brand-600 text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PESTANAS_GASTOS[t.key]}
                  {t.count != null && t.count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs tabular-nums",
                        filtro === t.key
                          ? "bg-white/20"
                          : "bg-amber-500/20 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                  {/* Gira en la esquina mientras llega la vista pulsada. */}
                  <IndicadorEnlace className="absolute -right-1 -top-1 bg-background text-muted-foreground" />
                </Link>
              ))}
            </nav>
            {aeronaveFiltro && (
              <Link
                // Quitar SOLO el avión: los demás filtros activos (pestaña,
                // categoría, medio, capturó, fechas, captura, orden,
                // facturación, banco) se conservan.
                href={hrefCon(paramsFiltros(filtro, false))}
                prefetch={false}
                title={TITULO_QUITAR_FILTRO_AVION}
                aria-label={ariaQuitarFiltroAvion(aeronaveFiltro)}
                className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-600/40 bg-brand-600/10 px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-600/20 dark:text-brand-400"
              >
                {ETIQUETA_CHIP_AVION} <span className="font-mono">{aeronaveFiltro}</span>
                <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <IndicadorEnlace className="absolute -right-1 -top-1 bg-background" />
              </Link>
            )}
            <div className="ml-auto">
              <UnirCompraToggle />
            </div>
          </div>

          <ExpensesFilterBar
            personas={personas}
            aviones={aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula, activa: a.activa }))}
          />
          <AvisoPeriodoAjustado inicio={inicio} ajustado={!!filtros.ajustado} />
          {filtros.nominaIgnorada && (
            <div
              role="status"
              data-franja="nomina-fuera-de-gastos"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-800 dark:text-sky-200"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{TITULO_NOMINA_FUERA_DE_GASTOS}</p>
                <p className="text-xs opacity-90">{DESCRIPCION_NOMINA_FUERA_DE_GASTOS}</p>
              </div>
              <Link
                href={hrefNominaDesdeGastos(filtros)}
                prefetch={false}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
              >
                {ETIQUETA_IR_A_NOMINA}
              </Link>
            </div>
          )}

          {/* «Por pagar» pedido por la URL sin la capacidad del API: se dice
              (jamás una lista «filtrada» que en realidad trae todo). */}
          {filtros.porPagarIgnorado && (
            <div
              role="status"
              data-franja="por-pagar-ignorado"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
            >
              <p className="font-medium">{TITULO_POR_PAGAR_IGNORADO}</p>
              <p className="text-xs opacity-90">{DESCRIPCION_POR_PAGAR_IGNORADO}</p>
            </div>
          )}

          {/* Catálogos/contadores/fotos que no cargaron: se dice en vez de pintar 0. */}
          <AvisoDegradado faltantes={degradado.faltantes} />

          {foco && (
            <FranjaPreCierre
              foco={foco}
              // Lista caída ⇒ no se sabe qué hay «en esta vista».
              encontrados={lista.ok ? conFoco.encontrados : null}
              hrefQuitar={hrefQuitarResaltado("/admin/expenses", sp)}
              hrefVolver={hrefVolverPreCierre(foco, hoy)}
              // Gastos por pagar: el detalle del API cuenta también la nómina
              // por pagar, que Gastos no enseña (se marca pagada en Nómina).
              notaVista={
                foco.clave === CLAVE_PRECIERRE_GASTOS_POR_PAGAR ? NOTA_VISTA_POR_PAGAR_GASTOS : undefined
              }
            />
          )}

          {gastoEnfocado && (
            <FranjaGastoEnfocado
              // Lista caída ⇒ no se sabe si está en esta vista.
              encontrado={lista.ok ? conFoco.encontrados > 0 : null}
              hrefQuitar={hrefQuitarGastoEnfocado(sp)}
            />
          )}

          {huboCorte && lista.ok && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
              <span>{textoCorteGastos(gastos.length, lista.datos.count)}</span>
            </div>
          )}

          {!lista.ok ? (
            // La lista NO cargó: jamás «Sin gastos» (sería mentir sobre dinero).
            <TarjetaErrorCarga
              titulo={TITULO_ERROR_LISTA_GASTOS}
              descripcion={DESCRIPCION_ERROR_LISTA_GASTOS}
            />
          ) : gastos.length === 0 ? (
            // Con lista vacía no se monta la tabla (evita «Sin resultados para “”»).
            <EmptyState icon={BanknotesIcon} title={vacio.titulo} description={vacio.descripcion}>
              {conFiltros && (
                <div className="mt-4 flex justify-center">
                  <Link
                    href={hrefQuitarFiltrosGastos(filtro, filtros.orden)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
                  >
                    {TEXTO_QUITAR_FILTROS_GASTOS}
                  </Link>
                </div>
              )}
            </EmptyState>
          ) : (
            <Card role="region" aria-label={ETIQUETA_LISTA_GASTOS} className="gap-0 py-0">
              <CardContent className="p-0">
                <ExpensesTable
                  key={claveVista}
                  gastos={gastos}
                  aircraft={aircraft}
                  providers={providers}
                  fotoUrls={fotoUrls}
                  huboCorte={huboCorte}
                  rol={me?.rol ?? null}
                  resaltados={idsResaltados.length > 0 ? idsResaltados : undefined}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </ExpensesSeleccionProvider>
    </div>
  );
}
