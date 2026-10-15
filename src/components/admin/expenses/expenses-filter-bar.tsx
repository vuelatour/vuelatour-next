"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { medioPagoLabel } from "@/lib/admin/medios-pago";
import { opcionesFacturacionFiltro } from "@/lib/admin/facturacion-estatus";
import { FILTRO_BANCO } from "@/lib/admin/conciliacion-estado";
import { CATEGORIAS_FILTRO_GASTO, opcionCategoriaGasto } from "@/lib/admin/categorias-gasto";
import { ESPERA_APLICAR_MS } from "@/lib/admin/periodo-selector";
import {
  borradoresVigentes,
  consultaBaseParaNavegar,
  pasoAlSalirCampoFecha,
  pasoCampoFecha,
  pendienteVigente,
  rangoAlCambiarCampo,
  valorVisibleCampoFecha,
  type BorradorCampoFecha,
  type CampoRangoLista,
  type ConsultaPendiente,
} from "@/lib/admin/quote-navegacion";
import {
  CLASE_FILTRO_ACTIVO,
  ETIQUETAS_FILTRO_GASTOS,
  ETIQUETA_FECHA_CAPTURA,
  ETIQUETA_FECHA_GASTO,
  OPCIONES_CAPTURA,
  OPCIONES_ORDEN_GASTOS,
  OPCION_TODAS,
  OPCION_TODOS,
  PISTA_BUSQUEDA_EXCEL,
  TEXTO_ACTUALIZANDO,
  TEXTO_LIMPIAR_FILTROS,
  TITULO_FECHA_CAPTURA,
  TITULO_FECHA_GASTO,
  TITULO_LIMPIAR_FILTROS,
  anchoFiltroCategoria,
  ariaCampoFecha,
  claveFiltrosUrl,
  hayFiltrosGastos,
  leerFiltrosGastos,
  opcionesAvionFiltroGastos,
  opcionesConTodos,
  rangoCapturaTrasNavegar,
  rangoCapturaTrasUrl,
  type ModoCaptura,
  type RangoCapturaAbierto,
} from "@/lib/admin/gastos-vista";

// Etiquetas desde la FUENTE ÚNICA (@/lib/admin/medios-pago); aquí solo vive
// el ORDEN del filtro. BODEGA queda fuera a propósito (cargo contable de
// inventario, no un pago que la oficina persiga). «Pago domiciliado»
// (13-oct-2026) va tras «Transferencia»; `?medio=DOMICILIADO` lo valida
// `leerFiltrosGastos` contra MEDIOS_CAPTURA_VALUES.
const MEDIOS = [
  "EFECTIVO",
  "TARJETA_CORP",
  "TRANSFERENCIA",
  "DOMICILIADO",
  "PAYWISE",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
].map((value) => ({ value, label: medioPagoLabel(value) }));

// Semáforo de facturación de oficina (FUENTE ÚNICA
// @/lib/admin/facturacion-estatus): 🔴 Pendiente → 🟡 Solicitada →
// 🟢 Facturada → ⚪ No requiere factura. "Sin facturar" agrupa pendiente +
// solicitada (lo que aún falta por resolver, en un solo filtro) y deja fuera
// ⚪ No requiere factura a propósito: ese no está por facturar.
const OPCIONES_MEDIO = opcionesConTodos(OPCION_TODOS, MEDIOS);
const OPCIONES_FACTURACION = opcionesConTodos(OPCION_TODAS, opcionesFacturacionFiltro());
const OPCIONES_BANCO = opcionesConTodos(OPCION_TODOS, [...FILTRO_BANCO]);
// Las 22 categorías con su destino en verde (como en la captura).
const OPCIONES_CATEGORIA = opcionesConTodos(
  OPCION_TODAS,
  CATEGORIAS_FILTRO_GASTO.map(opcionCategoriaGasto),
);
const OPCIONES_ORDEN = [...OPCIONES_ORDEN_GASTOS];

const CLASE_ETIQUETA = "mb-1 block text-[11px] font-medium text-muted-foreground";

type Cambios = Record<string, string | null>;
type Rango = { desde: string; hasta: string };

/**
 * BORRADOR de un rango de fechas de la barra (patrón de `quotes-filter-bar`,
 * 13-oct-2026): tecleando el año («0002-10-01») nada navega; solo una fecha
 * COMPLETA tras `ESPERA_APLICAR_MS`, o al salir del campo / Enter. Si el
 * extremo nuevo invierte el rango, el otro lo sigue (`rangoAlCambiarCampo`).
 * El borrador se guarda contra el valor de la URL con el que se escribió y
 * CADUCA en cuanto la URL del campo cambia (llegó la navegación, o Atrás /
 * «Quitar filtros» la movieron): ya no revive si la URL regresa a ese valor
 * (`borradoresVigentes`, revisión del 14-oct-2026). `extra` viaja en cada
 * navegación del rango (la captura apaga «Esta semana»: `cap: null`).
 */
