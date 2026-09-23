"use client";

import "@/styles/cotizacion-fuente.css";
import "@/styles/cotizacion-interna.css";
import "@/styles/cotizacion-interna-pantalla.css";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  BANDA_INTERNA,
  MARCA_AGUA_INTERNA,
  SIN_DATO,
  ajustePositivoUsd,
  avionCotizadoTxt,
  avionUtilizadoTxt,
  comisionVendedorCanonicaUsd,
  conceptoCanonico,
  conceptoComisionVendedor,
  diaLargo,
  hayAjuste,
  horasTxt,
  lineaNetoVuelatour,
  moneyInterno,
  motivoAjuste,
  opComisionVendedor,
  resumenComisionVendedor,
  tarifaFicha,
} from "@/lib/admin/quote-sheet-interna";
import { EMPRESA_DEFAULT, TZ_NOTA, fechaLegible, geometriaHoja, numero2 } from "@/lib/admin/quote-sheet";
import { tuasMxnSinTc } from "@/lib/admin/tuas";
import { montoExtraActivo } from "@/lib/admin/extras";
import { HORAS_EPSILON_4, mismasHoras } from "@/lib/admin/horas";
import {
  TARIFA_EPSILON_2,
  mismaTarifa,
  segmentoTarifa,
  tarifaConDecimalesFinos,
  textoCuentaTarifa,
  textoTarifaInput,
} from "@/lib/admin/tarifa";
import { cn } from "@/lib/utils";
import type { QuoteBreakdown, TipoTarifa } from "@/types/quote";
import type { CotizacionInterna } from "@/types/quotes-interno";
import { CampoHorasPactadas } from "./campo-horas-pactadas";
import {
  CampoFecha,
  CampoHoja,
  CampoNumero,
  CampoSelect,
  CampoTextoLargo,
  PlegableHoja,
  SegmentoHoja,
  SwitchHoja,
  UI,
  type CampoSelectOption,
} from "./quote-sheet-fields";
import { DIALECTO_INTERNA, QuoteSheetDesglose } from "./quote-sheet-desglose";
import { QuoteSheetInternaTramos } from "./quote-sheet-interna-tramos";
import { QuoteSheetInternaCobros } from "./quote-sheet-interna-cobros";
import { comoOnCambioHoja } from "./quote-sheet-types";
import type {
  AeronaveHoja,
  AeropuertoHoja,
  ClienteHoja,
  DocumentoHoja,
  OnAbrirInterno,
  OnCambioHojaInterna,
  QuoteSheetValoresInterna,
  RutaHoja,
  TramoPdfAccesores,
} from "./quote-sheet-types";

/**
 * LA HOJA INTERNA como formulario (Fase 2.2 del rediseño del cotizador,
 * 22-sep-2026). Pedido del cliente: «en la página de la cotización
 * cambiaremos el formato de la pantalla para que NO se vea como el PDF de la
 * cotización que se entrega al cliente, más bien que se parezca a la
 * cotización INTERNA, que es la más completa, y podamos manejar gran parte de
 * cómo va evolucionando la cotización en la misma hoja, aprovechando que el
 * formato es igual al que manejaban antes en un Excel».
 *
 * El `<div class="cot-interna">` que ve el operador ES el documento interno:
 * MISMO marcado y clases que `cotizacion_interna_pdf._cuerpo_interno_html`
 * (banda roja, header con folio/versión/estado, tres tarjetas de resumen,
 * ficha en dos columnas, TRAMOS COTIZADOS con las seis columnas del Excel,
 * DESGLOSE + HORAS COTIZADAS, COBROS, notas y pie) y MISMO CSS
 * (`styles/cotizacion-interna.css`, sincronizado con
 * `npm run sync:hoja-interna-css`).
 *
 * DE DÓNDE SALE CADA NÚMERO — y aquí no se calcula ninguno:
 *  - lo que se mueve al teclear (tramos costeados, TUAS, extras, IVA, total
 *    USD/MXN) viene del `breakdown` de `POST /v1/quotes/calculate`;
 *  - lo que es identidad o historia (quién cotizó, piloto/copiloto, avión
 *    utilizado, cobros con su comisión y su «Registró», notas internas) viene
 *    de `GET /v1/quotes/:id/interno`, el MISMO payload que imprime el PDF.
 * Con un API previo, `interno` llega null y esos bloques se pintan vacíos o
 * con «—»: jamás un número inventado.
 *
 * QUÉ SE EDITA: lo que ya editaba la hoja del cliente —cliente, avión
 * cotizado, pasajeros, fecha del vuelo, itinerario (con las MILLAS por fin en
 * la tabla), extras, descuento, IVA %, T.C. y las notas al cliente— y, desde
 * la Fase 2.3 (BLOQUE A), lo que bajó del panel lateral a su renglón: el
 * MÉTODO de cobro previsto con su comisión de terminal (cabecera de COBROS),
 * el REDONDEO (su renglón del desglose), el switch de TUAS (en la LÍNEA del
 * primer renglón de TUAS desde el 22-sep-2026 noche: en el margen se salía del
 * papel), las marcas «Cotización abierta» y «Pase de abordar» (fila «Marcas» de
 * la ficha), las NOTAS INTERNAS y, en la línea del cliente, la croma de
 * captura (clientes frecuentes, «+ nuevo cliente», «Poner todo en $0»).
 *
 * BLOQUE B (22-sep-2026): también la TARIFA (segmento Pública/Broker/
 * Personalizada + $/hr, fila «Tarifa» de la ficha), las HORAS (sobrevuelo y
 * cobrable pactado, bloque «Horas cotizadas») y la COMISIÓN DEL VENDEDOR
 * (plegable bajo «Vendedor»). Todos son CROMA en la línea: el número que se
 * IMPRIME lo sigue resolviendo el motor —«Tarifa broker · $1,550.00/hr»,
 * «1.75 h»— y el control solo captura lo que se pacta. Solo queda en el panel
 * el operador externo y la ruta operativa (bloque C).
 *
 * POR QUÉ LA BANDA ROJA Y LA MARCA DE AGUA (riesgo 8 del diseño): esta
 * pantalla enseña comisiones, costo del operador externo, neto VuelaTour y
 * cobros. Sin una separación inequívoca, alguien acabaría mandándosela al
 * cliente. La marca de agua «INTERNA» es exclusiva de la pantalla; la banda,
 * la misma del papel.
 */
