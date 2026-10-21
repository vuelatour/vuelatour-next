/**
 * PANTALLA POR AVIÓN del reparto (20-oct-2026, API 0.0.101, invariante 99),
 * marcado con `react-dom/server` + cableado leído del código:
 *  1. la cascada: con `reparto_como_balance` la fila «Provisión AFAC» RESTA
 *     (va ANTES del saldo, con su «−» y su sublabel) y la reserva de
 *     overhaul aparece DESPUÉS del saldo, aparte y marcada «no se resta»;
 *     sin la bandera, la reserva resta como siempre y no hay AFAC;
 *  2. la card resumida: AFAC en la cascada, reserva informativa, un renglón
 *     por socio con «A recibir» y su reserva, y «Ver detalle del avión →»;
 *  3. los gastos agrupados con subtotal y cuadre contra la cascada;
 *  4. los socios del avión: reserva a guardar con «se le descuenta» / «solo
 *     informativa», el control de ADMIN, entregado y por entregar DE ESTE
 *     AVIÓN, «Registrar entrega» y «Ver cuenta»; un SOCIO sin control;
 *  5. las entregas del avión y el histórico (columnas compactas, totales);
 *  6. el cableado de las dos páginas (lecturas, títulos, periodo validado).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AvionReparto, FilaGastoDetalle, MesHistoricoAvion, SocioAvionDetalle } from "@/types/profit-sharing";
import type { PagoSocio } from "@/types/reparto-pagos";
import type { ContextoEntrega, ContextoRegistro } from "@/lib/admin/reparto-pagos";
import { avionA, conPesos } from "./reparto-pesos.fixtures";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing/aviones/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
  configurarCuentaSocioAction: async () => ({ ok: true }),
  cambiarDescuentoReservaAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/reparto-pagos-browser", () => ({
  adjuntarComprobantePagoSocio: async () => ({ ok: true }),
}));
vi.mock("@/components/admin/excel-export-button", () => ({ ExcelExportButton: () => null }));

const { CascadaAvion } = await import("../cascada-avion");
const { AvionRepartoCard } = await import("../avion-reparto-card");
const { GastosAvionTable } = await import("../gastos-avion-table");
const { SociosAvionTable } = await import("../socios-avion-table");
const { EntregasAvionTable } = await import("../entregas-avion-table");
const { HistoricoAvionTable } = await import("../historico-avion-table");

const AV = "av-621";
const SOCIO = "50c10000-0000-4000-8000-000000000001";
const OTRO = "50c10000-0000-4000-8000-000000000002";
const OWNER = "0e0e0000-0000-4000-8000-000000000001";
const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
const REGISTRO: ContextoRegistro = { usuarios: [ALE], me: ALE, hoy: "2026-10-20", tcOficial: 18.45 };

/** N621TX con la cascada del balance: AFAC resta; la reserva (8,625 MXN) ya no. */
function avionBalance(): AvionReparto {
  const a = conPesos(avionA());
  return {
    ...a,
    saldo_disponible_usd: 8476.16,
    saldo_disponible_mxn: 150225.03,
    afac_reservado_usd: 200,
    afac_reservado_mxn: 3450,
    reserva_retenida_usd: 204.6,
    reserva_retenida_mxn: 3529.35,
    reparto: [
      { socio_id: SOCIO, socio_nombre: "Hernán Pérez", porcentaje: 40.92, utilidad_usd: 3468.44, utilidad_mxn: 61472.08, reserva_usd: 204.6, reserva_mxn: 3529.35, descuenta_reserva: true, monto_usd: 3263.84, monto_mxn: 57942.73 },
      { socio_id: OTRO, socio_nombre: "VuelaTour", porcentaje: 59.08, utilidad_usd: 5007.72, utilidad_mxn: 88752.95, reserva_usd: 295.4, reserva_mxn: 5095.65, descuenta_reserva: false, monto_usd: 5007.72, monto_mxn: 88752.95 },
    ],
    detalle: { ...a.detalle!, afac: { tarifa_usd_hr: 20, horas_cobradas_hr: 10, monto_usd: 200, monto_mxn: 3450 } },
  };
}

