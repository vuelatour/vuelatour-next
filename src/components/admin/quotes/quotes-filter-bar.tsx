"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ESPERA_APLICAR_MS } from "@/lib/admin/periodo-selector";
import { PLACEHOLDER_BARRA_COTIZACIONES } from "@/lib/admin/clave-cliente";
import {
  ETIQUETA_GRUPO_FECHAS,
  TITULO_FECHA_VUELO,
  borradoresVigentes,
  consultaBaseParaNavegar,
  hayRangoLista,
  notaRangoCotizaciones,
  pasoAlSalirCampoFecha,
  pasoCampoFecha,
  pendienteVigente,
  periodosRapidosCotizaciones,
  rangoAlCambiarCampo,
  rangoListaCotizaciones,
  valorVisibleCampoFecha,
  type BorradorCampoFecha,
  type CampoRangoLista,
  type ConsultaPendiente,
} from "@/lib/admin/quote-navegacion";
import { cn } from "@/lib/utils";
import type { EstadoVuelo } from "@/types/quotes-persisted";

const ESTADOS: { value: EstadoVuelo | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "RESERVA", label: "Reserva tentativa" },
  { value: "SOLICITUD", label: "Solicitud" },
  { value: "COTIZADO", label: "Cotizado" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "EN_VUELO", label: "En vuelo" },
  { value: "COMPLETADO", label: "Completado" },
  { value: "CANCELADO", label: "Cancelado" },
];

interface QuotesFilterBarProps {
  clients: { id: string; nombre: string }[];
  initial: { estado: string; cliente_id: string; q: string };
  /**
   * Hoy en Cancún (`todayCancun()` del servidor, 13-oct-2026): con ella se
   * monta el bloque «Desde / Hasta» de la fecha del vuelo con sus periodos
   * rápidos. SIN ella el marcado es byte a byte el de antes.
   */
  hoy?: string;
  /**
   * El API previo rechazó `desde`/`hasta` y la página releyó sin rango: la
   * nota bajo la barra dice «Sin periodo» (el banner ámbar lo pinta la
   * página, una sola voz).
   */
  rangoIgnorado?: boolean;
}

/**
 * Barra de filtros de la lista de cotizaciones. El RANGO de fechas se LEE de
 * la URL viva con la MISMA función del servidor (`rangoListaCotizaciones`;
 * regla de las tablas: nunca `useState(propDelServer)`, al volver del detalle
 * Next reusa el payload viejo). Los campos de fecha guardan un BORRADOR
 * (patrón de `PeriodSelector`, 12-oct-2026): tecleando el año («0002-10-01»)
 * nada navega; solo una fecha COMPLETA, tras `ESPERA_APLICAR_MS` o al salir
 * del campo / Enter. Si el extremo nuevo invierte el rango, el otro lo
 * sigue (`rangoAlCambiarCampo`, la regla del selector de Reportes).
 */