export interface QuoteSheetInternaProps {
  valores: QuoteSheetValoresInterna;
  onCambio: OnCambioHojaInterna;
  breakdown: QuoteBreakdown | null;
  /** El motor está calculando: importes atenuados (nunca vacíos). */
  calculando?: boolean;
  errorMotor?: string | null;
  /** Bloqueada (cobrada, facturada…): todo como texto, sin inputs. */
  lectura?: boolean;
  documento: DocumentoHoja;
  catalogos: {
    clientes?: ClienteHoja[];
    aeronaves: AeronaveHoja[];
    aeropuertos: AeropuertoHoja[];
    rutas?: RutaHoja[];
  };
  tramosPdf?: TramoPdfAccesores;
  pasajerosPorTramo?: { max: number } | null;
  totalRespaldo?: { total_usd: number | null; total_mxn: number | null };
  grupo?: { id: string; folio: number | string | null } | null;
  clienteExtra?: ReactNode;
  /**
   * CROMA justo ENCIMA de la tabla de tramos (Fase 2.3 · BLOQUE C): hoy, la
   * banda azul de la RUTA OPERATIVA del vuelo. Va dentro del papel porque es
   * un aviso de DIVERGENCIA —la ruta que vuela el piloto no es la que se
   * cotiza— y solo se entiende junto a la tabla que lo dice. Quien la pasa la
   * marca `data-cot-ui`: el documento de pyservices no la imprime.
   */
  bandaTramos?: ReactNode;
  /**
   * ECO en la tarjeta «Avión cotizado» (Fase 2.3 · BLOQUE C): hoy, quién
   * cubre el vuelo cuando es EXTERNO, con el atajo al `<details>` donde se
   * captura. Croma: no se imprime.
   */
  avionExtra?: ReactNode;
  /**
   * ALTA: las notas internas se capturan en el papel. En REVISIÓN no se
   * editan desde aquí (el `revise` del API no las lleva: se cambian en el
   * detalle del vuelo, «Editar datos»), así que se pintan como texto.
   */
  notasInternasEditables?: boolean;
  /** Payload de `GET /v1/quotes/:id/interno`; null en el alta o con API previo. */
  interno?: CotizacionInterna | null;
  escala?: number;
  papel?: boolean;
  className?: string;
  ids?: { pasajeros?: string; tc?: string };
}

/** Ancho del papel CARTA a 96 dpi (el `@page` del PDF interno es Letter). */
export const HOJA_INTERNA_ANCHO_PX = 816;