function useRangoBorrador({
  claveDesde,
  claveHasta,
  deUrl,
  navegar,
  rangoParaNavegar,
  extra,
}: {
  claveDesde: string;
  claveHasta: string;
  deUrl: Rango;
  navegar: (cambios: Cambios) => void;
  /** El rango sobre el que se cambia un extremo: el de la última consulta PEDIDA. */
  rangoParaNavegar: () => Rango;
  extra?: Cambios;
}) {
  const [borradores, setBorradores] = useState<Record<CampoRangoLista, BorradorCampoFecha | null>>({
    desde: null,
    hasta: null,
  });
  // Un borrador cuya URL ya cambió no vuelve a valer: se suelta aquí mismo
  // (ajuste en el render, guardado: devuelve el mismo objeto si nada caducó).
  const vigentes = borradoresVigentes(borradores, deUrl);
  if (vigentes !== borradores) setBorradores(vigentes);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarEspera = useCallback(() => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);
  useEffect(() => cancelarEspera, [cancelarEspera]);

  const visible: Rango = {
    desde: valorVisibleCampoFecha(deUrl.desde, borradores.desde),
    hasta: valorVisibleCampoFecha(deUrl.hasta, borradores.hasta),
  };

  const guardarBorrador = (campo: CampoRangoLista, valor: string | null) =>
    setBorradores((b) => ({
      ...b,
      [campo]: valor === null ? null : { base: deUrl[campo], valor },
    }));

  /** Navega con el rango que resulta de cambiar UN extremo. */
  const aplicar = (campo: CampoRangoLista, valor: string) => {
    cancelarEspera();
    const base = rangoParaNavegar();
    const nuevo = rangoAlCambiarCampo(
      { desde: base.desde || undefined, hasta: base.hasta || undefined },
      campo,
      valor,
    );
    setBorradores({
      desde: { base: deUrl.desde, valor: nuevo.desde ?? "" },
      hasta: { base: deUrl.hasta, valor: nuevo.hasta ?? "" },
    });
    navegar({ [claveDesde]: nuevo.desde ?? null, [claveHasta]: nuevo.hasta ?? null, ...extra });
  };

  const onCambio = (campo: CampoRangoLista, valor: string) => {
    cancelarEspera();
    const paso = pasoCampoFecha(valor);
    guardarBorrador(campo, valor);
    if (paso.tipo === "aplicar") {
      temporizador.current = setTimeout(() => aplicar(campo, paso.valor), ESPERA_APLICAR_MS);
    }
  };

  const onSalir = (campo: CampoRangoLista) => {
    const paso = pasoAlSalirCampoFecha(visible[campo], deUrl[campo]);
    if (paso.tipo === "aplicar") {
      aplicar(campo, paso.valor);
      return;
    }
    cancelarEspera();
    if (paso.tipo === "limpiar") {
      guardarBorrador(campo, "");
      navegar({ [campo === "desde" ? claveDesde : claveHasta]: null, ...extra });
      return;
    }
    guardarBorrador(campo, null); // incompleto o igual a la URL: vuelve lo de la URL
  };

  /** Suelta los borradores (al limpiar los filtros). */
  const soltar = () => {
    cancelarEspera();
    setBorradores({ desde: null, hasta: null });
  };

  return { visible, onCambio, onSalir, soltar };
}

/** Día `YYYY-MM-DD` de un filtro de fecha (la URL admite un ISO completo). */
const diaDe = (v: string | null | undefined): string => (v ? v.slice(0, 10) : "");

