"use client";

import { useState } from "react";
import { CheckCircleIcon, ChevronDownIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { fmtMontoUnitario } from "@/lib/admin/extras";
import {
  etiquetaParteAvion,
  textoAvionesExentos,
  textoOperacionTuasAvion,
} from "@/lib/admin/grupos-ui";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConsolidadoTuas, TuasAeropuertoConsolidado } from "@/types/grupos";
import type { TuaLinea } from "@/types/quote";

export type TuaGrupoOnChange = (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;

/**
 * Apartado «TUAS por aeropuerto» de la cotización de GRUPO — misma
 * presentación que la card del cotizador de un avión: por aeropuerto una
 * fila con pax gravados × tarifa unitaria (moneda), los aviones exentos
 * por prefijo de matrícula en muted, el total y un desplegable «por
 * avión». Todo número viene del API (`consolidado.tuas`); aquí solo se
 * pinta. Con `onChange` la fila es EDITABLE (mismos controles del
 * cotizador: monto por pasajero + moneda; vacío = catálogo, $0 = el
 * aeropuerto no cobra); sin él es solo lectura (detalle del grupo).
 */
export function TuasGrupoCard({
  tuas,
  tuasLineas,
  onChange,
  tcCapturado,
  onFocusTc,
  stale = false,
  disabled = false,
  paseAbordar = false,
  vacio,
}: {
  /** `consolidado.tuas` del armado/detalle; null = aún sin cálculo. */
  tuas: ConsolidadoTuas | null;
  /** Líneas capturadas (form del wizard o `grupo.tuas_lineas`). */
  tuasLineas: TuaLinea[];
  /** Presente ⇒ editable. */
  onChange?: TuaGrupoOnChange;
  tcCapturado: boolean;
  /** Abre la sección donde vive el campo de TC (wizard). */
  onFocusTc?: () => void;
  stale?: boolean;
  disabled?: boolean;
  paseAbordar?: boolean;
  /** Texto cuando aún no hay cálculo. */
  vacio?: string;
}) {
  const editable = !!onChange && !disabled;
  const lineaPorIata = new Map(tuasLineas.map((l) => [l.iata.toUpperCase(), l]));

  return !tuas ? (
    <p className="text-xs text-muted-foreground">{vacio ?? "Sin desglose de TUAS."}</p>
  ) : tuas.aeropuertos.length === 0 ? (
    <p className="text-xs text-muted-foreground">
      Ningún aeropuerto del itinerario cobra TUA a este grupo.
    </p>
  ) : (
    <div className={cn("space-y-3 transition-opacity", stale && "opacity-60")}>
      {paseAbordar && (
        <p className="text-xs text-muted-foreground">
          Pase de abordar: el grupo va exento de TUAS (excepto CZM).
        </p>
      )}
      {tuas.aeropuertos.map((ap) => (
        <TuasGrupoAeropuertoRow
          key={ap.iata}
          ap={ap}
          linea={lineaPorIata.get(ap.iata.toUpperCase())}
          editable={editable}
          tcCapturado={tcCapturado}
          onChange={onChange}
          onFocusTc={onFocusTc}
        />
      ))}
      <div className="pt-3 border-t border-border space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Total TUAS</span>
          <span className="font-bold font-mono">{fmtUsd(tuas.total_usd)}</span>
        </div>
        {tuas.total_mxn_nativo > 0 && (
          <p className="text-right text-xs text-muted-foreground">
            incluye {fmtMxn(tuas.total_mxn_nativo)} nativos — entran al total MXN en pesos tal cual
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Fila de un aeropuerto: cuenta explícita «N × unitario = total» (la
 * oficina ve de dónde sale el número), exentos en muted y «por avión».
 */
function TuasGrupoAeropuertoRow({
  ap,
  linea,
  editable,
  tcCapturado,
  onChange,
  onFocusTc,
}: {
  ap: TuasAeropuertoConsolidado;
  linea?: TuaLinea;
  editable: boolean;
  tcCapturado: boolean;
  onChange?: TuaGrupoOnChange;
  onFocusTc?: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  // Moneda elegida antes de capturar monto (sin monto aún no viaja la línea).
  const [monedaDraft, setMonedaDraft] = useState<"USD" | "MXN">(
    linea?.moneda ?? (ap.moneda === "MXN" ? "MXN" : "USD"),
  );
  const moneda = linea?.moneda ?? monedaDraft;
  const capturada = !!linea;
  const gravado = ap.pax_gravados > 0;
  const exentos = textoAvionesExentos(ap);
  const detalle = ap.detalle_por_avion ?? [];

  const handleMonto = (raw: string) => {
    if (!onChange) return;
    // Vacío = des-capturar (vuelve al catálogo). "0" = TUA capturada en $0
    // (el aeropuerto no cobra) — SÍ viaja al motor.
    if (raw.trim() === "") {
      onChange(ap.iata, null, moneda);
      return;
    }
    const n = Number(raw);
    onChange(ap.iata, Number.isFinite(n) && n >= 0 ? n : null, moneda);
  };
  const handleMoneda = (m: "USD" | "MXN") => {
    setMonedaDraft(m);
    if (linea && onChange) onChange(ap.iata, linea.monto_pax, m);
  };

  return (
    <div className={cn("rounded-lg border border-border p-2.5 space-y-1.5", !gravado && "opacity-70")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 text-sm font-medium">
          {gravado ? (
            <CheckCircleIcon className="h-4 w-4 text-green-600 shrink-0" />
          ) : (
            <XCircleIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-mono">{ap.iata}</span>
          {capturada && (
            <Badge variant="outline" className="text-[10px]">
              {linea!.monto_pax === 0 ? "TUA en $0 (capturada)" : "monto capturado"}
            </Badge>
          )}
        </span>
        {/* Cuenta EXPLÍCITA con los campos del API: pax gravados × unitario
            (uniforme) = total; sin unitario uniforme manda el «por avión». */}
        <span className="font-mono text-sm">
          {gravado ? (
            <>
              <span className="text-xs text-muted-foreground">
                {ap.unitario != null
                  ? `${ap.pax_gravados} × ${fmtMontoUnitario(ap.unitario, ap.moneda)} = `
                  : `${ap.pax_gravados} pax · unitario distinto por avión = `}
              </span>
              {ap.moneda === "MXN" && ap.total_nativo != null ? (
                <>
                  {fmtMxn(ap.total_nativo)}
                  <span className="ml-1.5 text-xs text-muted-foreground">= {fmtUsd(ap.monto_usd)}</span>
                </>
              ) : (
                fmtUsd(ap.monto_usd)
              )}
            </>
          ) : (
            "$0"
          )}
        </span>
      </div>
      {onChange && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            min={0}
            className="h-8 w-28"
            disabled={!editable}
            defaultValue={linea ? String(linea.monto_pax) : ""}
            placeholder={ap.unitario != null && ap.unitario > 0 ? ap.unitario.toFixed(2) : "0.00"}
            aria-label={`TUA por pasajero en ${ap.iata}`}
            onChange={(ev) => handleMonto(ev.target.value)}
          />
          <MonedaSelect value={moneda} onChange={handleMoneda} disabled={!editable} />
          <span className="text-xs text-muted-foreground">
            por pax × {ap.pax_gravados} pax
          </span>
        </div>
      )}
      {exentos && (
        <p className="text-xs text-muted-foreground">
          {exentos} · {ap.pax_exentos} pax
          {ap.aviones_exentos[0]?.razon ? ` · ${ap.aviones_exentos[0].razon}` : ""}
        </p>
      )}
      {detalle.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Por avión
            <ChevronDownIcon className={cn("h-3 w-3 transition-transform", abierta && "rotate-180")} />
          </button>
          {abierta && (
            <ul className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3 text-xs">
              {detalle.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-muted-foreground">
                    {etiquetaParteAvion(d)}
                    <span className="ml-1 font-mono text-[10px]">· {textoOperacionTuasAvion(d)}</span>
                  </span>
                  <span className="font-mono shrink-0">{fmtUsd(d.monto_usd)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* Solo con línea CAPTURADA > 0 en MXN y sin TC: la línea se retiene
          fuera del cálculo hasta capturar el TC. */}
      {capturada && linea!.monto_pax > 0 && moneda === "MXN" && !tcCapturado && editable && (
        <button
          type="button"
          onClick={onFocusTc}
          className="text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
        >
          Captura el tipo de cambio en «Cliente y grupo» — sin TC esta TUA en pesos no entra al
          total.
        </button>
      )}
    </div>
  );
}