const gasto = (over: Partial<FilaGastoDetalle>): FilaGastoDetalle => ({
  id: "g-1",
  fecha: "2026-09-10",
  categoria: "GAS",
  etiqueta: "Combustible",
  clave: "GAS",
  grupo: "DIRECTO",
  concepto: "Turbosina CUN",
  vuelo: { id: "b2b2b2b2-0000-4000-8000-000000000301", folio: 301 },
  monto: 25000,
  moneda: "MXN",
  tc: null,
  descontado_mxn: 0,
  usd: 1449.28,
  mxn: 25000,
  tc_oficial: true,
  es_reparto_parcial: false,
  ...over,
});

const pos = (html: string, texto: string) => {
  const i = html.indexOf(texto);
  expect(i, texto).toBeGreaterThan(-1);
  return i;
};
const botones = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe("la cascada (CascadaAvion)", () => {
  const html = renderToStaticMarkup(<CascadaAvion avion={avionBalance()} enPesos comoBalance />);

  it("la fila «Provisión AFAC» RESTA (−$3,450.00 MXN, sublabel) y va ANTES del saldo", () => {
    const afac = pos(html, 'data-fila-cascada="afac"');
    const saldo = pos(html, 'data-fila-cascada="saldo"');
    expect(afac).toBeLessThan(saldo);
    expect(html).toMatch(/data-fila-cascada="afac" data-tipo="deduccion"/);
    expect(html).toContain(">Provisión AFAC<span");
    expect(html).toContain("$20 USD/hr × 10.00 hr cobradas");
    expect(html).toContain(">−$3,450.00 MXN<");
    expect(html).toContain(">≈ −$200 USD<");
    expect(html).toContain(">$150,225.03 MXN<");
  });

  it("la reserva de overhaul va DESPUÉS del saldo, aparte, marcada «no se resta», con lo que VuelaTour retiene; no está en la cascada", () => {
    const saldo = pos(html, 'data-fila-cascada="saldo"');
    const reserva = pos(html, "data-reserva-informativa");
    expect(reserva).toBeGreaterThan(saldo);
    expect(html).not.toContain('data-fila-cascada="reserva"');
    expect(html).toContain(">no se resta<");
    expect(html).toContain("No se resta del saldo: es lo que el avión debe guardar para su overhaul");
    expect(html).toContain("12.5 hr × $40/hr");
    expect(html).toContain(">$8,625.00 MXN<");
    expect(html).toContain("VuelaTour retiene $3,529.35 MXN");
    // La reserva no lleva «−»: no es una deducción.
    expect(html).not.toContain(">−$8,625.00 MXN<");
  });

  it("sin la bandera (API previo): la reserva resta al final y no hay AFAC", () => {
    const viejo = renderToStaticMarkup(<CascadaAvion avion={conPesos(avionA())} enPesos comoBalance={false} />);
    expect(viejo).toContain('data-fila-cascada="reserva" data-tipo="deduccion"');
    expect(viejo).toContain(">−$8,625.00 MXN<");
    expect(viejo).not.toContain('data-fila-cascada="afac"');
    expect(viejo).not.toContain("data-reserva-informativa");
  });
});

