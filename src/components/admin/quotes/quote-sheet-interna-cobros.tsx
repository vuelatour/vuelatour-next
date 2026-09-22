"use client";

import { fmtTc } from "@/lib/format";
import { TITULO_REGISTRO_COBRO, textoRegistroCobro } from "@/lib/admin/cobros";
import {
  SIN_DATO,
  avisoCobrosSinTc,
  claseSemaforo,
  fechaCortaCobro,
  metodoPrevistoTxt,
  moneyInterno,
  montoInterno,
  pctBanco,
  resumenCobros,
  subLineaCobro,
} from "@/lib/admin/quote-sheet-interna";
import type { CotizacionInterna } from "@/types/quotes-interno";
import { UI } from "./quote-sheet-fields";

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
 * por qué la cotización lleva IVA 16 % o 0 % (riesgo 5 del diseño). Es lo
 * único de este bloque que la Fase 2.2 NO edita todavía — el método sigue
 * capturándose en el panel interno hasta la Fase 2.3.
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
export function QuoteSheetInternaCobros({ interno }: { interno: CotizacionInterna | null }) {
  const cobros = interno?.cobros ?? [];
  const conUsd = cobros.some((c) => (c.moneda || "USD").toUpperCase() !== "USD");
  const ncols = conUsd ? 7 : 6;
  const previsto = metodoPrevistoTxt({
    metodoLabel: interno?.metodo_cobro_label ?? null,
    metodo: interno?.metodo_cobro ?? null,
    comisionBillpocketPct: interno?.comision_billpocket_pct ?? null,
  });

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
        {previsto && <span className="op">{` ${previsto}`}</span>}
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
