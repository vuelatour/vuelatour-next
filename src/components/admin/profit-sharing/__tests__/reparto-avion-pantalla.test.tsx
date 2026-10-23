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
import { avionA, avionCombustible, conPesos, sinCombustible } from "./reparto-pesos.fixtures";

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
const { Pestanas } = await import("../../pestanas");
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

  it("CIERRE POR AVIÓN (API 0.0.104): con `cierre_avion` la card pinta el estado de ESE avión (y el aviso si no coincide con su snapshot); sin él, nada", () => {
    // Sin la llave (API previo): ningún chip de estado en la card.
    expect(html).not.toContain("data-estado-cierre");
    const cerrado = renderToStaticMarkup(
      <AvionRepartoCard
        avion={{ ...avionBalance(), cierre_avion: { estado: "CERRADO", cerrado_at: "2026-10-16T19:02:00Z", cerrado_por_nombre: "Ale", coincide_con_snapshot: false } }}
        desde="2026-09-01"
        hasta="2026-09-30"
        rol="ADMIN"
        usuarioId={ALE.id}
        enPesos
        comoBalance
      />,
    );
    expect(cerrado).toContain('data-estado-cierre="cerrado"');
    expect(cerrado).toContain("Cerrado el 16-oct-2026 por Ale");
    expect(cerrado).toContain('data-no-coincide-snapshot="N621TX"');
    expect(cerrado).toContain(">No coincide con el cierre<");
    const abierto = renderToStaticMarkup(
      <AvionRepartoCard avion={{ ...avionBalance(), cierre_avion: { estado: "ABIERTO" } }} desde="2026-09-01" hasta="2026-09-30" rol="ADMIN" usuarioId={ALE.id} enPesos comoBalance />,
    );
    expect(abierto).toContain('data-estado-cierre="abierto"');
    expect(abierto).not.toContain("data-no-coincide-snapshot");
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
  // Desde el 23-oct-2026 los grupos van en pastillas y se pinta UNA tabla a la
  // vez: el primer grupo con gastos por default; los demás, con `grupoInicial`.
  const excluidos = renderToStaticMarkup(
    <GastosAvionTable avion={avionBalance()} filas={filas} enPesos grupoInicial="EXCLUIDO" />,
  );

  it("una pastilla por grupo con gastos (solo esos) y una tabla a la vez; la tabla con fecha, categoría, concepto, vuelo enlazado, monto original, T.C. (badge oficial), pesos y dólares", () => {
    expect(html).toContain('data-pestanas="secundaria"');
    expect(html).toContain('role="tablist" aria-label="Grupos de gastos"');
    expect(html).toMatch(/data-pestana="DIRECTO" data-activa=""/);
    expect(html).toContain('data-pestana="EXCLUIDO"');
    expect(html).not.toContain('data-pestana="INDIRECTO"');
    const texto = html.replace(/<[^>]+>/g, "");
    expect(texto).toContain("Directos (2)");
    expect(texto).toContain("No restan (1)");
    expect(html).toContain('data-grupo-gastos="DIRECTO"');
    expect(html).not.toContain('data-grupo-gastos="EXCLUIDO"');
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

  it("subtotal por grupo comparado con la fila de la cascada; los EXCLUIDOS (en su pastilla) con su motivo y tachados", () => {
    expect(html).toMatch(/data-subtotal-grupo="DIRECTO"[^>]*>\$27,184\.00 MXN</);
    expect(html).toContain('data-cuadre-grupo="diferencia"');
    expect(html).toContain("No cuadra con la fila «Gastos directos» de la cascada ($70,740.00 MXN): diferencia de -$43,556.00 MXN.");
    expect(excluidos).toMatch(/data-pestana="EXCLUIDO" data-activa=""/);
    expect(excluidos).toContain('data-grupo-gastos="EXCLUIDO"');
    expect(excluidos).not.toContain('data-grupo-gastos="DIRECTO"');
    expect(excluidos).toContain(">Por qué no resta<");
    expect(excluidos).toContain("TUAS (egreso VuelaTour — Otros movimientos)");
    expect(excluidos).toMatch(/line-through[^>]*>\$1,200\.00 MXN</);
    expect(excluidos).not.toContain("data-cuadre-grupo");
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

  it("combustible separado (API 0.0.103): las dos páginas leen la bandera con la fuente única; leyenda y ayudas condicionadas", () => {
    expect(reparto).toContain("const conCombustible = result.aviones.some(combustibleSeparado);");
    expect(reparto).toContain("{conCombustible && <p>{NOTA_COMBUSTIBLE_SEPARADO}</p>}");
    expect(detalle).toContain("const conCombustible = combustibleSeparado(avion);");
    expect(detalle).toContain("{conCombustible && <p>{NOTA_COMBUSTIBLE_SEPARADO}</p>}");
    expect(detalle).toContain("<CardDescription>{ayudaCascada(conCombustible)}</CardDescription>");
    expect(detalle).toContain("<CardDescription>{ayudaGastosAvion(conCombustible)}</CardDescription>");
    const kpi = leer("src/components/admin/profit-sharing/kpi-strip.tsx");
    expect(kpi).toContain("(a.gastos.combustible_usd ?? 0)");
    expect(kpi).toContain("hintKpiGastosPeriodo({ comoBalance, conCombustible })");
    const gastos = leer("src/components/admin/profit-sharing/gastos-avion-table.tsx");
    expect(gastos).toContain("agruparGastosDetalle(filas, { conCombustible: combustibleSeparado(avion) })");
    const cascada = leer("src/components/admin/profit-sharing/cascada-avion.tsx");
    expect(cascada).toContain("{etiquetaSaldoCascada(avion)}");
  });
});

// =============================================================================
// COMBUSTIBLE SEPARADO de los gastos directos (23-oct-2026, API 0.0.103,
// invariante 104): marcado de la cascada en el orden del Excel, la card, los
// gastos del periodo y el histórico. Números reales de N621TX, sep-2026.
// =============================================================================

const ORDEN_EXCEL = [
  "cobrado",
  "comisiones",
  "directos",
  "afac",
  "utilidad_antes_gastos",
  "combustible",
  "indirectos",
  "permisos",
  "fijos",
  "otros_ingresos",
  "saldo",
];
const ordenFilas = (html: string) => [...html.matchAll(/data-fila-cascada="([a-z_]+)"/g)].map((m) => m[1]);

describe("combustible separado: la cascada del Excel (CascadaAvion)", () => {
  const html = renderToStaticMarkup(<CascadaAvion avion={avionCombustible()} enPesos comoBalance />);

  it("las filas van en el orden del Excel, con las etiquetas exactas, el subtotal «Utilidad antes de gastos» y la fila «Combustible»", () => {
    expect(ordenFilas(html)).toEqual(ORDEN_EXCEL);
    expect(html).toContain(">Venta cobrada<");
    expect(html).toContain(">Comisiones de venta<span");
    expect(html).toContain(">Gastos directos<");
    expect(html).toContain(">Provisión AFAC<span");
    expect(html).toContain(">Utilidad antes de gastos<");
    expect(html).toContain(">Combustible<");
    expect(html).toContain(">Gastos indirectos<");
    expect(html).toContain(">Permisos<");
    expect(html).toContain(">Fijos prorrateados<");
    expect(html).toContain(">Otros ingresos del avión<span");
    expect(html).toContain(">Saldo a repartir<");
    expect(html).not.toContain(">Saldo disponible<");
    expect(html).not.toContain("Venta del avión cobrada");
    expect(html).toMatch(/data-fila-cascada="utilidad_antes_gastos" data-tipo="subtotal"/);
    expect(html).toMatch(/data-fila-cascada="combustible" data-tipo="deduccion"/);
    // El subtotal se ve como línea de total intermedia (línea arriba, peso medio).
    expect(html).toMatch(/border-t border-border pt-1\.5 font-medium"[^>]*data-fila-cascada="utilidad_antes_gastos"/);
  });

  it("los números del Excel: 787,851.13 − 2,591.00 − 40,588.14 − 42,575.49 = 702,096.50; combustible 147,277.58; saldo 574,632.22", () => {
    for (const n of [
      ">$787,851.13 MXN<",
      ">−$2,591.00 MXN<",
      ">−$40,588.14 MXN<",
      ">−$42,575.49 MXN<",
      ">$702,096.50 MXN<",
      ">≈ $40,669.39 USD<",
      ">−$147,277.58 MXN<",
      ">≈ −$8,537.83 USD<",
      ">−$13,800.00 MXN<",
      ">−$2,587.50 MXN<",
      ">−$10,350.00 MXN<",
      ">$46,550.80 MXN<",
      ">$574,632.22 MXN<",
    ]) {
      expect(html, n).toContain(n);
    }
    // Ya no se unen combustible y directos (antes: «Gastos directos 187,865.72»).
    expect(html).not.toContain("187,865.72");
    // Reserva informativa, debajo del saldo, como siempre con la cascada del balance.
    expect(pos(html, "data-reserva-informativa")).toBeGreaterThan(pos(html, 'data-fila-cascada="saldo"'));
  });

  it("FALLBACK: sin las llaves (API previo) el marcado es el de siempre: sin «Combustible», sin subtotal, «Saldo disponible»", () => {
    const viejo = renderToStaticMarkup(<CascadaAvion avion={sinCombustible(avionCombustible())} enPesos comoBalance />);
    expect(ordenFilas(viejo)).toEqual([
      "cobrado",
      "otros_ingresos",
      "comisiones",
      "directos",
      "indirectos",
      "permisos",
      "fijos",
      "afac",
      "saldo",
    ]);
    expect(viejo).not.toContain('data-fila-cascada="combustible"');
    expect(viejo).not.toContain("utilidad_antes_gastos");
    expect(viejo).not.toContain('data-tipo="subtotal"');
    expect(viejo).toContain(">Venta del avión cobrada<");
    expect(viejo).toContain(">Fijos (prorrateo + reparto manual)<");
    expect(viejo).toContain(">Saldo disponible<");
    expect(viejo).not.toContain("Saldo a repartir");
    // Y el fixture del golden (API 0.0.101) tampoco cambia.
    const balance = renderToStaticMarkup(<CascadaAvion avion={avionBalance()} enPesos comoBalance />);
    expect(ordenFilas(balance)).toEqual(ordenFilas(viejo));
    expect(balance).toContain(">Saldo disponible<");
  });
});

describe("combustible separado: la card de la lista pinta la misma cascada del Excel", () => {
  it("orden del Excel, «Saldo a repartir» en la cascada y el saldo del encabezado", () => {
    const html = renderToStaticMarkup(
      <AvionRepartoCard avion={avionCombustible()} desde="2026-09-01" hasta="2026-09-30" rol="ADMIN" usuarioId={ALE.id} enPesos comoBalance />,
    );
    expect(ordenFilas(html)).toEqual(ORDEN_EXCEL);
    expect(html).toContain(">Utilidad antes de gastos<");
    expect(html).toContain(">$702,096.50 MXN<");
    expect(html).toContain(">−$147,277.58 MXN<");
    expect(html).toContain(">Saldo a repartir<");
    expect(html.match(/>\$574,632\.22 MXN</g)?.length).toBe(2);
    expect(html).toContain('data-accion="ver-detalle-avion"');
  });
});

describe("combustible separado: «Gastos del periodo» con el grupo «Combustible»", () => {
  const filas: FilaGastoDetalle[] = [
    gasto({ id: "g-f1", fecha: "2026-09-08", grupo: "COMBUSTIBLE", monto: 100000, mxn: 100000, usd: 5797.1 }),
    gasto({ id: "g-f2", fecha: "2026-09-18", grupo: "COMBUSTIBLE", concepto: "Turbosina MID", monto: 47277.58, mxn: 47277.58, usd: 2740.73 }),
    gasto({ id: "g-d1", fecha: "2026-09-10", categoria: "ATERRIZAJE", etiqueta: "Aterrizajes", clave: "ATERRIZAJE", monto: 25000, mxn: 25000, usd: 1449.28 }),
    gasto({ id: "g-d2", fecha: "2026-09-12", categoria: "HOTEL", etiqueta: "Hotel", clave: "HOTEL", monto: 15588.14, mxn: 15588.14, usd: 903.66 }),
  ];
  const html = renderToStaticMarkup(<GastosAvionTable avion={avionCombustible()} filas={filas} enPesos />);
  const combustible = renderToStaticMarkup(
    <GastosAvionTable avion={avionCombustible()} filas={filas} enPesos grupoInicial="COMBUSTIBLE" />,
  );

  it("la pastilla «Combustible» va tras «Directos»; cada tabla con su subtotal CUADRA con su fila de la cascada", () => {
    expect(pos(html, 'data-pestana="DIRECTO"')).toBeLessThan(pos(html, 'data-pestana="COMBUSTIBLE"'));
    const texto = html.replace(/<[^>]+>/g, "");
    expect(texto).toContain("Directos (2)");
    expect(texto).toContain("Combustible (2)");
    // Por default, la tabla de los directos (ya sin combustible).
    expect(html).toContain('data-grupo-gastos="DIRECTO"');
    expect(html).not.toContain('data-grupo-gastos="COMBUSTIBLE"');
    expect(html).toContain("Costo de cada vuelo sin el combustible (que va aparte, como en el Excel)");
    expect(html).toMatch(/data-subtotal-grupo="DIRECTO"[^>]*>\$40,588\.14 MXN</);
    expect(html).toContain('data-cuadre-grupo="ok"');
    expect(html).toContain("Cuadra con la fila «Gastos directos» de la cascada ($40,588.14 MXN).");
    // La pastilla «Combustible»: su tabla, su subtotal y su cuadre.
    expect(combustible).toMatch(/data-pestana="COMBUSTIBLE" data-activa=""/);
    expect(combustible).toContain('data-grupo-gastos="COMBUSTIBLE"');
    expect(combustible).not.toContain('data-grupo-gastos="DIRECTO"');
    expect(combustible).toContain(">Combustible<span");
    expect(combustible).toContain("Gasavión / turbosina de cada vuelo. Va aparte de los gastos directos, como en el Excel del balance.");
    expect(combustible).toMatch(/data-subtotal-grupo="COMBUSTIBLE"[^>]*>\$147,277\.58 MXN</);
    expect(combustible).toContain('data-cuadre-grupo="ok"');
    expect(combustible).not.toContain('data-cuadre-grupo="diferencia"');
    expect(combustible).toContain("Cuadra con la fila «Combustible» de la cascada ($147,277.58 MXN).");
  });

  it("si no cuadra con la fila «Combustible», se dice", () => {
    const a = avionCombustible();
    const desc = renderToStaticMarkup(
      <GastosAvionTable
        avion={{ ...a, gastos: { ...a.gastos, combustible_mxn: 147300 } }}
        filas={filas}
        enPesos
        grupoInicial="COMBUSTIBLE"
      />,
    );
    expect(desc).toContain("No cuadra con la fila «Combustible» de la cascada ($147,300.00 MXN): diferencia de -$22.42 MXN.");
  });
});

// =============================================================================
// PESTAÑAS (23-oct-2026): el componente accesible y el cableado de la página.
// =============================================================================

describe("pestañas (Pestanas): accesibles, solo el panel activo, conteos", () => {
  const PES = [
    { clave: "a", etiqueta: "Gastos del periodo", conteo: 64 },
    { clave: "b", etiqueta: "Socios" },
    { clave: "c", etiqueta: "Entregas", conteo: 0 },
  ];
  const paneles = { a: <p>Panel A</p>, b: <p>Panel B</p>, c: <p>Panel C</p> };

  it("tablist / tab / tabpanel con aria-selected, aria-controls y tabindex itinerante; SOLO el panel activo se pinta", () => {
    const html = renderToStaticMarkup(<Pestanas etiquetaLista="Secciones" pestanas={PES} paneles={paneles} />);
    expect(html).toContain('role="tablist" aria-label="Secciones"');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/role="tab" id="([^"]+)-tab-a" aria-selected="true" aria-controls="\1-panel-a" tabindex="0"/);
    expect(html).toMatch(/id="[^"]+-tab-b" aria-selected="false" aria-controls="[^"]+-panel-b" tabindex="-1"/);
    expect(html).toMatch(/role="tabpanel" id="([^"]+)-panel-a" aria-labelledby="\1-tab-a" data-panel-pestana="a"/);
    expect(html).toContain("Panel A");
    expect(html).not.toContain("Panel B");
    expect(html).not.toContain("Panel C");
    const texto = html.replace(/<[^>]+>/g, "");
    expect(texto).toContain("Gastos del periodo (64)");
    expect(texto).toContain("Socios");
    expect(texto).toContain("Entregas (0)");
    expect(html).toContain('data-pestanas="pagina"');
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("la inicial pedida abre; una clave que no existe cae a la primera; variante secundaria (pastillas); sin pestañas, nada", () => {
    const html = renderToStaticMarkup(
      <Pestanas etiquetaLista="Secciones" pestanas={PES} inicial="b" paneles={paneles} parametroUrl="seccion" />,
    );
    expect(html).toMatch(/data-pestana="b" data-activa=""/);
    expect(html).toContain("Panel B");
    expect(html).not.toContain("Panel A");
    const rota = renderToStaticMarkup(
      <Pestanas etiquetaLista="Secciones" pestanas={PES} inicial="zzz" paneles={paneles} variante="secundaria" />,
    );
    expect(rota).toContain("Panel A");
    expect(rota).toContain('data-pestanas="secundaria"');
    expect(rota).toContain("rounded-full");
    expect(renderToStaticMarkup(<Pestanas etiquetaLista="x" pestanas={[]} paneles={{}} />)).toBe("");
  });
});

describe("cableado de la pantalla del avión en pestañas", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const detalle = leer("src/app/admin/profit-sharing/aviones/[id]/page.tsx");
  const tabla = leer("src/components/admin/profit-sharing/gastos-avion-table.tsx");
  const pestanas = leer("src/components/admin/pestanas.tsx");

  it("saldo y cascada SIEMPRE arriba; debajo UNA tira de pestañas con `?seccion=` y los paneles ya renderizados", () => {
    expect(detalle.indexOf("<CascadaAvion avion={avion}")).toBeLessThan(detalle.indexOf("<Pestanas"));
    expect(detalle).toContain("const pestanas = pestanasPantallaAvion(conteosPantallaAvion(datos));");
    expect(detalle).toContain("const seccionInicial = seccionPantallaAvionDeUrl(sp.seccion, pestanas);");
    expect(detalle).toMatch(/<Pestanas[\s\S]*?inicial=\{seccionInicial\}[\s\S]*?parametroUrl=\{PARAMETRO_SECCION_AVION\}/);
    for (const s of ["gastos", "vuelos", "socios", "entregas"]) expect(detalle).toContain(`data-seccion-avion="${s}"`);
    // Las tablas siguen siendo las de siempre (SSR); el estado vive en el cliente.
    expect(detalle).not.toContain('"use client"');
    expect(pestanas.startsWith('"use client";')).toBe(true);
    expect(pestanas).toContain("window.history.replaceState(");
    expect(pestanas).not.toContain("localStorage");
    expect(tabla).toContain('variante="secundaria"');
    expect(tabla).toContain("pestanasGruposGasto(grupos)");
  });
});

describe("combustible separado: el histórico", () => {
  const mes = (over: Partial<MesHistoricoAvion>): MesHistoricoAvion => ({
    mes: "2026-09",
    en_curso: false,
    horas_voladas_hr: 12.5,
    vuelos: 3,
    cobrado_mxn: 787851.13,
    pendiente_cobro_mxn: 0,
    comisiones_mxn: 2591,
    directos_mxn: 40588.14,
    combustible_mxn: 147277.58,
    indirectos_mxn: 13800,
    permisos_mxn: 2587.5,
    otros_mxn: 10350,
    afac_mxn: 42575.49,
    otros_ingresos_mxn: 46550.8,
    saldo_mxn: 574632.22,
    reserva_mxn: 8625,
    reserva_retenida_mxn: 3529.35,
    entregado_mxn: 0,
    pesos_sin_tc_usd: 0,
    saldo_usd: 33280.16,
    reparto: [],
    cierre_estado: "ABIERTO",
    ...over,
  });

  it("con `combustible_mxn` la tabla sabe que trae la columna; la vista compacta no cambia; sin la llave, nada", () => {
    const html = renderToStaticMarkup(<HistoricoAvionTable meses={[mes({})]} totales={mes({})} />);
    expect(html).toMatch(/data-tabla-historico-avion="true" data-con-combustible=""/);
    const ths = (html.match(/<th[^>]*>[\s\S]*?<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "").trim());
    expect(ths).toEqual(["Mes", "Horas", "Vuelos", "Cobrado", "Saldo", "Reserva a guardarno se resta", "Entregado", "Cierre"]);
    const viejo = renderToStaticMarkup(
      <HistoricoAvionTable meses={[mes({ combustible_mxn: undefined })]} totales={mes({ combustible_mxn: undefined })} />,
    );
    expect(viejo).not.toContain("data-con-combustible");
  });
});