export function QuoteSheetInterna({
  valores,
  onCambio,
  breakdown,
  calculando = false,
  errorMotor = null,
  lectura = false,
  documento,
  catalogos,
  tramosPdf,
  pasajerosPorTramo = null,
  totalRespaldo,
  grupo,
  clienteExtra,
  bandaTramos,
  avionExtra,
  notasInternasEditables = false,
  interno = null,
  escala,
  papel = true,
  className,
  ids,
}: QuoteSheetInternaProps) {
  const b = breakdown;
  const pdf = useMemo<TramoPdfAccesores>(() => tramosPdf ?? {}, [tramosPdf]);

  // ----- Catálogos -----
  const opcionesAeronave = useMemo<CampoSelectOption[]>(
    () =>
      catalogos.aeronaves.map((a) => ({
        value: a.id,
        label: `${a.matricula} — ${a.modelo}`,
        description: a.descripcion,
        descriptionClassName: a.enTaller
          ? "truncate text-amber-600 dark:text-amber-400"
          : undefined,
        disabled: a.disabled,
        // El documento INTERNO siempre enseña la matrícula (no es el cliente).
        textoImpreso: `${a.modelo} · ${a.matricula}`,
      })),
    [catalogos.aeronaves],
  );
  const opcionesCliente = useMemo<CampoSelectOption[]>(
    () => (catalogos.clientes ?? []).map((c) => ({ value: c.id, label: c.nombre, description: c.descripcion })),
    [catalogos.clientes],
  );
  const clienteEditable = !lectura && (catalogos.clientes?.length ?? 0) > 0;
  const clienteNombre =
    documento.clienteNombre ??
    catalogos.clientes?.find((c) => c.id === valores.cliente_id)?.nombre ??
    interno?.cliente ??
    "";

  // ----- Avisos FUERA del papel (idénticos a los de la hoja del cliente) -----
  const tcCapturado = Number(valores.tc_usd_mxn) > 0;
  const mxnSinTc =
    !lectura &&
    !tcCapturado &&
    (tuasMxnSinTc(valores.tuas_lineas, tcCapturado).length > 0 ||
      valores.extras.some((e) => e.moneda === "MXN" && montoExtraActivo(e) > 0));
  const idTc = ids?.tc ?? "tc-usd-mxn-field";
  const idPasajeros = ids?.pasajeros ?? "pasajeros-field";
  const enfocarTc = () => {
    const el = document.getElementById(idTc) as HTMLInputElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  };

  /**
   * Atajos «· ajustar» / «pactar horas» (los que pintan el desglose y el
   * detalle «⋯» de un tramo): desde el BLOQUE B esos campos viven EN ESTE
   * PAPEL, así que el atajo solo hace scroll + foco a su renglón — no abre
   * nada. Desde el BLOQUE C (22-sep-2026) tampoco hay a dónde caer: el panel
   * lateral se retiró y estos tres campos SIEMPRE están montados en el papel
   * (el sobrevuelo, aunque su renglón sea fantasma). Sin ancla no se hace
   * nada, que es mejor que mover el foco a un sitio equivocado.
   */
  const enfocarEnHoja: OnAbrirInterno = (destino) => {
    const anclas: Record<typeof destino, string[]> = {
      tarifa: ["tarifa-override-field", "tarifa-tipo-field"],
      cobrable: ["cobrable-field"],
      sobrevuelo: ["sobrevuelo-field"],
    };
    const el = anclas[destino].map((id) => document.getElementById(id)).find((x) => !!x) ?? null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const ctl = el.matches("input, button")
      ? el
      : (el.querySelector<HTMLElement>("input:not([disabled])") ??
        el.querySelector<HTMLElement>('button[aria-pressed="true"]:not([disabled])') ??
        el.querySelector<HTMLElement>("button:not([disabled])"));
    ctl?.focus({ preventScroll: true });
  };
  const atajoEnHoja = lectura ? undefined : enfocarEnHoja;

  // ----- Escala al ancho del contenedor -----
  const escenarioRef = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const [anchoDisponible, setAnchoDisponible] = useState(0);
  const [altoHoja, setAltoHoja] = useState(0);
  useEffect(() => {
    const esc = escenarioRef.current;
    const hoja = hojaRef.current;
    if (!esc || !hoja || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      setAnchoDisponible(esc.clientWidth);
      setAltoHoja(hoja.offsetHeight);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(esc);
    ro.observe(hoja);
    return () => ro.disconnect();
  }, []);
  // Escala con la MISMA regla de las dos hojas (`geometriaHoja`), pero SIN
  // canal de croma: desde el 22-sep-2026 el documento interno pinta 🗑, ⋯ y
  // las marcas del tramo DENTRO del papel (reporte del cliente: «no se
  // alcanzan a ver los 3 puntitos para las demás opciones en la
  // cotización»). Con la croma dentro, un canal reservado fuera solo le
  // quitaría ancho al papel.
  const { canal, escalaEfectiva, anchoUtil } = geometriaHoja({
    anchoDisponible,
    anchoHoja: HOJA_INTERNA_ANCHO_PX,
    lectura,
    escala,
    canalPx: 0,
  });
  const altoReservado = altoHoja > 0 ? Math.round(altoHoja * escalaEfectiva) : undefined;

  // ----- Cabecera -----
  const empresa = documento.empresa ?? EMPRESA_DEFAULT;
  const folioTxt = documento.folio != null ? `Folio #${documento.folio}` : "Folio s/n";
  const versionTxt = interno?.version != null ? ` · v${interno.version}` : "";
  const estadoTxt = [interno?.estado_label || interno?.estado || "", documento.tipo]
    .filter(Boolean)
    .join(" · ");

  // ----- Resumen: fecha, avión cotizado, ruta -----
  const fechaVueloDia = valores.fecha_vuelo ? valores.fecha_vuelo.slice(0, 10) : null;
  const fechaGrande = diaLargo(fechaVueloDia ?? interno?.fecha_vuelo ?? null) || "Por definir";
  const finDia = valores.fecha_traslado_final ? valores.fecha_traslado_final.slice(0, 10) : null;
  const fechaFin =
    finDia && fechaVueloDia && finDia !== fechaVueloDia ? diaLargo(finDia) : "";
  const aeronaveSel = catalogos.aeronaves.find((a) => a.id === valores.aeronave_id);
  const avionCotizado = avionCotizadoTxt({
    modelo: aeronaveSel?.modelo ?? interno?.aeronave_cotizada_modelo ?? null,
    matricula: aeronaveSel?.matricula ?? interno?.aeronave_cotizada_matricula ?? null,
  });
  const avionUtilizado = avionUtilizadoTxt(interno?.aeronave_utilizada);
  const difiereAvion = interno?.aeronave_cotizada_vs_utilizada_difiere === true;
  const pax = pasajerosPorTramo ? pasajerosPorTramo.max : Number(valores.pasajeros) || 0;
  const rutaTexto =
    valores.escalas.length > 0
      ? [valores.escalas[0]?.origen_iata, ...valores.escalas.map((e) => e.destino_iata)]
          .filter(Boolean)
          .join(" → ")
      : (interno?.ruta ?? SIN_DATO);

  // ----- Ficha -----
  const tarifa = tarifaFicha({
    tipoLabel: interno?.tarifa_tipo_label ?? b?.tarifa.tipo ?? null,
    tarifaUsdHr: b?.tarifa.usd_por_hora ?? interno?.tarifa_hora_usd ?? null,
    preferencial: b?.tarifa.preferencial_cliente === true || interno?.tarifa_preferencial === true,
    override: b?.tarifa.proviene_de_override === true || interno?.tarifa_override === true,
  });
  // SEGMENTO de tarifa (BLOQUE B): la MISMA regla del cotizador
  // (`segmentoTarifa`, fuente única) — con dos copias, el papel podría decir
  // «Pública» mientras se cobra la manual.
  const segmento = segmentoTarifa(valores);
  // CUENTA VIVA «2.4 hr × $989.583333 = $2,375.00» (#105): el importe es el
  // del MOTOR; mientras va un debounce atrás se dice «calculando…».
  const cuentaTarifaVigente =
    !!b &&
    b.tarifa.proviene_de_override === true &&
    mismaTarifa(b.tarifa.usd_por_hora, valores.tarifa_hora_override_usd, TARIFA_EPSILON_2);
  const cuentaTarifa = textoCuentaTarifa({
    horas: b?.tiempos.cobrable_hr,
    tarifa: valores.tarifa_hora_override_usd,
    importeUsd: cuentaTarifaVigente ? b?.totales.subtotal_vuelo_usd : null,
  });
  // COMISIÓN DEL VENDEDOR: el resumen del plegable (no multiplica nada; el
  // importe efectivo lo publica el motor en su renglón del desglose).
  const comisionModo = valores.comision_vendedor_modo === "POR_HORA" ? "POR_HORA" : "FIJA";
  const comisionResumen = resumenComisionVendedor({
    modo: comisionModo,
    montoUsd: valores.comision_vendedor_usd,
    tarifaHr: valores.comision_vendedor_tarifa_hr,
    nombre: valores.comision_vendedor_nombre,
  });
  const hayComisionCapturada = comisionResumen !== "sin comisión";
  // MARCAS de la ficha: las que IMPRIME el papel (`_ficha_html`). «Cotización
  // abierta» sale del formulario —su switch está en esta misma fila y el tag
  // se enciende al prenderlo—; las demás son historia del API.
  const marcas: string[] = [];
  if (valores.cotizacion_abierta ?? interno?.cotizacion_abierta) marcas.push("Cotización abierta");
  if (interno?.itinerario_operativo) marcas.push("Itinerario operativo");
  if (interno?.grupo_folio) {
    marcas.push(
      interno.grupo_posicion && interno.grupo_total_aviones
        ? `Grupo ${interno.grupo_folio} · avión ${interno.grupo_posicion} de ${interno.grupo_total_aviones}`
        : `Grupo ${interno.grupo_folio}`,
    );
  } else if (grupo) {
    marcas.push(`Grupo ${grupo.folio ?? ""}`.trim());
  }
  if (interno?.combinado_con_folio) marcas.push(`Combinado con #${interno.combinado_con_folio}`);
  // «Pase de abordar» BLOQUEADA: el papel no lo imprime y su switch no se
  // monta en lectura, así que sin este tag de croma el dato desaparecería de
  // la pantalla al retirar el panel (BLOQUE C). Exenta TUAS: hay que poder
  // leer por qué el desglose no las cobra.
  const paseAbordarLectura = lectura && valores.pase_abordar === true;

  // ----- Desglose: renglones que SOLO existen en el documento interno -----
  const comisionUsd = comisionVendedorCanonicaUsd(b);
  const comisionVendedor =
    comisionUsd != null && Math.abs(comisionUsd) >= 0.005
      ? {
          montoUsd: comisionUsd,
          // El CONCEPTO es el canónico del motor («Comisión del vendedor
          // (Saab) · $50.00/hr × 2.3 hr»), que es lo que imprime el papel;
          // el nombre solo se cuelga si no venía ya dentro.
          concepto: conceptoComisionVendedor(
            conceptoCanonico(b, "COMISION_VENDEDOR"),
            interno?.comision_vendedor_nombre ?? b?.meta.comision_vendedor_nombre ?? null,
          ),
          op: opComisionVendedor({
            modo: interno?.comision_vendedor_modo ?? b?.meta.comision_vendedor_modo ?? null,
            horas: b?.tiempos.cobrable_hr ?? null,
            tarifaHr:
              interno?.comision_vendedor_tarifa_hr ?? b?.meta.comision_vendedor_tarifa_hr ?? null,
            pagoVendedorUsd: interno?.pago_vendedor_usd ?? null,
            conIva: !!interno?.iva_comision_vendedor_usd,
          }),
        }
      : null;
  const ajusteUsd = ajustePositivoUsd(b);
  const ajustePositivo =
    ajusteUsd != null
      ? {
          montoUsd: ajusteUsd,
          // El motor rotula esta línea «Redondeo» (positiva) o «Descuento»
          // (negativa) y el papel imprime ESE texto: inventar «Ajuste» hacía
          // que pantalla y PDF nombraran distinto el mismo renglón.
          concepto: conceptoCanonico(b, "AJUSTE") ?? "Redondeo",
          op:
            interno?.total_pactado_usd != null
              ? `a precio pactado ${moneyInterno(interno.total_pactado_usd)}`
              : "redondeo automático",
        }
      : null;
  const motorTxt = [
    b?.meta.version_motor ? `motor ${b.meta.version_motor}` : "",
    b?.meta.calculado_at ? `calculado ${fechaLegible(b.meta.calculado_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  // Línea TENUE bajo el desglose (BLOQUE B): «Neto VuelaTour $X · Pago al
  // vendedor $Y». Los dos números llegan del motor y de `/interno`: aquí no
  // se resta nada. Es CROMA —el papel no la imprime— y va DENTRO de la tabla
  // (es el único sitio que el desglose expone al final: `dialecto.pie`).
  const netoTxt = lineaNetoVuelatour({
    netoUsd: b?.meta.neto_vuelatour_usd ?? null,
    pagoVendedorUsd: interno?.pago_vendedor_usd ?? null,
    conIva: !!interno?.iva_comision_vendedor_usd,
  });
  const pieDesglose =
    netoTxt || motorTxt ? (
      <>
        {netoTxt && (
          <tr key="neto" className="cot-fila" {...UI}>
            <td colSpan={2} className="muted">
              {netoTxt}
            </td>
          </tr>
        )}
        {motorTxt && (
          <tr key="motor" className="cot-fila">
            <td colSpan={2} className="muted">
              {motorTxt}
            </td>
          </tr>
        )}
      </>
    ) : undefined;

  // Notas internas: las del API (versión guardada) o, sin `interno` (alta o
  // API previo), las del formulario — nunca se pierden por un 404.
  const notasInternasTxt = (interno?.notas_internas ?? "") || valores.notas_internas || "";

  const pieInterno = [
    interno?.generado_cancun
      ? `Documento interno · generado ${interno.generado_cancun} (hora Cancún)`
      : "Documento interno",
    (interno?.generado_por ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn("cot-escenario", className)}
      ref={escenarioRef}
      data-guard-exempt={lectura ? "" : undefined}
      // Sin canal: la croma del documento interno vive DENTRO del papel
      // (`.cot-croma`) desde el 22-sep-2026. `canal` llega en 0 y esto queda
      // como está por si algún día se vuelve a reservar algo a la izquierda.
      style={canal ? { paddingLeft: canal } : undefined}
    >
      {/* Bandas de estado: FUERA del papel, ancho completo, nunca plegables. */}
      {(errorMotor || mxnSinTc) && (
        <div className="mx-auto mb-3 space-y-2" style={{ maxWidth: HOJA_INTERNA_ANCHO_PX }}>
          {errorMotor && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-medium">Error al calcular:</span> {errorMotor}. La hoja
                conserva los últimos montos.
              </p>
            </div>
          )}
          {mxnSinTc && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
            >
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1">
                Hay TUAS o extras en MXN sin tipo de cambio: el total aún NO los incluye y no se
                puede guardar.
              </p>
              <button type="button" onClick={enfocarTc} className="cursor-pointer font-medium underline underline-offset-2">
                Capturar T.C.
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className="cot-escenario__lienzo"
        style={{
          width: HOJA_INTERNA_ANCHO_PX,
          transform: escalaEfectiva !== 1 ? `scale(${escalaEfectiva})` : undefined,
          marginLeft:
            escalaEfectiva !== 1
              ? Math.max(0, (anchoUtil - HOJA_INTERNA_ANCHO_PX * escalaEfectiva) / 2)
              : undefined,
          marginRight: escalaEfectiva !== 1 ? 0 : undefined,
          height: altoReservado,
        }}
      >
        <div
          ref={hojaRef}
          className={cn(
            "cot-interna",
            "cot-interna--pantalla",
            papel && "cot-interna--papel",
            calculando && "cot-interna--calculando",
            lectura && "cot-interna--lectura",
          )}
          role="region"
          aria-label="Hoja interna de la cotización (uso exclusivo de oficina)"
        >
          {/* Marca de agua: SOLO pantalla (el papel ya lleva la banda). */}
          <div className="cot-marca-agua" aria-hidden="true" {...UI}>
            <span>{MARCA_AGUA_INTERNA}</span>
          </div>

          {/* 1 · Cabecera */}
          <div className="header">
            <div className="izq">
              {/* eslint-disable-next-line @next/next/no-img-element -- mismo <img class="logo"> del PDF */}
              <img className="logo" src="/cotizacion/logo-vuelatour-blanco.png" alt="" />
              <div>
                <div className="titulo">Cotización interna</div>
                <div className="sub">{empresa}</div>
              </div>
            </div>
            <div className="folio">
              {`${folioTxt}${versionTxt}`}
              <span className="sub">{estadoTxt}</span>
            </div>
          </div>
          <div className="banda">{BANDA_INTERNA}</div>

          {/* 2 · Tres tarjetas de resumen */}
          <table className="resumen">
            <tbody>
              <tr>
                <td className="fecha">
                  <div className="lbl">Fecha del vuelo</div>
                  <div className="big">
                    <CampoFecha
                      value={valores.fecha_vuelo ?? ""}
                      onChange={(v) => onCambio("fecha_vuelo", v)}
                      ariaLabel="Fecha del vuelo"
                      lectura={lectura}
                      vacio="Por definir"
                      texto={fechaGrande}
                    />
                  </div>
                  {fechaFin && <div className="sub">{`al ${fechaFin}`}</div>}
                  {/* La HORA es dato operativo: se captura aquí y NO se
                      imprime (ni el PDF del cliente ni el interno la llevan). */}
                  {!lectura && (
                    <div className="sub" {...UI}>
                      <span className="cot-tenue">Regreso: </span>
                      <CampoFecha
                        value={valores.fecha_traslado_final ?? ""}
                        onChange={(v) => onCambio("fecha_traslado_final", v)}
                        ariaLabel="Regreso del vuelo"
                        vacio="por confirmar"
                      />
                    </div>
                  )}
                </td>
                <td>
                  <div className="lbl">Avión cotizado</div>
                  <div className="med">
                    <CampoSelect
                      options={opcionesAeronave}
                      value={valores.aeronave_id}
                      onChange={(v) => onCambio("aeronave_id", v)}
                      placeholder="Selecciona aeronave"
                      searchPlaceholder="Buscar aeronave…"
                      ariaLabel="Aeronave cotizada"
                      title="Con este avión se pactó el precio. Cambiarlo recotiza."
                      lectura={lectura}
                      textoFallback={avionCotizado}
                    />
                  </div>
                  {avionUtilizado && (
                    <div className={cn("sub", difiereAvion && "ambar")}>
                      {`Avión utilizado: ${avionUtilizado}`}
                      {difiereAvion && <span className="tag ambar">Distinto al cotizado</span>}
                    </div>
                  )}
                  {/* ECO del operador externo (BLOQUE C): se LEE aquí, se
                      CAPTURA en el `<details>` de abajo. CROMA — el papel de
                      pyservices lo imprime de otra forma (`_avion_html`). */}
                  {avionExtra && (
                    <div className="sub" {...UI}>
                      {avionExtra}
                    </div>
                  )}
                </td>
                <td>
                  <div className="lbl">Ruta cotizada</div>
                  <div className="med">
                    {rutaTexto}
                    <span className="op">
                      {" · "}
                      {lectura || pasajerosPorTramo ? (
                        `${pax} ${pax === 1 ? "pasajero" : "pasajeros"}`
                      ) : (
                        <>
                          <CampoNumero
                            id={idPasajeros}
                            value={Number(valores.pasajeros) > 0 ? Number(valores.pasajeros) : null}
                            onChange={(n) => onCambio("pasajeros", n ?? 0)}
                            formato={(n) => String(n)}
                            placeholder="0"
                            ariaLabel="Pasajeros"
                            title={
                              aeronaveSel?.asientos
                                ? `Máx. ${aeronaveSel.asientos} (${aeronaveSel.modelo})`
                                : undefined
                            }
                            entero
                            min={0}
                            max={aeronaveSel?.asientos || undefined}
                            minCh={1}
                          />
                          {` ${pax === 1 ? "pasajero" : "pasajeros"}`}
                        </>
                      )}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 3 · Ficha en dos columnas */}
          <table className="cols">
            <tbody>
              <tr>
                <td className="col">
                  <table className="kv">
                    <tbody>
                      <tr>
                        <td className="k">Cliente</td>
                        <td className="v cot-ancla">
                          {clienteEditable ? (
                            <CampoSelect
                              options={opcionesCliente}
                              value={valores.cliente_id}
                              onChange={(v) => onCambio("cliente_id", v)}
                              placeholder="Selecciona cliente"
                              searchPlaceholder="Buscar cliente…"
                              emptyText="Sin clientes activos"
                              ariaLabel="Cliente"
                              textoFallback={clienteNombre}
                            />
                          ) : (
                            clienteNombre || SIN_DATO
                          )}
                          {interno?.es_broker && <span className="tag">Broker</span>}
                          {interno?.es_interno && <span className="tag ambar">Cliente interno</span>}
                          {clienteExtra && !lectura && (
                            <span className="cot-acciones" {...UI}>
                              {" "}
                              <span className="cot-sep">·</span>
                              {clienteExtra}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="k">Razón social</td>
                        <td className="v">
                          {interno?.razon_social || SIN_DATO}
                          {interno?.cliente_rfc && (
                            <span className="op">{` RFC ${interno.cliente_rfc}`}</span>
                          )}
                        </td>
                      </tr>
                      {/* TARIFA (BLOQUE B): el papel IMPRIME lo que resolvió
                          el motor —«Tarifa broker · $1,550.00/hr» + las
                          marcas— y al lado, en croma, se DECIDE: el segmento
                          Pública/Broker/Personalizada y, con la manual, el
                          $/hr de SOLO esta cotización con su cuenta viva.
                          El número impreso no se sustituye por el input a
                          propósito: con «Personalizada» recién encendida y el
                          campo vacío, el papel se quedaría sin tarifa. */}
                      <tr>
                        <td className="k">Tarifa</td>
                        <td className="v">
                          {tarifa.texto}
                          {tarifa.marcas && <span className="op">{` ${tarifa.marcas}`}</span>}
                          {!lectura && (
                            <span className="cot-acciones" {...UI}>
                              {" "}
                              <span className="cot-sep">·</span>
                              <SegmentoHoja
                                id="tarifa-tipo-field"
                                value={segmento}
                                ariaLabel="Tipo de tarifa"
                                onChange={(v) => {
                                  if (v === "CUSTOM") {
                                    onCambio("tarifa_personalizada", true);
                                    return;
                                  }
                                  // Volver a la estándar LIMPIA la manual: si
                                  // no, seguiría mandando en silencio.
                                  onCambio("tarifa_personalizada", false);
                                  onCambio("tarifa_hora_override_usd", null);
                                  onCambio("tipo_tarifa", v as TipoTarifa);
                                }}
                                options={[
                                  { value: "PUBLICO", label: "Pública", title: "Tarifa pública del avión" },
                                  { value: "BROKER", label: "Broker", title: "Tarifa broker del avión" },
                                  {
                                    value: "CUSTOM",
                                    label: "Personalizada",
                                    title: "Tarifa SOLO para esta cotización (no cambia la del cliente)",
                                  },
                                ]}
                              />
                              {segmento === "CUSTOM" && (
                                <>
                                  {" $"}
                                  <CampoNumero
                                    id="tarifa-override-field"
                                    value={
                                      `${valores.tarifa_hora_override_usd ?? ""}`.trim() === ""
                                        ? null
                                        : Number(valores.tarifa_hora_override_usd)
                                    }
                                    onChange={(n) => onCambio("tarifa_hora_override_usd", n)}
                                    // En reposo se lee como el papel
                                    // («1,550.00») salvo que la tarifa traiga
                                    // los decimales finos que hacen cuadrar el
                                    // total (#105): ahí se enseñan TODOS
                                    // («989.583333»), que es lo que se
                                    // multiplica. Al enfocar siempre sale el
                                    // número crudo.
                                    formato={(n) =>
                                      tarifaConDecimalesFinos(n) ? textoTarifaInput(n) : numero2(n)
                                    }
                                    placeholder="0.00"
                                    ariaLabel="Tarifa por hora — SOLO esta cotización (USD)"
                                    title="Vacío = la pactada del cliente o la del avión. Admite 6 decimales (989.583333)."
                                    min={0}
                                    minCh={6}
                                  />
                                  {"/hr"}
                                </>
                              )}
                              {cuentaTarifa && (
                                <span className="cot-tenue">
                                  {" "}
                                  {cuentaTarifa}
                                  {!cuentaTarifaVigente && " · calculando…"}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
                <td className="col">
                  <table className="kv">
                    <tbody>
                      <tr>
                        <td className="k">Vendedor</td>
                        <td className="v">
                          {interno?.vendedor || SIN_DATO}
                          {interno?.cotizado_por && (
                            <span className="op">{` cotizó ${interno.cotizado_por}`}</span>
                          )}
                        </td>
                      </tr>
                      {/* COMISIÓN DEL VENDEDOR (BLOQUE B): se captura bajo
                          «Vendedor», en un plegable EN LÍNEA que NUNCA
                          desmonta su contenido (`<details>`). La fila entera
                          es CROMA: el papel no imprime esta captura — lo que
                          imprime es el RENGLÓN del desglose, con el concepto
                          canónico del motor («Comisión del vendedor (Saab) ·
                          $50.00/hr × 2 hr») y su importe. Aquí no se
                          multiplica nada. */}
                      {!lectura && (
                        <tr {...UI}>
                          <td className="k">Comisión</td>
                          <td className="v">
                            <PlegableHoja
                              resumen={comisionResumen}
                              abiertoPorDefecto={hayComisionCapturada}
                            >
                              <SegmentoHoja
                                value={comisionModo}
                                ariaLabel="Modalidad de la comisión del vendedor"
                                onChange={(v) =>
                                  onCambio(
                                    "comision_vendedor_modo",
                                    v === "POR_HORA" ? "POR_HORA" : "FIJA",
                                  )
                                }
                                options={[
                                  { value: "FIJA", label: "Fija", title: "Monto fijo en USD" },
                                  {
                                    value: "POR_HORA",
                                    label: "Por hora",
                                    title: "$/hr × horas cobradas (lo resuelve el motor)",
                                  },
                                ]}
                              />
                              {" $"}
                              {comisionModo === "POR_HORA" ? (
                                <>
                                  <CampoNumero
                                    value={
                                      Number(valores.comision_vendedor_tarifa_hr) > 0
                                        ? Number(valores.comision_vendedor_tarifa_hr)
                                        : null
                                    }
                                    onChange={(n) =>
                                      onCambio(
                                        "comision_vendedor_tarifa_hr",
                                        n != null && n > 0 ? n : null,
                                      )
                                    }
                                    formato={numero2}
                                    placeholder="0.00"
                                    ariaLabel="Comisión del vendedor por hora (USD)"
                                    title="El motor la multiplica por las horas cobradas."
                                    min={0}
                                    minCh={5}
                                  />
                                  {"/hr"}
                                </>
                              ) : (
                                <CampoNumero
                                  value={
                                    Number(valores.comision_vendedor_usd) > 0
                                      ? Number(valores.comision_vendedor_usd)
                                      : null
                                  }
                                  onChange={(n) =>
                                    onCambio("comision_vendedor_usd", n != null && n > 0 ? n : null)
                                  }
                                  formato={numero2}
                                  placeholder="0.00"
                                  ariaLabel="Comisión del vendedor (USD)"
                                  title="Monto fijo; se SUMA al precio del cliente."
                                  min={0}
                                  minCh={5}
                                />
                              )}
                              {" · "}
                              <CampoHoja
                                value={valores.comision_vendedor_nombre}
                                onChange={(v) => onCambio("comision_vendedor_nombre", v)}
                                placeholder="quién vendió"
                                ariaLabel="Quién vendió (comisión del vendedor)"
                                minCh={10}
                              />
                              <span className="cot-tenue">
                                {" · se SUMA al precio del cliente"}
                              </span>
                            </PlegableHoja>
                          </td>
                        </tr>
                      )}
                      {(interno?.piloto || interno?.copiloto) && (
                        <tr>
                          <td className="k">Piloto</td>
                          <td className="v">
                            {interno?.piloto || SIN_DATO}
                            {interno?.copiloto && ` · copiloto ${interno.copiloto}`}
                          </td>
                        </tr>
                      )}
                      {/* MARCAS. Los dos switches que decidían en el panel
                          («Cotización abierta», «Pase de abordar») viven aquí
                          (Fase 2.3). El papel solo imprime el TAG de
                          «Cotización abierta» —`_ficha_html` no conoce el pase
                          de abordar—, así que sin ninguna marca encendida la
                          fila entera es croma: existe para alojar los
                          controles y no se imprime.

                          En LECTURA el pase de abordar se pinta como TAG DE
                          CROMA (BLOQUE C): hasta hoy solo se leía en el bloque
                          «Cobro» del panel lateral, que ya no existe, y una
                          cotización bloqueada que exenta TUAS tiene que poder
                          decir POR QUÉ. Imprimirlo de verdad es un cambio en
                          `_ficha_html` de pyservices. */}
                      {(marcas.length > 0 || !lectura || paseAbordarLectura) && (
                        <tr {...(marcas.length === 0 ? UI : {})}>
                          <td className="k">Marcas</td>
                          <td className="v">
                            {marcas.map((m) => (
                              <span key={m} className="tag">
                                {m}
                              </span>
                            ))}
                            {paseAbordarLectura && (
                              <span className="tag" {...UI}>
                                Pase de abordar
                              </span>
                            )}
                            {!lectura && (
                              <span className="cot-acciones" {...UI}>
                                {" "}
                                <SwitchHoja
                                  checked={valores.cotizacion_abierta}
                                  onChange={(v) => onCambio("cotizacion_abierta", v)}
                                  label="Cotización abierta"
                                  title="El itinerario/precio se cierra al final: permite re-cotizar con los tramos reales hasta antes de cobrar o facturar."
                                />{" "}
                                <SwitchHoja
                                  checked={valores.pase_abordar}
                                  onChange={(v) => onCambio("pase_abordar", v)}
                                  label="Pase de abordar"
                                  title="Exenta TUAS (excepto CZM). No se imprime: su efecto se ve en el desglose."
                                />
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                      <tr className="small">
                        <td className="k">Cotizada</td>
                        <td className="v">
                          {fechaLegible(documento.fechaCotizacion)}
                          {interno?.fecha_confirmacion &&
                            ` · confirmada ${fechaLegible(interno.fecha_confirmacion)}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Aviso de DIVERGENCIA con la operación, pegado a la tabla que lo
              explica (BLOQUE C). Croma: no se imprime. */}
          {bandaTramos}

          {/* 4 · Tramos cotizados (la tabla del Excel) */}
          <QuoteSheetInternaTramos
            legs={valores.escalas}
            onLegsChange={(legs) => onCambio("escalas", legs)}
            aeropuertos={catalogos.aeropuertos}
            rutas={catalogos.rutas}
            lectura={lectura}
            pdf={pdf}
            breakdown={b}
            interno={interno}
            onAbrirInterno={atajoEnHoja}
          />

          {/* 5 · Desglose (58 %) + Horas cotizadas (42 %) */}
          <table className="cols desglose bloque">
            <tbody>
              <tr>
                <td className="col">
                  <QuoteSheetDesglose
                    breakdown={b}
                    valores={valores}
                    onCambio={comoOnCambioHoja(onCambio)}
                    lectura={lectura}
                    totalRespaldo={totalRespaldo}
                    grupo={grupo}
                    idTc={idTc}
                    onAbrirInterno={atajoEnHoja}
                    dialecto={{ ...DIALECTO_INTERNA, pie: pieDesglose }}
                    comisionVendedor={comisionVendedor}
                    ajustePositivo={ajustePositivo}
                    // El REDONDEO se decide en el renglón donde se lee
                    // (Fase 2.3): switch automático + monto manual
                    // (`redondeo-field`) al margen de «Redondeo».
                    redondeo={{
                      auto: valores.redondeo_auto,
                      manualUsd: valores.redondeo_usd,
                      onAuto: (v) => onCambio("redondeo_auto", v),
                      onManual: (v) => onCambio("redondeo_usd", v),
                    }}
                  />
                </td>
                <td className="col">
                  <HorasCotizadas
                    breakdown={b}
                    interno={interno}
                    lectura={lectura}
                    sobrevueloHr={valores.sobrevuelo_hr}
                    cobrablePactadoHr={valores.tiempo_cobrable_override_hr}
                    onSobrevuelo={(v) => onCambio("sobrevuelo_hr", v)}
                    onCobrablePactado={(v) => onCambio("tiempo_cobrable_override_hr", v)}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* 6 · Cobros. La cabecera lleva el método PREVISTO, que se edita
              ahí mismo (`metodo-pago-field` + «¿cuál?» + el % de terminal). */}
          <QuoteSheetInternaCobros
            interno={interno}
            lectura={lectura}
            metodo={valores.metodo_pago}
            metodoDetalle={valores.metodo_pago_detalle}
            comisionPct={valores.comision_billpocket_pct}
            onMetodo={(v) => onCambio("metodo_pago", v)}
            onMetodoDetalle={(v) => onCambio("metodo_pago_detalle", v)}
            onComisionPct={(v) => onCambio("comision_billpocket_pct", v)}
          />

          {/* 7 · NOTAS. El documento interno solo imprime las INTERNAS (las
              del cliente son del otro documento), así que el papel lleva
              exactamente el bloque del PDF y las notas al cliente se capturan
              en un bloque de CROMA (`data-cot-ui`, solo en edición): se
              editan aquí porque aquí se edita todo, pero no se imprimen en
              esta hoja.

              Las INTERNAS se capturan aquí en el ALTA (Fase 2.3). Al REVISAR
              no: `POST /:id/revise` no las lleva —se cambian en el detalle
              del vuelo, «Editar datos»— y un campo que se teclea y no se
              guarda es peor que no tenerlo, así que ahí se pintan como texto
              con la nota de dónde se editan. */}
          {(notasInternasTxt || (!lectura && notasInternasEditables)) && (
            <div className="bloque">
              <h2>Notas internas</h2>
              <div className="notas-txt">
                {!lectura && notasInternasEditables ? (
                  <CampoTextoLargo
                    value={valores.notas_internas}
                    onChange={(v) => onCambio("notas_internas", v)}
                    placeholder="Solo para el equipo · nunca salen en el PDF del cliente"
                    ariaLabel="Notas internas"
                  />
                ) : (
                  notasInternasTxt
                )}
                {!lectura && !notasInternasEditables && (
                  <span className="cot-acciones" {...UI}>
                    {" "}
                    <span className="cot-sep">·</span>
                    <span className="cot-tenue">
                      se editan en el detalle del vuelo («Editar datos»)
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
          {!lectura && (
            <div className="bloque" {...UI}>
              <h2>Notas al cliente 🖨</h2>
              <div className="notas-txt">
                <CampoTextoLargo
                  value={valores.notas}
                  onChange={(v) => onCambio("notas", v)}
                  placeholder="Notas para el cliente (salen en SU PDF, no en esta hoja). Ej. Sujeto a slot en CUN…"
                  ariaLabel="Notas visibles en el PDF"
                />
              </div>
            </div>
          )}

          {/* 8 · Pie. En el PDF vive en `@page` (no en el cuerpo), así que en
              pantalla es croma: `data-cot-ui` para que la comparación con el
              documento de pyservices no lo cuente. */}
          <div className="pie-pantalla" {...UI}>
            {pieInterno}
            <br />
            {TZ_NOTA}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * HORAS COTIZADAS — réplica de `_horas_html`: vuelo + calzos + sobrevuelo →
 * cotizadas → cobrables → tarifa. La fila «Cobrables» carga el MOTIVO y el
 * IMPORTE del ajuste («Horas pactadas 1.75 h: +$165.00 sobre Σ tramos»): sin
 * eso, en 6 de cada 10 cotizaciones la tabla de tramos cerraría en «TOTAL Σ
 * tramos» y el desglose en «Servicio aéreo» sin nada que los concilie
 * (riesgo 1 del diseño).
 *
 * BLOQUE B (22-sep-2026): las horas SE CAPTURAN aquí. El SOBREVUELO y el
 * COBRABLE PACTADO bajaron del panel lateral a su renglón, como CROMA en la
 * línea: el número que se IMPRIME es el que resolvió el motor («1.75 h») y el
 * control de al lado es lo que se PACTA (vacío = la regla). Se separan a
 * propósito — sustituir el impreso por el input dejaría la fila «Cobrables»
 * vacía en las cotizaciones que no pactan horas, que son la mayoría.
 *
 * El renglón «Sobrevuelo» sin horas no existe en el papel: en edición se pinta
 * FANTASMA (`data-cot-ui`, no se imprime) para que el campo tenga dónde vivir,
 * igual que el renglón «Redondeo» del desglose.
 */
function HorasCotizadas({
  breakdown: b,
  interno,
  lectura,
  sobrevueloHr,
  cobrablePactadoHr,
  onSobrevuelo,
  onCobrablePactado,
}: {
  breakdown: QuoteBreakdown | null;
  interno: CotizacionInterna | null;
  lectura: boolean;
  /** Sobrevuelo CAPTURADO (el form); el impreso es el del motor. */
  sobrevueloHr: number | null;
  /** Cobrable PACTADO (el form); vacío = la regla del motor. */
  cobrablePactadoHr: number | null;
  onSobrevuelo: (v: number | null) => void;
  onCobrablePactado: (v: number | null) => void;
}) {
  const vuelo = b?.tiempos.vuelo_hr ?? interno?.vuelo_hr ?? null;
  const calzos = b?.tiempos.calzos_hr ?? interno?.calzos_hr ?? null;
  const sobrevuelo = b?.tiempos.sobrevuelo_hr ?? interno?.sobrevuelo_hr ?? null;
  const cotizadas = interno?.horas_cotizadas_hr ?? null;
  const cobrable = b?.tiempos.cobrable_hr ?? interno?.tiempo_cobrable_hr ?? null;
  const tarifaHr = b?.tarifa.usd_por_hora ?? interno?.tarifa_hora_usd ?? null;

  const notas: string[] = [];
  if (b?.tiempos.minimo_hora_aplicado || interno?.hora_minima_aplicada) {
    notas.push("hora mínima aplicada");
  }
  if (b?.tiempos.cobrable_proviene_de_override || interno?.cobrable_override) {
    notas.push("cobrable manual");
  }
  const ajuste = b?.tramos_ajuste_usd ?? null;
  if (hayAjuste(ajuste)) {
    const signo = (ajuste as number) > 0 ? "+" : "−";
    notas.push(
      `${motivoAjuste(b?.tramos_ajuste_motivo)}: ${signo}${moneyInterno(Math.abs(ajuste as number))} sobre Σ tramos`,
    );
  }
  // AVISOS de la captura (croma, ámbar): los mismos que daba el panel.
  const avisosHoras: string[] = [];
  if (
    !lectura &&
    b?.tiempos.cobrable_proviene_de_override &&
    Number(b.tiempos.cobrable_hr) <
      Number(b.tiempos.vuelo_hr) +
        Number(b.tiempos.calzos_hr) +
        Number(b.tiempos.sobrevuelo_hr ?? 0)
  ) {
    avisosHoras.push(
      "Ojo: el cobrable pactado es MENOR al tiempo real (vuelo + calzos): se cobraría de menos.",
    );
  }
  if (!lectura && b?.tiempos.minimo_hora_aplicado) {
    avisosHoras.push(
      "Vuelo corto: se cobra la hora completa (mínimo 1 hr). Escribe otro valor si quieres pactarlo distinto.",
    );
  }

  const filas: ReactNode[] = [];
  const fila = (k: string, v: ReactNode, key: string, fantasma = false) => (
    <tr key={key} {...(fantasma ? UI : {})}>
      <td className="k">{k}</td>
      <td className="v">{v}</td>
    </tr>
  );
  if (vuelo) filas.push(fila("Vuelo", horasTxt(vuelo), "vuelo"));
  if (calzos) filas.push(fila("Calzos", horasTxt(calzos), "calzos"));
  if (sobrevuelo || !lectura) {
    filas.push(
      fila(
        "Sobrevuelo",
        <>
          {sobrevuelo ? horasTxt(sobrevuelo) : ""}
          {!lectura && (
            <span className="cot-acciones" {...UI}>
              {/* Ternario, NUNCA `{sobrevuelo && …}`: con 0 horas React
                  imprimiría el propio «0» delante del campo. */}
              {sobrevuelo ? (
                <>
                  {" "}
                  <span className="cot-sep">·</span>
                </>
              ) : null}
              <CampoNumero
                id="sobrevuelo-field"
                value={
                  `${sobrevueloHr ?? ""}`.trim() === "" ? null : Number(sobrevueloHr)
                }
                onChange={(n) => onSobrevuelo(n != null && n > 0 ? n : null)}
                formato={(n) => String(n)}
                placeholder="0"
                ariaLabel="Sobrevuelo (hr)"
                title="Tiempo extra sobre la zona; se suma al cobrable."
                min={0}
                max={24}
                minCh={3}
              />
              {" hr"}
            </span>
          )}
        </>,
        "sobrevuelo",
        !sobrevuelo,
      ),
    );
  }
  if (cotizadas != null) filas.push(fila("Cotizadas", horasTxt(cotizadas), "cotizadas"));
  // En EDICIÓN el renglón existe aunque el motor todavía no haya contestado
  // (alta recién abierta, o `/calculate` en error): se pinta FANTASMA
  // —`data-cot-ui`, no se imprime— igual que «Sobrevuelo» y «Redondeo». Si
  // no, el ancla `cobrable-field` desaparecería justo cuando más falta hace
  // pactar horas, y «pactar horas» del detalle «⋯» no llevaría a ningún lado.
  if (cobrable != null || !lectura) {
    filas.push(
      fila(
        "Cobrables",
        <>
          {cobrable != null && <b>{horasTxt(cobrable)}</b>}
          {notas.length > 0 && <span className="op">{` ${notas.join(" · ")}`}</span>}
          {!lectura && (
            <span className="cot-acciones" {...UI}>
              {" "}
              <span className="cot-sep">·</span>
              {"pactar "}
              <CampoHorasPactadas
                variante="hoja"
                id="cobrable-field"
                valor={cobrablePactadoHr}
                onChange={onCobrablePactado}
                placeholder="2:20"
                aria-label="Cobrable pactado (hr; acepta 2:20)"
                title="Vacío = la regla del motor (vuelo + calzos + sobrevuelo, mínimo 1 hr). Acepta decimal o h:mm."
                tarifaUsdHr={b?.tarifa.usd_por_hora ?? null}
                importeUsd={b?.totales.subtotal_vuelo_usd ?? null}
                // El breakdown va un debounce atrás: el importe solo se
                // enseña cuando corresponde a las horas que se ven (4
                // decimales, que es lo que devuelve un API sin desplegar).
                importeVigente={
                  !!b &&
                  b.tiempos.cobrable_proviene_de_override === true &&
                  mismasHoras(b.tiempos.cobrable_hr, cobrablePactadoHr, HORAS_EPSILON_4)
                }
              />
              {avisosHoras.map((a) => (
                <span key={a} className="cot-aviso">
                  {a}
                </span>
              ))}
            </span>
          )}
        </>,
        "cobrables",
        cobrable == null,
      ),
    );
  }
  if (tarifaHr != null) filas.push(fila("Tarifa", `${moneyInterno(tarifaHr)}/hr`, "tarifa"));
  if (filas.length === 0) return null;

  return (
    <>
      <h2>Horas cotizadas</h2>
      <table className="kv">
        <tbody>{filas}</tbody>
      </table>
    </>
  );
}
