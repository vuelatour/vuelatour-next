/**
 * Filas de la bandeja para las pruebas de la selección y de «Omitir la
 * conciliación» (14-oct-2026, API 0.0.77). Casos reales del 24-sep (GASTOS
 * GNRAL): la comisión y su IVA, el SPEI a otro banco y el abono «CARGO
 * INDEBIDO»; más un clasificado y un cargo ligado a su gasto (no
 * seleccionables). SIN la llave `omision` = la forma del API ≤ 0.0.76: con
 * ellas se congeló el HTML de la tabla ANTES de la selección
 * (`seleccion.golden.html`).
 */
import type { MovimientoBancario, MovimientoGasto, OmisionMovimiento } from "@/types/conciliacion";

export const CUENTA_GASTOS = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
export const CUENTA_HSBC_USD = "5b0c2a10-1111-4c4c-9d9d-0123456789ab";

export const ALIAS_CUENTAS: Record<string, string> = {
  [CUENTA_GASTOS]: "GASTOS GNRAL",
  [CUENTA_HSBC_USD]: "HSBC USD",
};
export const MONEDA_CUENTAS: Record<string, string> = {
  [CUENTA_GASTOS]: "MXN",
  [CUENTA_HSBC_USD]: "USD",
};

export const ID_IVA = "e1173c41-0000-4000-8000-000000000001";
export const ID_SPEI = "e4bd3023-0000-4000-8000-000000000002";
export const ID_ABONO = "a2a2a2a2-0000-4000-8000-000000000003";
export const ID_CLASIF = "c1c1c1c1-0000-4000-8000-000000000004";
export const ID_LIGADO = "d4d4d4d4-0000-4000-8000-000000000005";
export const ID_USD = "734adcd3-0000-4000-8000-000000000006";
export const ID_OMITIDO = "0e0e0e0e-0000-4000-8000-000000000007";

const base = (id: string, m: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
  id,
  cuenta_bancaria_id: CUENTA_GASTOS,
  fecha: "2026-09-24",
  tipo: "CARGO",
  monto: "1.12",
  descripcion: "IVA - COMISIONES",
  referencia: null,
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORTADO",
  notas: null,
  created_at: "2026-09-29T15:00:00Z",
  ...m,
});

const gastoLigado: MovimientoGasto = {
  id: "9a9a9a9a-0000-4000-8000-000000000360",
  monto: "2231.38",
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-09-24",
  vuelo_id: "7d50c91c-0000-4000-8000-000000000360",
  vuelo: { folio: 360 },
  proveedor: null,
};

/** Las cinco filas en la forma del API ≤ 0.0.76 (sin la llave `omision`). */
export function filasSinOmision(): MovimientoBancario[] {
  return [
    base(ID_IVA),
    base(ID_SPEI, { monto: "7.00", descripcion: "TRANSF ENVIO SPEI BCA INTERNET" }),
    base(ID_ABONO, {
      fecha: "2026-09-23",
      tipo: "ABONO",
      monto: "825.13",
      descripcion: "CARGO INDEBIDO 21 SEP 35552",
    }),
    base(ID_CLASIF, {
      fecha: "2026-09-22",
      monto: "150.00",
      descripcion: "ESTACIONAMIENTO PLAZA",
      conciliado: true,
      clasificacion_id: "c1a51f00-0000-4000-8000-000000000001",
      clasificacion: { nombre: "Estacionamiento" },
      notas: "Pensión de la camioneta",
    }),
    base(ID_LIGADO, {
      fecha: "2026-09-24",
      monto: "2231.38",
      descripcion: "SPEI BANORTE FACT VIP 7360",
      conciliado: true,
      gasto_id: gastoLigado.id,
      gasto: gastoLigado,
    }),
  ];
}

/** La línea firmada de una omisión leída por el API. */
export const OMISION_IVA: OmisionMovimiento = {
  motivo: "Comisión o IVA del banco",
  por: "Alejandro Canales",
  fecha: "14-oct-2026",
};

/** Las mismas filas como las manda el API 0.0.77 (`omision` SIEMPRE presente). */
export function filasConOmision(): MovimientoBancario[] {
  return filasSinOmision().map((m) => ({ ...m, omision: null }));
}

/** Un cargo en dólares pendiente (HSBC USD 01-oct) con la llave `omision`. */
export function cargoUsd(): MovimientoBancario {
  return base(ID_USD, {
    cuenta_bancaria_id: CUENTA_HSBC_USD,
    fecha: "2026-10-01",
    monto: "17.00",
    descripcion: "COMISION SPEI",
    omision: null,
  });
}

/** Un cargo OMITIDO (clasificación canónica + línea firmada). */
export function cargoOmitido(): MovimientoBancario {
  return base(ID_OMITIDO, {
    conciliado: true,
    clasificacion_id: "0a1b2c3d-0000-4000-8000-0000000000aa",
    clasificacion: { nombre: "Omitido de la conciliación" },
    notas: "Omitido de la conciliación: Comisión o IVA del banco — Alejandro Canales, 14-oct-2026",
    omision: OMISION_IVA,
  });
}