export function QuotesFilterBar({
  clients,
  initial,
  hoy,
  rangoIgnorado = false,
}: QuotesFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // La última consulta PEDIDA (revisión 13-oct-2026): mientras la navegación
  // está en vuelo `params` sigue siendo la URL ANTERIOR, y dos cambios dentro
  // de esa latencia (Desde + Enter, Tab, Hasta) se armaban sobre la URL vieja
  // y el segundo pisaba al primero. Un ref y no estado: lo leen los handlers
  // (también el temporizador de `onCambio`) y no cambia lo que se pinta —lo
  // que se VE sigue saliendo de la URL viva y de los borradores.
  const pendiente = useRef<ConsultaPendiente | null>(null);
  // Caduca en cuanto la URL viva deja su base (revisión del 14-oct-2026): un
  // regreso por FUERA de la barra (Atrás, «Limpiar» del vacío) ya no la revive.
  useEffect(() => {
    pendiente.current = pendienteVigente(params.toString(), pendiente.current);
  }, [params]);
  /** Los parámetros sobre los que se arma la siguiente navegación (`consultaBaseParaNavegar`). */
  const paramsParaNavegar = useCallback(
    () => new URLSearchParams(consultaBaseParaNavegar(params.toString(), pendiente.current)),
    [params],
  );

  const pushQuery = useCallback(
    (next: Record<string, string>) => {
      const viva = params.toString();
      const sp = paramsParaNavegar();
      for (const [k, v] of Object.entries(next)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      const qs = sp.toString();
      // La misma consulta ya está pedida y la URL no se ha movido: nada que navegar.
      if (pendiente.current?.base === viva && pendiente.current.consulta === qs) return;
      pendiente.current = { base: viva, consulta: qs };
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, paramsParaNavegar, pathname, router],
  );

  // El rango de la URL VIVA, validado igual que en el servidor.
  const rango = rangoListaCotizaciones(params.get("desde"), params.get("hasta"));
  const deUrl: Record<CampoRangoLista, string> = {
    desde: rango.desde ?? "",
    hasta: rango.hasta ?? "",
  };

  // Borrador por campo, guardado contra el valor de la URL con el que se
  // escribió: cuando la URL cambia (la navegación llegó) caduca solo.
  const [borradores, setBorradores] = useState<
    Record<CampoRangoLista, BorradorCampoFecha | null>
  >({ desde: null, hasta: null });
  // Un borrador cuya URL ya cambió no revive si la URL regresa a ese valor
  // (revisión del 14-oct-2026; ajuste en el render, guardado).
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

  const visible: Record<CampoRangoLista, string> = {
    desde: valorVisibleCampoFecha(deUrl.desde, borradores.desde),
    hasta: valorVisibleCampoFecha(deUrl.hasta, borradores.hasta),
  };

  const guardarBorrador = (campo: CampoRangoLista, valor: string | null) =>
    setBorradores((b) => ({
      ...b,
      [campo]: valor === null ? null : { base: deUrl[campo], valor },
    }));

  /** Navega con el rango que resulta de cambiar UN extremo (el otro lo sigue si queda invertido). */
  const aplicar = (campo: CampoRangoLista, valor: string) => {
    cancelarEspera();
    // El rango sobre el que se cambia un extremo es el de la última consulta
    // PEDIDA mientras la URL no se mueva (no el de la URL vieja): así «Desde =
    // 20» + Enter y enseguida «Hasta = 31» terminan en 20–31, no en 01–31.
    const sp = paramsParaNavegar();
    const nuevo = rangoAlCambiarCampo(
      rangoListaCotizaciones(sp.get("desde"), sp.get("hasta")),
      campo,
      valor,
    );
    setBorradores({
      desde: { base: deUrl.desde, valor: nuevo.desde ?? "" },
      hasta: { base: deUrl.hasta, valor: nuevo.hasta ?? "" },
    });
    pushQuery({ desde: nuevo.desde ?? "", hasta: nuevo.hasta ?? "" });
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
      pushQuery({ [campo]: "" });
      return;
    }
    guardarBorrador(campo, null); // incompleto o igual a la URL: vuelve lo de la URL
  };

  const irAPeriodo = (desde: string, hasta: string) => {
    cancelarEspera();
    setBorradores({
      desde: { base: deUrl.desde, valor: desde },
      hasta: { base: deUrl.hasta, valor: hasta },
    });
    pushQuery({ desde, hasta });
  };

  const limpiarTodo = () => {
    cancelarEspera();
    setBorradores({ desde: null, hasta: null });
    pushQuery({ estado: "", cliente_id: "", q: "", desde: "", hasta: "" });
  };

  const hasFilters =
    !!(initial.estado || initial.cliente_id || initial.q) || hayRangoLista(rango);

  const campoFecha = (campo: CampoRangoLista, etiqueta: string) => (
    <div>
      <Label htmlFor={`cot-${campo}`} className="mb-1 text-[11px] text-muted-foreground">
        {etiqueta}
      </Label>
      <Input
        id={`cot-${campo}`}
        type="date"
        value={visible[campo]}
        title={TITULO_FECHA_VUELO}
        className="h-9 w-36 cursor-pointer"
        onChange={(e) => onCambio(campo, e.target.value)}
        onBlur={() => onSalir(campo)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSalir(campo);
        }}
      />
    </div>
  );

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-[1fr_220px_220px_auto] items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Buscar</Label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              defaultValue={initial.q}
              // «ID (diego01)»: el API 0.0.75 busca también por el ID del
              // vuelo por cliente; un API previo simplemente no lo encuentra.
              placeholder={PLACEHOLDER_BARRA_COTIZACIONES}
              className="pl-9"
              onChange={(e) => pushQuery({ q: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estado</Label>
          <SearchableSelect
            options={ESTADOS.map((e) => ({ value: e.value, label: e.label }))}
            value={initial.estado}
            onChange={(v) => pushQuery({ estado: v })}
            placeholder="Todos los estados"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Cliente</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos los clientes" },
              ...clients.map((c) => ({ value: c.id, label: c.nombre })),
            ]}
            value={initial.cliente_id}
            onChange={(v) => pushQuery({ cliente_id: v })}
            placeholder="Todos los clientes"
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={limpiarTodo}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <XMarkIcon className="h-4 w-4" />
            Limpiar
          </button>
        )}
        {hoy !== undefined && (
          <>
            <div
              role="group"
              aria-label={ETIQUETA_GRUPO_FECHAS}
              data-rango="cotizaciones"
              className="md:col-span-full flex flex-wrap items-end gap-3"
            >
              {campoFecha("desde", "Desde")}
              {campoFecha("hasta", "Hasta")}
              <div className="flex flex-wrap gap-1 pb-0.5">
                {periodosRapidosCotizaciones(hoy).map((p) => {
                  const activo = p.desde === rango.desde && p.hasta === rango.hasta;
                  return (
                    <button
                      key={p.clave}
                      type="button"
                      onClick={() => irAPeriodo(p.desde, p.hasta)}
                      aria-pressed={activo}
                      data-periodo={p.clave}
                      className={cn(
                        "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium transition-colors",
                        activo
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>
            <p data-nota-rango className="text-[11px] text-muted-foreground md:col-span-full">
              {notaRangoCotizaciones(rango, { ignorado: rangoIgnorado })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
