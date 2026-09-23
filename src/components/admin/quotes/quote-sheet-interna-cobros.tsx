"use client";

import { fmtTc } from "@/lib/format";
import { TITULO_REGISTRO_COBRO, textoRegistroCobro } from "@/lib/admin/cobros";
import { METODOS_PAGO, metodoPagoLabel } from "@/lib/admin/metodos-pago";
import {
  SIN_DATO,
  avisoCobrosSinTc,
  claseSemaforo,
  fechaCortaCobro,
  metodoPrevistoTxt,
  moneyInterno,
  montoInterno,
  pctBanco,
  piezasMetodoPrevisto,
  pctG,
  resumenCobros,
  subLineaCobro,
} from "@/lib/admin/quote-sheet-interna";
import type { MetodoPago } from "@/types/quote";
import type { CotizacionInterna } from "@/types/quotes-interno";
import { CampoHoja, CampoNumero, CampoSelect, UI } from "./quote-sheet-fields";

/**
 * COBROS de la hoja interna — réplica de `_cobros_html` de
 * `cotizacion_interna_pdf.py`: Fecha · Método (referencia en gris) · Bruto ·
 * Comisión banco · Neto · [Equiv. USD si algún cobro no es USD] · Conc., con
 * el pie «Cobrado · comisiones · neto · Saldo · ● semáforo» y la fila roja de
 * los cobros en pesos sin T.C.
 *
 * El `<h2>` lleva el MÉTODO PREVISTO («Cobros · previsto: Transferencia ·
 * comisión terminal 8.857 %»), también cuando no hay ningún cobro: en el 19 %
 * de las cotizaciones no hay cobros registrados y ese campo es el que explica
 * por qué la cotización lleva IVA 16 % o 0 % (riesgo 5 del diseño).
 *
 * Desde la Fase 2.3 esa frase SE EDITA en su sitio: el método es un
 * `CampoSelect` (`metodo-pago-field`, fuente única `METODOS_PAGO`), con
 * «¿cuál?» al lado cuando es OTRO y el % de terminal (`billpocket-field`)
 * dentro de la misma frase. El texto impreso es el MISMO —las piezas salen de
 * `piezasMetodoPrevisto`—; lo que cambia es que ya no hay que abrir un panel
 * lateral para decidir si la cotización lleva IVA.
 *
 * TODOS los números llegan del API (`GET /v1/quotes/:id/interno`): bruto,
 * comisión, neto, equivalente en USD, saldo y semáforo. Aquí no se suma nada.
 *
 * «Registró: Itzi» es el ÚNICO renglón que no está en el papel: el PDF no lo
 * imprime, así que va marcado `data-cot-ui` (croma de pantalla) con la fuente
 * única `textoRegistroCobro` — sin nombre no hay renglón, nunca un «—» ni un
 * uuid crudo.
 *
 * Ancla `#cobros-vuelo`: la conserva la card del workspace (la usa la banda
 * del 409 `COTIZACION_COBRADA`), así que aquí NO se repite.
 */
export interface QuoteSheetInternaCobrosProps {
  interno: CotizacionInterna | null;
  /** Bloqueada: la frase del método se imprime como texto, sin controles. */
  lectura?: boolean;
  /**
   * Método PREVISTO del formulario (lo que decide el IVA). Es el vivo: el de
   * `interno` es el de la versión guardada y solo sirve de respaldo.
   */
  metodo?: MetodoPago | null;
  metodoDetalle?: string;
  comisionPct?: number | null;
  onMetodo?: (v: MetodoPago) => void;
  onMetodoDetalle?: (v: string) => void;
  onComisionPct?: (v: number | null) => void;
  /** id ancla del selector del método (`metodo-pago-field`). */
  idMetodo?: string;
  /** id ancla del % de terminal (`billpocket-field`). */
  idComision?: string;
}