describe("la card resumida del reparto", () => {
  const html = renderToStaticMarkup(
    <AvionRepartoCard avion={avionBalance()} desde="2026-09-01" hasta="2026-09-30" rol="ADMIN" usuarioId={ALE.id} enPesos comoBalance />,
  );

  it("AFAC en la cascada, reserva informativa después del saldo y «Ver detalle del avión →»", () => {
    expect(pos(html, 'data-fila-cascada="afac"')).toBeLessThan(pos(html, 'data-fila-cascada="saldo"'));
    expect(pos(html, "data-reserva-informativa")).toBeGreaterThan(pos(html, 'data-fila-cascada="saldo"'));
    expect(html).toContain('data-accion="ver-detalle-avion"');
    expect(html).toContain('href="/admin/profit-sharing/aviones/av-621?desde=2026-09-01&amp;hasta=2026-09-30"');
    expect(html).toContain(">Ver detalle del avión<");
    // El desglose vuelo por vuelo ya no vive en la card.
    expect(html).not.toContain("Ver desglose del periodo");
    // La nota larga de la reserva no cabe en la card (compacta): queda en el
    // tooltip del bloque; la marca «no se resta» sí se ve.
    expect(html).toContain(">no se resta<");
    expect(html).not.toContain(">No se resta del saldo: es lo que el avión debe guardar");
    expect(html).toContain('title="No se resta del saldo: es lo que el avión debe guardar');
  });

  it("un renglón por socio con «A recibir» en pesos y su reserva: «se le descuenta» / «solo informativa»", () => {
    const ths = (html.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Socio", "%", "A recibir"]);
    expect(html).toContain(">$57,942.73 MXN<");
    expect(html).toContain(">$88,752.95 MXN<");
    expect(html).toMatch(/data-reserva-socio="descuenta"[^>]*>reserva \$3,529\.35 MXN · se le descuenta</);
    expect(html).toMatch(/data-reserva-socio="informativa"[^>]*>guardar \$5,095\.65 MXN · solo informativa</);
  });
});

describe("gastos del periodo (GastosAvionTable)", () => {
  const filas: FilaGastoDetalle[] = [
    gasto({}),
    gasto({ id: "g-2", fecha: "2026-09-12", categoria: "HOTEL", etiqueta: "Hotel", clave: "HOTEL", monto: 120, moneda: "USD", tc: 18.2, usd: 120, mxn: 2184, tc_oficial: false, es_reparto_parcial: true, descontado_mxn: 300 }),
    gasto({ id: "g-5", fecha: "2026-09-20", categoria: "TUAS", etiqueta: "TUA", clave: "TUAS (egreso VuelaTour — Otros movimientos)", grupo: "EXCLUIDO", monto: 1200, mxn: 1200, usd: 69.57, tc_oficial: false }),
  ];
  // Cascada: directos 70,740 MXN ⇒ con estas dos filas (27,184) NO cuadra: se dice.
  const html = renderToStaticMarkup(<GastosAvionTable avion={avionBalance()} filas={filas} enPesos />);

  it("un bloque por grupo, con fecha, categoría, concepto, vuelo enlazado, monto original, T.C. (badge oficial), pesos y dólares", () => {
    expect(html).toContain('data-grupo-gastos="DIRECTO"');
    expect(html).toContain('data-grupo-gastos="EXCLUIDO"');
    expect(html).not.toContain('data-grupo-gastos="INDIRECTO"');
    expect(html).toContain(">Gastos directos<span");
    expect(html).toContain('href="/admin/flights/b2b2b2b2-0000-4000-8000-000000000301"');
    expect(html).toContain(">#301<");
    expect(html).toContain(">$25,000 MXN<");
    expect(html).toContain(">$120 USD<");
    expect(html).toContain(">T.C. oficial<");
    expect(html).toContain(">parte repartida<");
    expect(html).toContain("−$300.00 MXN de TUA/extensión trasladados al pasajero");
    expect(html).toContain(">$1,449.28 USD<");
  });

  it("subtotal por grupo comparado con la fila de la cascada; los EXCLUIDOS con su motivo y tachados", () => {
    expect(html).toMatch(/data-subtotal-grupo="DIRECTO"[^>]*>\$27,184\.00 MXN</);
    expect(html).toContain('data-cuadre-grupo="diferencia"');
    expect(html).toContain("No cuadra con la fila «Gastos directos» de la cascada ($70,740.00 MXN): diferencia de -$43,556.00 MXN.");
    expect(html).toContain(">Por qué no resta<");
    expect(html).toContain("TUAS (egreso VuelaTour — Otros movimientos)");
    expect(html).toMatch(/line-through[^>]*>\$1,200\.00 MXN</);
    // Que cuadre se dice en gris.
    const cuadra = renderToStaticMarkup(
      <GastosAvionTable avion={{ ...avionBalance(), gastos: { ...avionBalance().gastos, directos_mxn: 27184 } }} filas={filas.slice(0, 2)} enPesos />,
    );
    expect(cuadra).toContain('data-cuadre-grupo="ok"');
    expect(cuadra).toContain("Cuadra con la fila «Gastos directos» de la cascada ($27,184.00 MXN).");
  });

  it("sin gastos lo dice", () => {
    expect(renderToStaticMarkup(<GastosAvionTable avion={avionBalance()} filas={[]} enPesos />)).toContain(
      "Sin gastos de este avión en el periodo.",
    );
  });
});

describe("socios de este avión (SociosAvionTable)", () => {
  const socios: SocioAvionDetalle[] = [
    { socio_id: SOCIO, socio_nombre: "Hernán Pérez", porcentaje: 40.92, utilidad_mxn: 61472.08, reserva_mxn: 3529.35, descuenta_reserva: true, monto_mxn: 57942.73, entregado_mxn: 20000, por_entregar_mxn: 37942.73, monto_usd: 3263.84, reserva_usd: 204.6 },
    { socio_id: OTRO, socio_nombre: "VuelaTour", porcentaje: 59.08, utilidad_mxn: 88752.95, reserva_mxn: 5095.65, descuenta_reserva: false, monto_mxn: 88752.95, entregado_mxn: 90000, por_entregar_mxn: -1247.05, monto_usd: 5007.72, reserva_usd: 295.4 },
  ];
  const contexto = (s: SocioAvionDetalle): ContextoEntrega => ({
    socio: { id: s.socio_id, nombre: s.socio_nombre },
    porEntregarMxn: 100,
    mesEnCursoMxn: 0,
    mesEnCurso: "2026-10",
    aviones: [{ id: AV, matricula: "N621TX", porcentaje: s.porcentaje, vigente: true }],
    cuentaDesdeMes: "2026-09",
    mesSugerido: "2026-09",
    avionSugerido: AV,
  });
  const filas = socios.map((s) => ({ socio: s, ownerIds: [OWNER], contexto: contexto(s) }));
  const html = renderToStaticMarkup(
    <SociosAvionTable aeronaveId={AV} matricula="N621TX" filas={filas} puedeCambiarReserva puedeRegistrar registro={REGISTRO} rol="ADMIN" usuarioId={ALE.id} />,
  );

  it("columnas en pesos: utilidad, reserva a guardar, a recibir, entregado y por entregar DE ESTE AVIÓN", () => {
    const ths = (html.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Socio", "%", "Utilidad", "Reserva a guardar", "A recibir", "Entregado (este avión)", "Por entregar (este avión)", "Acciones"]);
    expect(html).toContain(">$61,472.08 MXN<");
    expect(html).toMatch(/data-a-recibir="50c10000-0000-4000-8000-000000000001"[^>]*>\$57,942\.73 MXN</);
    expect(html).toContain(">$20,000.00 MXN<");
    expect(html).toMatch(/text-amber-700[^"]*"[^>]*data-por-entregar-avion="50c10000-0000-4000-8000-000000000001"[^>]*>\$37,942\.73 MXN</);
    // Se le entregó de más por este avión: en azul y dicho.
    expect(html).toMatch(/text-sky-700[^"]*"[^>]*data-por-entregar-avion="50c10000-0000-4000-8000-000000000002"[^>]*>\$1,247\.05 MXN de más</);
    expect(html).toContain("≈ $3,263.84 USD");
  });

  it("reserva: «se le descuenta» / «solo informativa» con el control de ADMIN («Cambiar»), «Registrar entrega» y «Ver cuenta»", () => {
    expect(html).toMatch(/data-reserva-socio="descuenta"[^>]*>se le descuenta</);
    expect(html).toMatch(/data-reserva-socio="informativa"[^>]*>solo informativa</);
    expect((html.match(/data-accion="cambiar-reserva-socio"/g) ?? []).length).toBe(2);
    expect((html.match(/data-accion="registrar-entrega-socio"/g) ?? []).length).toBe(2);
    expect((html.match(/data-accion="ver-cuenta-socio"/g) ?? []).length).toBe(2);
    expect(html).toContain(`href="/admin/profit-sharing/socios/${SOCIO}"`);
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("sin renglón de propietario: el badge y dónde cambiarlo; SOCIO: su renglón, sin control ni «Registrar entrega»", () => {
    const sinRenglon = renderToStaticMarkup(
      <SociosAvionTable aeronaveId={AV} matricula="N621TX" filas={[{ ...filas[0], ownerIds: [] }]} puedeCambiarReserva puedeRegistrar={false} registro={REGISTRO} rol="ADMIN" usuarioId={ALE.id} />,
    );
    expect(sinRenglon).not.toContain('data-accion="cambiar-reserva-socio"');
    expect(sinRenglon).toContain("(se cambia en la ficha del avión)");
    const socio = renderToStaticMarkup(
      <SociosAvionTable aeronaveId={AV} matricula="N621TX" filas={[{ ...filas[0], contexto: null }]} puedeCambiarReserva={false} puedeRegistrar={false} registro={REGISTRO} rol="SOCIO" usuarioId={SOCIO} />,
    );
    expect(socio).not.toContain('data-accion="cambiar-reserva-socio"');
    expect(socio).not.toContain('data-accion="registrar-entrega-socio"');
    expect(socio).toContain(`href="/admin/profit-sharing/socios/${SOCIO}"`);
    expect(socio).toMatch(/data-reserva-socio="descuenta"/);
  });
});

describe("entregas del avión (EntregasAvionTable)", () => {
  const ENTREGA: PagoSocio = {
    id: "9a9a0000-0000-4000-8000-000000000001",
    socio_id: SOCIO,
    aeronave_id: AV,
    periodo: "2026-09-01",
    mes: "2026-09",
    monto: 1000,
    moneda: "USD",
    tc_usd_mxn: null,
    monto_usd: 1000,
    monto_mxn: 18500,
    utilidad_snapshot_usd: null,
    saldo_snapshot_usd: null,
    saldo_snapshot_mxn: 37942.73,
    fecha_pago: "2026-10-05",
    metodo: "TRANSFERENCIA",
    referencia: "SPEI 123",
    entregado_por: ALE.id,
    entregado_por_nombre: "Alejandro Canales",
    recibido_por: null,
    factura_folio: null,
    comprobante_path: null,
    comprobante_url: null,
    notas: null,
    created_by: ALE.id,
    created_by_nombre: "Alejandro Canales",
    created_at: "2026-10-05T17:30:00Z",
    aeronave: { id: AV, matricula: "N621TX" },
  };
  const socios = [{ socio_id: SOCIO, socio_nombre: "Hernán Pérez" }];

  it("fecha, socio, monto EN PESOS (una en dólares dice «$1,000 USD = $18,500.00 MXN»), método, corresponde a, entregó y comprobante", () => {
    const html = renderToStaticMarkup(<EntregasAvionTable entregas={[ENTREGA]} socios={socios} puedeAdjuntar vacio="nada" />);
    const ths = (html.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Fecha", "Socio", "Monto (MXN)", "Método", "Corresponde a", "Entregó", "Comprobante"]);
    expect(html).toContain(">Hernán Pérez<");
    expect(html).toContain(">$18,500.00 MXN<");
    expect(html).toContain("$1,000 USD = $18,500.00 MXN");
    expect(html).toContain(">Transferencia<");
    expect(html).toContain(">Septiembre 2026<");
    expect(html).toContain("Entregó: Alejandro Canales");
    expect(html).toContain("Ref. SPEI 123");
    expect(html).toContain('data-accion="comprobante-entrega-socio"');
    const lectura = renderToStaticMarkup(<EntregasAvionTable entregas={[ENTREGA]} socios={socios} puedeAdjuntar={false} vacio="nada" />);
    expect(lectura).not.toContain('data-accion="comprobante-entrega-socio"');
  });

  it("sin entregas: el texto que le pasa la página", () => {
    expect(renderToStaticMarkup(<EntregasAvionTable entregas={[]} socios={socios} puedeAdjuntar vacio="Sin entregas que correspondan a este avión en el periodo." />)).toContain(
      "Sin entregas que correspondan a este avión en el periodo.",
    );
  });
});

describe("histórico mes a mes (HistoricoAvionTable)", () => {
  const mes = (over: Partial<MesHistoricoAvion>): MesHistoricoAvion => ({
    mes: "2026-09",
    en_curso: false,
    horas_voladas_hr: 12.5,
    vuelos: 3,
    cobrado_mxn: 210811.73,
    pendiente_cobro_mxn: 0,
    comisiones_mxn: 6210,
    directos_mxn: 70740,
    indirectos_mxn: 13800,
    permisos_mxn: 2587.5,
    otros_mxn: 10350,
    afac_mxn: 3450,
    otros_ingresos_mxn: 46550.8,
    saldo_mxn: 150225.03,
    reserva_mxn: 8625,
    reserva_retenida_mxn: 3529.35,
    entregado_mxn: 20000,
    pesos_sin_tc_usd: 0,
    saldo_usd: 8476.16,
    reparto: [],
    cierre_estado: "CERRADO",
    ...over,
  });
  const meses = [mes({}), mes({ mes: "2026-10", en_curso: true, cierre_estado: "ABIERTO", saldo_mxn: -100, pesos_sin_tc_usd: 12 })];
  const totales = { ...mes({}), horas_voladas_hr: 25, vuelos: 6 };
  const html = renderToStaticMarkup(<HistoricoAvionTable meses={meses} totales={totales} />);

  it("por defecto pocas columnas (mes, horas, vuelos, cobrado, saldo, reserva, entregado, cierre) y el botón para ver todas", () => {
    const ths = (html.match(/<th[^>]*>[\s\S]*?<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "").trim());
    expect(ths).toEqual(["Mes", "Horas", "Vuelos", "Cobrado", "Saldo", "Reserva a guardarno se resta", "Entregado", "Cierre"]);
    expect(html).toContain('data-accion="columnas-historico"');
    expect(html).toContain(">Ver todas las columnas<");
    expect(html).not.toContain(">Provisión AFAC<");
  });

  it("un renglón por mes (el en curso marcado y el estado del cierre) y la fila de totales", () => {
    expect(html).toContain('data-mes-historico="2026-09"');
    expect(html).toMatch(/data-mes-historico="2026-10" data-en-curso=""/);
    expect(html).toContain(">Octubre 2026 (en curso)");
    expect(html).toContain(">$210,811.73 MXN<");
    expect(html).toMatch(/text-emerald-700[^"]*"[^>]*>\$150,225\.03 MXN</);
    expect(html).toMatch(/text-destructive[^"]*"[^>]*>-\$100\.00 MXN</);
    expect(html).toContain(">Cerrado<");
    expect(html).toContain(">Abierto<");
    expect(html).toMatch(/data-total-historico="horas_voladas_hr"[^>]*>25\.0 hr</);
    expect(html).toMatch(/data-total-historico="vuelos"[^>]*>6</);
    expect(html).toContain("Total · 2 mes(es)");
    // Pesos incompletos en octubre: marcado junto al mes.
    expect(html).toContain('aria-label="Este mes tiene dólares que no se pudieron pasar a pesos');
  });

  it("sin meses lo dice", () => {
    expect(renderToStaticMarkup(<HistoricoAvionTable meses={[]} totales={totales} />)).toContain("Sin meses que mostrar en este rango.");
  });
});

describe("cableado de las páginas", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const detalle = leer("src/app/admin/profit-sharing/aviones/[id]/page.tsx");
  const historico = leer("src/app/admin/profit-sharing/aviones/[id]/historico/page.tsx");
  const reparto = leer("src/app/admin/profit-sharing/page.tsx");
  const ficha = leer("src/app/admin/aircraft/[id]/page.tsx");
  const tarjeta = leer("../avion-reparto-card.tsx".replace("../", "src/components/admin/profit-sharing/"));

  it("pantalla del avión: id uuid o notFound sin llamar, lecturas que nunca lanzan, periodo con la MISMA regla del reparto, título con datos", () => {
    expect(detalle).toMatch(/if \(!esUuid\(id\)\) notFound\(\);/);
    expect(detalle).toContain("getAvionDetalle(id, { desde, hasta })");
    expect(detalle).toContain('if (carga.estado === "no-existe") notFound();');
    expect(detalle).toContain("periodoRepartoDeUrl(sp, inicio, hoy)");
    expect(detalle).toContain("<TituloPestana titulo={tituloRepartoAvion(avion.aeronave.matricula, periodo.desde, periodo.hasta)} />");
    expect(detalle).toContain("<PeriodSelector initial={{ desde, hasta }} atajoMesPasado hoy={hoy} />");
    expect(detalle).toContain("<CascadaAvion avion={avion} enPesos={enPesos} comoBalance={comoBalance} />");
    expect(detalle).toContain("<GastosAvionTable avion={avion} filas={detalle?.gastos} enPesos={enPesos} />");
    expect(detalle).toContain("<DesgloseSection detalle={detalle} enPesos={enPesos} />");
    expect(detalle).toContain("<SociosAvionTable");
    expect(detalle).toContain("<EntregasAvionTable");
    // Los renglones de `aeronave_socio` (solo ADMIN) y la cuenta del socio son ACCESORIOS.
    expect(detalle).toContain('degradado.opcional("los propietarios del avión", listAircraftOwners(id, { history: true }), null)');
    expect(detalle).toContain("filasPropietarioDeSocio(propietarios, s.socio_id, periodo)");
    expect(detalle).toContain("contextoEntregaDesdeAvion(s, avion.aeronave, resumenPorSocio.get(s.socio_id) ?? null, {");
    expect(detalle).toContain("<TarjetaErrorCarga");
  });

  it("histórico: filtro de meses validado con el tope del API, lectura que nunca lanza, «Todo el histórico»", () => {
    expect(historico).toMatch(/if \(!esUuid\(id\)\) notFound\(\);/);
    expect(historico).toContain("filtroMesesHistorico(sp.desde, sp.hasta, mesHoy, inicio)");
    expect(historico).toContain("getAvionHistorico(id, filtro)");
    expect(historico).toContain("<TituloPestana titulo={tituloHistoricoAvion(datos.aeronave.matricula)} />");
    expect(historico).toContain("etiquetaTodo={ETIQUETA_TODO_EL_HISTORICO}");
    expect(historico).toContain("<HistoricoAvionTable meses={datos.meses} totales={datos.totales} />");
    expect(historico).toContain("{carga.filtroIgnorado && (");
  });

  it("la lista pasa `comoBalance` al KPI y a las cards; la card manda al detalle; la ficha del avión enlaza el reparto por mes", () => {
    expect(reparto).toContain("const comoBalance = repartoComoBalance(result);");
    expect(reparto).toMatch(/<KpiStrip[\s\S]*?comoBalance=\{comoBalance\}[\s\S]*?\/>/);
    expect(reparto).toMatch(/<AvionRepartoCard[\s\S]*?comoBalance=\{comoBalance\}[\s\S]*?\/>/);
    expect(tarjeta).toContain("hrefRepartoAvion(avion.aeronave.id, { desde, hasta })");
    expect(ficha).toContain("puedeVerRepartoAvion(me?.rol)");
    expect(ficha).toContain("hrefHistoricoAvion(aircraft.id)");
    expect(ficha).toContain("hrefRepartoAvion(aircraft.id)");
  });
});
