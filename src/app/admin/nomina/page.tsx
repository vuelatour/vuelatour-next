import type { Metadata } from "next";
import { TITULOS_SECCION } from "@/lib/admin/titulos-pestana";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExclamationTriangleIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExpensesTable } from "@/components/admin/expenses/expenses-table";
import { ExpenseCreateDialog } from "@/components/admin/expenses/expense-create-dialog";
import { GastosPersonalesFilterBar } from "@/components/admin/expenses/gastos-personales-filter-bar";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { EmptyState } from "@/components/admin/empty-state";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { NominaResumen } from "@/components/admin/nomina/nomina-resumen";
import { listGastosAll, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { getMe } from "@/lib/api/me";
import { Degradaciones, principal } from "@/lib/api/degradar";
import { todayCancun } from "@/lib/datetime";
import { avionCatalogoGasto } from "@/lib/admin/combustibles";
import { tituloExcelGastos } from "@/lib/admin/gasto-banco";
import { ETIQUETA_FOTOS_COMPROBANTES, textoCorteGastos } from "@/lib/admin/gastos-vista";
import {
  AYUDA_CAPTURA_NOMINA,
  CATEGORIA_NOMINA,
  DESCRIPCION_ERROR_NOMINA,
  DESCRIPCION_LISTA_NOMINA,
  DESCRIPCION_NOMINA,
  DESCRIPCION_VACIO_NOMINA,
  ETIQUETA_LISTA_NOMINA,
  ETIQUETA_NAV_MESES_NOMINA,
  ETIQUETA_REGISTRAR_NOMINA,
  ETIQUETA_VER_EN_GASTOS,
  TITULO_ERROR_NOMINA,
  TITULO_NOMINA,
  avisoResumenIncompleto,
  esMesFuturoNomina,
  esMesNomina,
  etiquetaMesNomina,
  hrefGastosNomina,
  hrefMesNomina,
  mesNominaDeUrl,
  mesesVecinos,
  nombreExcelNomina,
  puedeVerNomina,
  queryExcelNomina,
  rangoMesNomina,
  resumenNomina,
  tituloIrAMesNomina,
  tituloListaNomina,
  tituloVacioNomina,
  tituloVerEnGastos,
} from "@/lib/admin/nomina";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: TITULOS_SECCION.nomina };

/** Clase de los enlaces «‹ mes» / «mes ›»: a la altura del campo «Mes» (h-8). */
const CLASE_ENLACE_MES = cn(buttonVariants({ variant: "outline" }), "cursor-pointer");

/**
 * Nómina: un espacio propio (15-oct-2026). Pedido del cliente: «Necesitamos un
 * nuevo espacio debajo de Gastos y Otros Gastos que se llame Nomina para tener
 * en ese apartado todo lo de nomina».
 *
 * Fase 1, solo panel: TODOS los gastos de categoría «Nómina» del mes (eje
 * `fecha_gasto` = la fecha del PAGO), su resumen por quincena y por medio de
 * pago, la MISMA tabla de Gastos (cada pago con todo su menú ⋯), el alta
 * rápida y el Excel. Reglas y textos en `lib/admin/nomina.ts`. La carga copia
 * el patrón de `/admin/expenses`: la lista es la llamada PRINCIPAL (si falla,
 * `TarjetaErrorCarga` con la cabecera y el mes vivos; jamás «Sin pagos») y los
 * catálogos del alta y la firma de las fotos degradan con aviso.
 */