/**
 * Filtros de Gastos (14-oct-2026, vista de una sola tabla). Van por la URL
 * (la página es un Server Component) y el «Exportar Excel» hereda LOS MISMOS
 * filtros más la pestaña. Reglas de la barra:
 *  - LEE la URL VIVA (`useSearchParams`) y la valida con la MISMA función
 *    del servidor (`leerFiltrosGastos`): nunca `useState(propDelServer)`.
 *  - Cada campo con su `<Label htmlFor>` y «Todos/Todas» para quitar un
 *    filtro suelto; un filtro con valor lleva la marca `CLASE_FILTRO_ACTIVO`.
 *  - Dos ejes de fecha que no se mezclan: la del GASTO (`desde`/`hasta`) y la
 *    de CAPTURA («Todas · Esta semana · Rango…»: `cap=7d` o
 *    `cap_desde`/`cap_hasta`, día Cancún; un rango apaga la semana). Las dos
 *    con BORRADOR (`useRangoBorrador`).
 *  - Navegar: sobre la última consulta PEDIDA mientras la URL no se mueva
 *    (`consultaBaseParaNavegar`: dos cambios seguidos no se pisan), SIEMPRE
 *    a la página 1 (`tp` fuera; la búsqueda `tq` se conserva), en una
 *    transición («Actualizando…») y sin brincar al inicio (`scroll: false`).
 */
