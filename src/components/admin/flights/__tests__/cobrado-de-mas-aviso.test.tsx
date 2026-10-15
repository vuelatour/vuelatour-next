/**
 * «COBRADO DE MÁS» en la card (14-oct-2026, API 0.0.78, invariante 77):
 * `CobradoDeMasAviso` pinta `snapshot.cobrado_de_mas` tal cual — AVISO ámbar
 * visible (role="status", ⚠, «Qué hacer:» y el enlace al otro vuelo) cuando
 * requiere revisión; INFO en una línea gris cuando está explicado; nada sin
 * bloque (jamás se calcula en el panel).
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CobradoDeMasVuelo } from "@/types/flights";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const { CobradoDeMasAviso } = await import("../cobrado-de-mas-aviso");

const VUELO_332 = "5b6c7d8e-3332-4a7b-8c9d-0e1f2a3b4c5d";

const OTRO_VUELO: CobradoDeMasVuelo = {
  excedente_usd: 56.99,
  cobrado_usd: 4232.24,
  total_usd: 4175.25,
  causa: "OTRO_VUELO_DEL_CLIENTE",
  causa_etiqueta: "pago de otro vuelo del cliente",
  requiere_revision: true,
  tono: "AVISO",
  titulo: "Cobrado de más: $56.99 USD",
  explicacion:
    "Lo cobrado ($4,232.24 USD) rebasa el monto total ($4,175.25 USD). Posible causa: el cobro de $977.45 MXN del vuelo #332 del mismo cliente sigue sin banco y equivale a lo cobrado de más: puede que un cobro de este vuelo incluya el pago de ese vuelo.",
  que_hacer:
    "En Conciliación desvincula el depósito, corrige el cobro de este vuelo para que solo lleve lo suyo y vuelve a vincular el depósito marcando los cobros de los dos vuelos.",
  referencia: { vuelo_id: VUELO_332, folio: 332, cobro_id: "c-332", monto: 977.45, moneda: "MXN" },
  sin_tc: { n: 1, mxn: 3400 },
};

const COMISION: CobradoDeMasVuelo = {
  ...OTRO_VUELO,
  excedente_usd: 214.26,
  causa: "COMISION_PAGADA_POR_CLIENTE",
  causa_etiqueta: "comisión del link pagada por el cliente",
  requiere_revision: false,
  tono: "INFO",
  titulo: "Cobrado de más: $214.26 USD",
  explicacion:
    "Es la comisión del link de pago, que pagó el cliente: sin la comisión, lo cobrado cuadra con el total.",
  que_hacer: "No hay nada que corregir.",
  referencia: null,
  sin_tc: null,
};

describe("CobradoDeMasAviso", () => {
  it("AVISO: caja ámbar visible con role=status, ⚠, la causa, «Qué hacer:» y «Ver el vuelo #332»", () => {
    const html = renderToStaticMarkup(<CobradoDeMasAviso aviso={OTRO_VUELO} />);
    expect(html).toMatch(/^<div role="status" class="[^"]*border-amber-500\/50[^"]*bg-amber-500\/10/);
    expect(html).toContain('data-cobrado-de-mas="aviso"');
    expect(html).toContain("<svg");
    expect(html).toContain("Cobrado de más: $56.99 USD");
    expect(html).toContain("Posible causa: el cobro de $977.45 MXN del vuelo #332");
    expect(html).toContain('<span class="font-medium">Qué hacer:</span> En Conciliación desvincula el depósito');
    expect(html).toContain("Además hay 1 cobro en pesos sin T.C. ($3,400 MXN) que no entró a la cuenta.");
    expect(html).toMatch(
      new RegExp(`<a href="/admin/flights/${VUELO_332}#cobros" class="cursor-pointer[^"]*">Ver el vuelo #332</a>`),
    );
  });

  it("INFO (explicado): una línea gris, sin alerta ni ícono", () => {
    const html = renderToStaticMarkup(<CobradoDeMasAviso aviso={COMISION} />);
    expect(html).toBe(
      '<p class="text-[11px] text-muted-foreground" data-cobrado-de-mas="info">Cobrado de más: $214.26 USD — es la comisión del link de pago, que pagó el cliente: sin la comisión, lo cobrado cuadra con el total. No hay nada que corregir.</p>',
    );
    expect(html).not.toContain("role=");
  });

  it("sin bloque (sin aviso, API previo o rol de campo): nada", () => {
    expect(renderToStaticMarkup(<CobradoDeMasAviso aviso={null} />)).toBe("");
    expect(renderToStaticMarkup(<CobradoDeMasAviso aviso={undefined} />)).toBe("");
  });
});