export function QuoteSheetInternaCobros({
  interno,
  lectura = false,
  metodo = null,
  metodoDetalle = "",
  comisionPct = null,
  onMetodo,
  onMetodoDetalle,
  onComisionPct,
  idMetodo = "metodo-pago-field",
  idComision = "billpocket-field",
}: QuoteSheetInternaCobrosProps) {
  const cobros = interno?.cobros ?? [];
  const conUsd = cobros.some((c) => (c.moneda || "USD").toUpperCase() !== "USD");
  const ncols = conUsd ? 7 : 6;
  // El método que MANDA es el del formulario (se edita aquí); `interno` es el
  // respaldo para un API previo o para la hoja sin cotizador detrás.
  const metodoLabel = metodo
    ? metodoPagoLabel(metodo, metodoDetalle)
    : (interno?.metodo_cobro_label ?? interno?.metodo_cobro ?? null);
  const pctPrevisto = metodo ? comisionPct : (interno?.comision_billpocket_pct ?? null);
  const previsto = metodoPrevistoTxt({
    metodoLabel,
    comisionBillpocketPct: pctPrevisto,
  });
  const piezas = piezasMetodoPrevisto({ metodoLabel, comisionBillpocketPct: pctPrevisto });
  // El % de terminal solo se CAPTURA con BillPocket (mismo candado que tenía
  // el panel): el de Paywise lo pone la configuración del sistema y aquí solo
  // se lee.
  const pctEditable = !lectura && metodo === "BILLPOCKET" && !!onComisionPct;
  const editable = !lectura && !!onMetodo && !!piezas;

  const filas =
    cobros.length > 0 ? (
      cobros.map((c, i) => {
        const moneda = (c.moneda || "USD").toUpperCase();
        // La MONEDA del cobro va en gris junto al importe, igual que en el
        // papel (`_cobro_fila`: `<span class="muted">MXN</span>`): como texto
        // plano decía lo mismo pero la fila dejaba de tener la misma
        // estructura que el documento.
        const sufijo =
          moneda === "USD" ? null : <span className="muted">{` ${moneda}`}</span>;
        const sub = subLineaCobro(c);
        const registro = textoRegistroCobro({ registrado_por_nombre: c.registrado_por });
        let comision = SIN_DATO;
        if (c.comision_pct != null || c.comision_monto) {
          const pct = c.comision_pct != null ? pctBanco(c.comision_pct) : "";
          comision = c.comision_monto
            ? `${pct} = ${moneyInterno(c.comision_monto)}`.replace(/^ = /, "")
            : pct;
        }
        // `cobrosEnUsd`: un cobro en USD vale su bruto; uno en MXN sin ningún
        // T.C. queda FUERA de la suma y se marca (nunca desaparece en silencio).
        const montoUsd = c.monto_usd ?? (moneda === "USD" ? c.monto : null);
        return (
          <tr key={i}>
            <td>{fechaCortaCobro(c.fecha)}</td>
            <td>
              {c.metodo_label || c.metodo || SIN_DATO}
              {sub && (
                <>
                  <br />
                  <span className="muted">{sub}</span>
                </>
              )}
              {registro && (
                <span className="muted" title={TITULO_REGISTRO_COBRO} {...UI}>
                  <br />
                  {registro}
                </span>
              )}
            </td>
            <td className="num">
              {montoInterno(c.monto)}
              {sufijo}
            </td>
            <td className="num">{comision}</td>
            <td className="num">
              {c.neto != null ? (
                <>
                  {montoInterno(c.neto)}
                  {sufijo}
                </>
              ) : (
                SIN_DATO
              )}
            </td>
            {conUsd && (
              <td className="num">
                {montoUsd != null ? (
                  <>
                    {montoInterno(montoUsd)}
                    {c.tc && moneda !== "USD" && (
                      <span className="muted">{` T.C. ${fmtTc(c.tc)}`}</span>
                    )}
                  </>
                ) : (
                  <span className="rojo">sin T.C.</span>
                )}
              </td>
            )}
            <td>
              {c.conciliado == null ? (
                SIN_DATO
              ) : c.conciliado ? (
                <span className="verde">Sí</span>
              ) : (
                "No"
              )}
            </td>
          </tr>
        );
      })
    ) : (
      <tr>
        <td colSpan={ncols} className="muted">
          {`Sin cobros registrados.${previsto ? ` · ${previsto}` : ""}`}
        </td>
      </tr>
    );

  const resumen = resumenCobros({
    totalCobradoUsd: interno?.total_cobrado_usd ?? 0,
    comisionBancoUsd: interno?.comision_banco_usd ?? null,
    totalCobradoNetoUsd: interno?.total_cobrado_neto_usd ?? null,
    saldoUsd: interno?.saldo_usd ?? null,
  });
  const semLabel =
    interno?.semaforo_cobro_label ||
    (interno?.semaforo_cobro_key || SIN_DATO).replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
  const aviso = avisoCobrosSinTc(
    interno?.cobros_sin_tc_count ?? 0,
    interno?.cobros_sin_tc_mxn ?? 0,
  );

  return (
    <div>
      <h2>
        Cobros
        {piezas &&
          (editable ? (
            <span className="op">
              {" "}
              {piezas.antes}
              <CampoSelect
                id={idMetodo}
                options={METODOS_PAGO.map((m) => ({
                  value: m.value,
                  label: m.label,
                  description: m.hint,
                  // OTRO se IMPRIME con su nombre manual («Otro (PayPal)»),
                  // que es lo que dice el papel.
                  textoImpreso:
                    m.value === "OTRO" ? metodoPagoLabel("OTRO", metodoDetalle) : m.label,
                }))}
                value={metodo}
                onChange={(v) => onMetodo?.(v as MetodoPago)}
                placeholder="Selecciona método"
                searchPlaceholder="Buscar método…"
                ariaLabel="Método de cobro previsto"
                title="Decide el IVA (16 % con factura). Es lo PREVISTO: el método real es el de cada cobro registrado."
              />
              {metodo === "OTRO" && onMetodoDetalle && (
                <span className="cot-acciones" {...UI}>
                  {" "}
                  <span className="cot-sep">·</span>
                  <CampoHoja
                    value={metodoDetalle}
                    onChange={onMetodoDetalle}
                    placeholder="¿cuál método?"
                    ariaLabel="¿Cuál método de pago? (nombre manual)"
                    title="Escríbelo tal como quieren verlo (ej. PayPal, depósito en ventanilla)"
                    maxLength={80}
                    minCh={10}
                  />
                </span>
              )}
              {piezas.pctAntes}
              {piezas.pct &&
                (pctEditable ? (
                  <CampoNumero
                    id={idComision}
                    value={Number(pctPrevisto) || null}
                    onChange={(n) =>
                      onComisionPct?.(n == null ? null : Math.min(20, Math.max(0, n)))
                    }
                    formato={pctG}
                    placeholder="9"
                    ariaLabel="Comisión de terminal (%)"
                    title="Custom por operación · tope 20 % · sin IVA · sale como línea «Comisión BillPocket»"
                    min={0}
                    max={20}
                    minCh={3}
                  />
                ) : (
                  piezas.pct
                ))}
              {piezas.pctDespues}
              {/* BillPocket SIN % capturado: el hueco para teclearlo existe,
                  pero no se imprime (el papel no dice «comisión terminal» sin
                  porcentaje). */}
              {pctEditable && !piezas.pct && (
                <span className="cot-acciones" {...UI}>
                  {" · comisión terminal "}
                  <CampoNumero
                    id={idComision}
                    value={null}
                    onChange={(n) =>
                      onComisionPct?.(n == null ? null : Math.min(20, Math.max(0, n)))
                    }
                    formato={pctG}
                    placeholder="9"
                    ariaLabel="Comisión de terminal (%)"
                    title="Custom por operación · tope 20 % · sin IVA · sale como línea «Comisión BillPocket»"
                    min={0}
                    max={20}
                    minCh={3}
                  />
                  {" %"}
                </span>
              )}
            </span>
          ) : (
            previsto && <span className="op">{` ${previsto}`}</span>
          ))}
      </h2>
      <table className="grid">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Método</th>
            <th className="num">Bruto</th>
            <th className="num">Comisión banco</th>
            <th className="num">Neto</th>
            {conUsd && <th className="num">Equiv. USD</th>}
            <th>Conc.</th>
          </tr>
        </thead>
        <tbody>{filas}</tbody>
        <tfoot>
          <tr>
            <td colSpan={ncols}>
              {resumen.join(" · ")}
              {" · "}
              <span className={`sem ${claseSemaforo(interno?.semaforo_cobro)}`} />
              {semLabel}
            </td>
          </tr>
          {aviso && (
            <tr>
              <td colSpan={ncols} className="rojo aviso">
                {aviso}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