export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[] }>;
}) {
  // Sueldos = dato sensible: sin `/me` (o con otro rol) la pantalla no existe.
  // Falla CERRADO, como Gastos personales.
  const me = await getMe().catch(() => null);
  if (!puedeVerNomina(me?.rol)) notFound();

  const sp = await searchParams;
  const hoy = todayCancun();
  // `?mes=` inválido se IGNORA (mes de hoy en Cancún): nunca un 400 ni un throw.
  const mes = mesNominaDeUrl(sp.mes, hoy);
  const { desde, hasta } = rangoMesNomina(mes);
  const { anterior, siguiente } = mesesVecinos(mes);

  const degradado = new Degradaciones();
  const [lista, aircraftRes, providersRes] = await Promise.all([
    // SIN cap (anti-cap-200): pagina hasta cubrir `count`.
    principal(listGastosAll({ categoria: CATEGORIA_NOMINA, desde, hasta })),
    // Catálogos del alta (con el combustible de cada avión, como en Gastos).
    degradado.opcional("las aeronaves", listAircraft({ limit: 100 }), {
      data: [] as Awaited<ReturnType<typeof listAircraft>>["data"],
    }),
    degradado.opcional("los proveedores", listProviders({ limit: 200 }), {
      data: [] as Awaited<ReturnType<typeof listProviders>>["data"],
    }),
  ]);
  const aircraft = aircraftRes.data.map(avionCatalogoGasto);
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  const gastos = lista.ok ? lista.datos.data : [];
  // Corte defensivo del anti-cap (count cambió a media carga): se avisa.
  const huboCorte = lista.ok && gastos.length < lista.datos.count;

  // Comprobantes en bucket privado: si la firma falla se DICE (aviso y «Sin
  // vista previa» en la fila), nunca celdas vacías que parecen «sin papel».
  const fotoPaths = gastos.map((g) => g.foto_url).filter((p): p is string => !!p);
  const fotoUrls = fotoPaths.length
    ? await degradado.opcional(
        ETIQUETA_FOTOS_COMPROBANTES,
        signFuelPhotos(fotoPaths),
        {} as Record<string, string>,
      )
    : {};

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-3xl">
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{TITULO_NOMINA}</h1>
          <p className="text-sm text-muted-foreground mt-1">{DESCRIPCION_NOMINA}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExpenseCreateDialog
            aircraft={aircraft}
            providers={providers}
            defaultCategoria={CATEGORIA_NOMINA}
            varianteBoton="default"
            etiquetaBoton={ETIQUETA_REGISTRAR_NOMINA}
            titulo={ETIQUETA_REGISTRAR_NOMINA}
            contexto={AYUDA_CAPTURA_NOMINA}
          />
          <ExcelExportButton
            path="/v1/expenses/export"
            filename={nombreExcelNomina(mes)}
            label="Exportar Excel"
            className="h-8"
            // A quien concilia (o rol desconocido) el API le agrega factura,
            // cargo del banco y estado de cuenta (pestaña «Cargos del banco»).
            title={tituloExcelGastos(me?.rol ?? null)}
            // El Excel de Gastos con la categoría y el mes de la pantalla.
            query={queryExcelNomina(mes)}
          />
          <Link
            href={hrefGastosNomina(mes)}
            prefetch={false}
            title={tituloVerEnGastos(mes)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 cursor-pointer")}
          >
            {ETIQUETA_VER_EN_GASTOS}
          </Link>
        </div>
      </div>

      {/* El mes: el selector de Gastos personales (genérico: `usePathname` y
          `?mes=`) entre «‹ anterior» y «siguiente ›»; hacia el futuro no. */}
      <nav aria-label={ETIQUETA_NAV_MESES_NOMINA} className="flex flex-wrap items-end gap-2">
        {esMesNomina(anterior) && (
          <Link
            href={hrefMesNomina(anterior)}
            prefetch={false}
            aria-label={tituloIrAMesNomina(anterior)}
            title={tituloIrAMesNomina(anterior)}
            className={CLASE_ENLACE_MES}
          >
            <span aria-hidden="true">‹</span> {etiquetaMesNomina(anterior)}
          </Link>
        )}
        <GastosPersonalesFilterBar mes={mes} />
        {!esMesFuturoNomina(siguiente, hoy) && (
          <Link
            href={hrefMesNomina(siguiente)}
            prefetch={false}
            aria-label={tituloIrAMesNomina(siguiente)}
            title={tituloIrAMesNomina(siguiente)}
            className={CLASE_ENLACE_MES}
          >
            {etiquetaMesNomina(siguiente)} <span aria-hidden="true">›</span>
          </Link>
        )}
      </nav>

      {/* Catálogos o fotos que no cargaron: se dice en vez de pintar vacío. */}
      <AvisoDegradado faltantes={degradado.faltantes} />

      {huboCorte && lista.ok && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>{textoCorteGastos(gastos.length, lista.datos.count)}</span>
        </div>
      )}

      {!lista.ok ? (
        // La lista NO cargó: jamás «Sin pagos» ni un resumen en ceros.
        <TarjetaErrorCarga titulo={TITULO_ERROR_NOMINA} descripcion={DESCRIPCION_ERROR_NOMINA} />
      ) : gastos.length === 0 ? (
        // Con lista vacía no se monta la tabla (evita «Sin resultados para “”»).
        <EmptyState
          icon={UserGroupIcon}
          title={tituloVacioNomina(mes)}
          description={DESCRIPCION_VACIO_NOMINA}
        />
      ) : (
        <>
          <NominaResumen
            mes={mes}
            resumen={resumenNomina(gastos)}
            aviso={huboCorte ? avisoResumenIncompleto(gastos.length, lista.datos.count) : null}
          />
          <Card role="region" aria-label={ETIQUETA_LISTA_NOMINA} className="gap-3 pb-0">
            <CardHeader>
              <CardTitle>
                {tituloListaNomina(mes)}{" "}
                <span className="text-sm font-normal text-muted-foreground">({gastos.length})</span>
              </CardTitle>
              <CardDescription>{DESCRIPCION_LISTA_NOMINA}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* La MISMA tabla de Gastos: cada pago con «Verificar / editar»,
                  «Repartir entre aviones», «Eliminar» (con confirmación),
                  comprobante, facturación y banco. Sin el proveedor de «Unir
                  en compra»: NOMINA no es categoría de compra y la tabla
                  funciona sin él (`useSeleccionGastos` ⇒ null). La clave
                  remonta la tabla al cambiar de mes (página 1, sin fila
                  activa); un refresh deja la misma. */}
              <ExpensesTable
                key={mes}
                gastos={gastos}
                aircraft={aircraft}
                providers={providers}
                fotoUrls={fotoUrls}
                huboCorte={huboCorte}
                rol={me?.rol ?? null}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