export function ExpensesFilterBar({
  personas,
  aviones,
}: {
  personas: { id: string; nombre: string }[];
  aviones: { id: string; matricula: string; activa?: boolean }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const f = leerFiltrosGastos((k) => sp.get(k));
  const [actualizando, startTransition] = useTransition();
  // La última consulta PEDIDA (UNA para toda la barra): mientras la
  // navegación está en vuelo `sp` sigue siendo la URL ANTERIOR. Caduca en
  // cuanto la URL viva deja su base (revisión del 14-oct-2026): si no, un
  // regreso por FUERA de la barra (chip ✕, «Quitar filtros», Atrás) la
  // revivía y el siguiente filtro perdía el clic o traía de vuelta uno quitado.
  const pendiente = useRef<ConsultaPendiente | null>(null);
  useEffect(() => {
    pendiente.current = pendienteVigente(sp.toString(), pendiente.current);
  }, [sp]);
  // «Rango…» pulsado sin fechas todavía (solo UI: la URL no lo dice). Vive
  // mientras la URL sea donde se abrió o la que pidió la barra; cualquier
  // otra navegación lo cierra (`rangoCapturaTrasUrl`).
  const clave = claveFiltrosUrl(sp.toString());
  const [rangoCapturaAbierto, setRangoCapturaAbierto] = useState<RangoCapturaAbierto | null>(null);
  const rangoVigente = rangoCapturaTrasUrl(rangoCapturaAbierto, clave);
  if (rangoVigente !== rangoCapturaAbierto) setRangoCapturaAbierto(rangoVigente);

  const paramsParaNavegar = useCallback(
    () => new URLSearchParams(consultaBaseParaNavegar(sp.toString(), pendiente.current)),
    [sp],
  );

  const navegar = useCallback(
    (cambios: Cambios) => {
      const viva = sp.toString();
      const params = paramsParaNavegar();
      const antes = new URLSearchParams(params);
      antes.delete("tp");
      for (const [k, v] of Object.entries(cambios)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      // Filtrar = de vuelta a la página 1 (la búsqueda de la tabla se queda).
      params.delete("tp");
      const qs = params.toString();
      // Nada cambió respecto de la última consulta pedida (o de la URL viva):
      // no se navega (la tabla tampoco pierde su página).
      if (qs === antes.toString()) return;
      pendiente.current = { base: viva, consulta: qs };
      // Un «Rango…» abierto sigue abierto al llegar ESTA navegación.
      setRangoCapturaAbierto((r) => rangoCapturaTrasNavegar(r, claveFiltrosUrl(qs)));
      startTransition(() => {
        router.push(qs ? `/admin/expenses?${qs}` : "/admin/expenses", { scroll: false });
      });
    },
    [sp, paramsParaNavegar, router, setRangoCapturaAbierto],
  );

  const rangoGasto = useRangoBorrador({
    claveDesde: "desde",
    claveHasta: "hasta",
    deUrl: { desde: diaDe(f.desde), hasta: diaDe(f.hasta) },
    navegar,
    rangoParaNavegar: () => {
      const p = paramsParaNavegar();
      const base = leerFiltrosGastos((k) => p.get(k));
      return { desde: diaDe(base.desde), hasta: diaDe(base.hasta) };
    },
  });
  const rangoCaptura = useRangoBorrador({
    claveDesde: "cap_desde",
    claveHasta: "cap_hasta",
    deUrl: { desde: f.cap_desde ?? "", hasta: f.cap_hasta ?? "" },
    navegar,
    rangoParaNavegar: () => {
      const p = paramsParaNavegar();
      const base = leerFiltrosGastos((k) => p.get(k));
      return { desde: base.cap_desde ?? "", hasta: base.cap_hasta ?? "" };
    },
    // Un rango de captura apaga «Esta semana» (mismo eje).
    extra: { cap: null },
  });

  const modoCaptura: ModoCaptura =
    f.captura === "todas" && rangoVigente !== null ? "rango" : f.captura;

  const elegirCaptura = (modo: ModoCaptura) => {
    if (modo === "rango") {
      setRangoCapturaAbierto({ vista: clave, esperada: null });
      if (f.captura === "semana") navegar({ cap: null });
      return;
    }
    setRangoCapturaAbierto(null);
    rangoCaptura.soltar();
    navegar(
      modo === "semana"
        ? { cap: "7d", cap_desde: null, cap_hasta: null }
        : { cap: null, cap_desde: null, cap_hasta: null },
    );
  };

  const limpiar = () => {
    rangoGasto.soltar();
    rangoCaptura.soltar();
    setRangoCapturaAbierto(null);
    navegar({
      aeronave_id: null,
      categoria: null,
      medio: null,
      piloto: null,
      desde: null,
      hasta: null,
      facturacion: null,
      banco: null,
      cap: null,
      cap_desde: null,
      cap_hasta: null,
    });
  };

  const opcionesAvion = opcionesAvionFiltroGastos(aviones, f.aeronave_id);
  const opcionesPersonas = opcionesConTodos(
    OPCION_TODOS,
    personas.map((p) => ({ value: p.id, label: p.nombre })),
  );
  const tq = (sp.get("tq") ?? "").trim();

  /** Un selector de la barra: etiqueta ligada, «Todos/Todas» y marca de activo. */
  const selector = (o: {
    campo: string;
    etiqueta: string;
    ancho: string;
    opciones: { value: string; label: string; description?: string; descriptionClassName?: string }[];
    valor: string;
    param: string;
    /** Valor elegido ⇒ valor de la URL (null = quitar el parámetro). */
    aUrl?: (v: string) => string | null;
    /** false = no es un filtro (el orden): sin marca de activo. */
    marcar?: boolean;
  }) => (
    <div className={cn("min-w-0", o.ancho)}>
      <Label htmlFor={`gasto-filtro-${o.campo}`} className={CLASE_ETIQUETA}>
        {o.etiqueta}
      </Label>
      <SearchableSelect
        id={`gasto-filtro-${o.campo}`}
        options={o.opciones}
        value={o.valor}
        onChange={(v) => navegar({ [o.param]: o.aUrl ? o.aUrl(v) : v || null })}
        placeholder={o.opciones[0]?.label}
        className={o.marcar !== false && o.valor ? CLASE_FILTRO_ACTIVO : undefined}
      />
    </div>
  );

  const campoFecha = (
    rango: ReturnType<typeof useRangoBorrador>,
    campo: CampoRangoLista,
    id: string,
    etiqueta: string,
    titulo: string,
  ) => (
    <Input
      id={id}
      type="date"
      value={rango.visible[campo]}
      aria-label={ariaCampoFecha(etiqueta, campo)}
      title={titulo}
      // En teléfono los dos extremos se reparten la fila; desde sm, 8.5rem.
      className={cn(
        "h-9 min-w-0 flex-1 cursor-pointer sm:w-[8.5rem] sm:flex-none",
        rango.visible[campo] && CLASE_FILTRO_ACTIVO,
      )}
      onChange={(e) => rango.onCambio(campo, e.target.value)}
      onBlur={() => rango.onSalir(campo)}
      onKeyDown={(e) => {
        if (e.key === "Enter") rango.onSalir(campo);
      }}
    />
  );

  return (
    <div
      role="group"
      aria-label="Filtros de gastos"
      className="grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-wrap sm:items-end"
    >
      {/* Fecha del GASTO (la del ticket). */}
      <div className="col-span-2 min-w-0">
        <span id="gasto-filtro-fecha" className={CLASE_ETIQUETA}>
          {ETIQUETA_FECHA_GASTO}
        </span>
        <div
          role="group"
          aria-labelledby="gasto-filtro-fecha"
          className="flex items-center gap-1.5"
        >
          {campoFecha(rangoGasto, "desde", "gasto-filtro-desde", ETIQUETA_FECHA_GASTO, TITULO_FECHA_GASTO)}
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          {campoFecha(rangoGasto, "hasta", "gasto-filtro-hasta", ETIQUETA_FECHA_GASTO, TITULO_FECHA_GASTO)}
        </div>
      </div>
      {selector({
        campo: "categoria",
        etiqueta: ETIQUETAS_FILTRO_GASTOS.categoria,
        // Con una etiqueta larga elegida («Comisión del vendedor (avión)»)
        // crece: si no, las dos comisiones se veían iguales.
        ancho: anchoFiltroCategoria(f.categoria),
        opciones: OPCIONES_CATEGORIA,
        valor: f.categoria ?? "",
        param: "categoria",
      })}
      {selector({
        campo: "avion",
        etiqueta: ETIQUETAS_FILTRO_GASTOS.avion,
        ancho: "sm:w-36",
        opciones: opcionesAvion,
        valor: f.aeronave_id ?? "",
        param: "aeronave_id",
      })}
      {selector({
        campo: "facturacion",
        etiqueta: ETIQUETAS_FILTRO_GASTOS.facturacion,
        ancho: "sm:w-44",
        opciones: OPCIONES_FACTURACION,
        valor: f.facturacion ?? "",
        param: "facturacion",
      })}
      {selector({
        campo: "banco",
        etiqueta: ETIQUETAS_FILTRO_GASTOS.banco,
        ancho: "sm:w-36",
        opciones: OPCIONES_BANCO,
        valor: f.banco ?? "",
        param: "banco",
      })}
      {selector({
        campo: "medio",
        etiqueta: ETIQUETAS_FILTRO_GASTOS.medio,
        ancho: "sm:w-40",
        opciones: OPCIONES_MEDIO,
        valor: f.medio ?? "",
        param: "medio",
      })}
      {selector({
        campo: "capturo",
        etiqueta: ETIQUETAS_FILTRO_GASTOS.capturo,
        ancho: "sm:w-44",
        opciones: opcionesPersonas,
        valor: f.piloto ?? "",
        param: "piloto",
      })}

      {/* Fecha de CAPTURA: cuándo se cargó a la app/panel (día Cancún). */}
      <div className="col-span-2 min-w-0">
        <span id="gasto-filtro-captura" className={CLASE_ETIQUETA}>
          {ETIQUETA_FECHA_CAPTURA}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* h-9 como los selectores: así su etiqueta queda a la misma altura. */}
          <div
            role="group"
            aria-labelledby="gasto-filtro-captura"
            className="flex h-9 items-center gap-1"
          >
            {OPCIONES_CAPTURA.map((o) => {
              const activo = modoCaptura === o.valor;
              return (
                <button
                  key={o.valor}
                  type="button"
                  aria-pressed={activo}
                  title={o.titulo}
                  data-captura={o.valor}
                  onClick={() => elegirCaptura(o.valor)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activo
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.etiqueta}
                </button>
              );
            })}
          </div>
          {modoCaptura === "rango" && (
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              {campoFecha(
                rangoCaptura,
                "desde",
                "gasto-filtro-cap-desde",
                ETIQUETA_FECHA_CAPTURA,
                TITULO_FECHA_CAPTURA,
              )}
              <span aria-hidden="true" className="text-muted-foreground">
                –
              </span>
              {campoFecha(
                rangoCaptura,
                "hasta",
                "gasto-filtro-cap-hasta",
                ETIQUETA_FECHA_CAPTURA,
                TITULO_FECHA_CAPTURA,
              )}
            </div>
          )}
        </div>
      </div>

      {/* Orden del listado (lo aplica el API y el Excel sale igual). No es un filtro. */}
      {selector({
        campo: "orden",
        etiqueta: ETIQUETAS_FILTRO_GASTOS.orden,
        // w-44: «Fecha de captura» entra completo (con w-40 se cortaba).
        ancho: "sm:w-44",
        opciones: OPCIONES_ORDEN,
        valor: f.orden ?? "fecha",
        param: "orden",
        // «Fecha del gasto» es el default del API: no se escribe en la URL.
        aUrl: (v) => (v === "captura" ? "captura" : null),
        marcar: false,
      })}

      {hayFiltrosGastos(f) && (
        <div className="flex items-end">
          <button
            type="button"
            onClick={limpiar}
            title={TITULO_LIMPIAR_FILTROS}
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {TEXTO_LIMPIAR_FILTROS}
          </button>
        </div>
      )}

      {/* Siempre montado: el lector anuncia el cambio. En teléfono no
          reserva alto (sería un hueco de 36 px bajo los filtros). */}
      <span
        role="status"
        className="col-span-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground sm:h-9"
      >
        {actualizando && (
          <>
            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {TEXTO_ACTUALIZANDO}
          </>
        )}
      </span>

      {tq && <p className="col-span-2 text-[11px] text-muted-foreground sm:w-full">{PISTA_BUSQUEDA_EXCEL}</p>}
    </div>
  );
}
