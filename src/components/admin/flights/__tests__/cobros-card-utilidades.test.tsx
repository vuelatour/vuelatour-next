/**
 * COBRO CON UTILIDADES DEL SOCIO en las cards de cobros (23-nov-2026, API
 * 0.0.148). Pedido del dueño: los socios a veces pagan un vuelo propio
 * «descontándolo de sus utilidades».
 *
 *  1. Un cobro con `utilidades` se lee «Utilidades del socio · {socio}» y,
 *     debajo, «Descontado de {matrícula} · {mes año}» — nunca «Otro» —, en la
 *     card del VUELO y en la de la COTIZACIÓN (es el mismo cobro).
 *  2. Sin «Editar» (el API responde 409 `COBRO_CON_UTILIDADES`); «Eliminar»
 *     solo DIRECCION/FACTURACION; el recibo se queda.
 *  3. La opción «Utilidades del socio» de «Registrar cobro» se activa con una
 *     prop que SOLO pasa la página del vuelo, y solo a la ficha del ALTA.
 *  4. Los campos propios (socio, avión, saldo) con sus estados de carga.
 *  5. Cableado de la ficha (vive en un portal): el centinela nunca es el
 *     método que viaja, el cobro va a SU action, el adelanto reenvía el mismo
 *     cuerpo con `aceptar_exceso` y la llave es una por apertura.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FlightCobro } from "@/types/flights";
import type { CargaSociosCobro, SocioParaCobro } from "@/lib/admin/cobro-utilidades";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
// Cada instancia del formulario se pinta como un marcador: «alta» o «edicion»
// y si recibió el contexto de «Utilidades del socio» (con el avión del vuelo).
vi.mock("../cobro-form-sheet", () => ({
  CobroFormSheet: (p: {
    cobroEditar?: unknown;
    utilidadesSocio?: { aeronaveId: string | null; clienteNombre: string | null; fechaVuelo: string | null } | null;
  }) => (
    <i
      data-ficha-cobro={"cobroEditar" in p ? "edicion" : "alta"}
      data-utilidades={p.utilidadesSocio ? JSON.stringify(p.utilidadesSocio) : "no"}
    />
  ),
}));
vi.mock("../reembolso-dialog", () => ({ ReembolsoButton: () => null }));
vi.mock("@/app/admin/ingresos/actions", () => ({
  anticiposDeClienteAction: async () => ({ ok: true, data: [] }),
  desaplicarAnticipoAction: async () => ({ ok: true }),
  aplicarAnticipoAction: async () => ({ ok: true }),
  vuelosCandidatosAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  deleteCobroAction: async () => ({ ok: true }),
  updateCobroAction: async () => ({ ok: true }),
  setFacturaClienteEstatusAction: async () => ({ ok: true }),
  setFacturaClienteFolioAction: async () => ({ ok: true }),
  quitarFacturaClienteAction: async () => ({ ok: true }),
  urlFacturaClienteAction: async () => ({ ok: true, data: "https://x/y" }),
  solicitarFacturaAction: async () => ({ ok: true }),
  retirarSolicitudFacturaAction: async () => ({ ok: true }),
  refrescarComprobanteCobroAction: async () => ({ ok: true }),
  urlComprobanteCobroAction: async () => ({ ok: true, data: "https://x/y" }),
}));
vi.mock("@/app/admin/facturas-emitidas/actions", () => ({
  urlArchivoFacturaAction: async () => ({ ok: true, data: "https://x/y" }),
  refrescarFacturasEmitidasAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/facturas-emitidas-browser", () => ({
  adjuntarComprobanteCobro: async () => ({ ok: false, error: "no aplica" }),
  leerArchivoFactura: async () => ({ ok: false, error: "no aplica" }),
  guardarFacturaEmitida: async () => ({ ok: false, error: "no aplica" }),
  buscarVuelosCandidatos: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  conciliacionDeEntradaAction: vi.fn(),
  estadoCuentaUrlAction: vi.fn(),
}));

const { CobrosCard } = await import("../cobros-card");
const { QuoteCobrosCard } = await import("@/components/admin/quotes/quote-cobros-card");
const { CamposUtilidadesSocio } = await import("../cobro-utilidades-campos");

const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const XBANU = "a1a1a1a1-0000-4000-8000-000000000002";

const TRANSFERENCIA: FlightCobro = {
  id: "0f3c2b1a-1111-4a7b-8c9d-0e1f2a3b4c5d",
  vuelo_id: "v-482",
  monto: "3400",
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "17.35",
  referencia: null,
  cuenta_destino: "Scotiabank Pesos",
  fecha_cobro: "2026-11-15T17:00:00+00:00",
  foto_voucher_url: null,
  registrado_por: "u-1",
  registrado_por_nombre: "Itzi",
  notas: null,
  created_at: "2026-11-15T17:00:00+00:00",
  updated_at: "2026-11-15T17:00:00+00:00",
  utilidades: null,
};
/** El cobro que el API guarda con método interno OTRO, ligado a la entrega. */
const CON_UTILIDADES: FlightCobro = {
  ...TRANSFERENCIA,
  id: "0f3c2b1a-2222-4a7b-8c9d-0e1f2a3b4c5d",
  monto: "45000",
  metodo_cobro: "OTRO",
  tc_usd_mxn: "18.5",
  cuenta_destino: null,
  fecha_cobro: "2026-11-20T17:00:00+00:00",
  utilidades: {
    entrega_id: "9a9a0000-0000-4000-8000-000000000002",
    socio_id: MAURICIO,
    socio_nombre: "Mauricio Roque",
    aeronave_id: N4142R,
    matricula: "N4142R",
    mes: "2026-11",
  },
};

function vuelo(
  cobros: FlightCobro[],
  rol: string | null,
  extra: { utilidadesSocio?: { aeronaveId: string | null } | null } = {},
): string {
  return renderToStaticMarkup(
    <CobrosCard
      flightId="v-482"
      flightFolio={482}
      flightEstado="COMPLETADO"
      montoTotalUsd={2616.22}
      pendingUsd={0}
      cobradoUsd={2616.22}
      cobros={cobros}
      rol={rol}
      clienteNombre="Mauricio Roque"
      fechaVuelo="2026-11-20T15:00:00Z"
      {...extra}
    />,
  );
}

function cotizacion(cobros: FlightCobro[], rol: string | null): string {
  return renderToStaticMarkup(
    <QuoteCobrosCard
      quoteId="v-482"
      quoteFolio={482}
      montoTotalUsd={2616.22}
      totalCobrado={2616.22}
      cobros={cobros}
      rol={rol}
    />,
  );
}

const botones = (html: string, accion: string) =>
  html.match(new RegExp(`<button[^>]*data-accion="${accion}"[^>]*>`, "g")) ?? [];

describe.each([
  ["vuelo", vuelo],
  ["cotización", cotizacion],
] as const)("un cobro con utilidades en la card de cobros de la %s", (_nombre, render) => {
  it("se lee «Utilidades del socio · {socio}» y debajo «Descontado de {matrícula} · {mes año}», nunca «Otro»", () => {
    const html = render([CON_UTILIDADES], "DIRECCION");
    expect(html).toContain("Utilidades del socio · Mauricio Roque");
    expect(html).toMatch(/<p[^>]*data-cobro-utilidades[^>]*>Descontado de N4142R · Noviembre 2026<\/p>/);
    expect(html).not.toMatch(/>\s*Otro\b/);
    expect(html).toContain("$45,000 MXN");
  });

  it.each(["DIRECCION", "FACTURACION"])("%s: sin «Editar», con «Eliminar» y con su recibo", (rol) => {
    const html = render([CON_UTILIDADES], rol);
    expect(botones(html, "editar-cobro")).toHaveLength(0);
    expect(html).not.toContain("corrígelo con «Editar»");
    const eliminar = botones(html, "eliminar-cobro");
    expect(eliminar).toHaveLength(1);
    expect(eliminar[0]).toContain("también se quita la entrega al socio en Pagos a socios");
    // El recibo se queda como está.
    expect(html).toContain('aria-label="Abrir el recibo de pago (PDF)"');
  });

  it.each(["ADMIN", "COORDINADOR", "ANALISTA", null])(
    "%s: ni «Editar» ni «Eliminar» (el API respondería 403)",
    (rol) => {
      const html = render([CON_UTILIDADES], rol);
      expect(botones(html, "editar-cobro")).toHaveLength(0);
      expect(botones(html, "eliminar-cobro")).toHaveLength(0);
      // Se sigue LEYENDO igual.
      expect(html).toContain("Utilidades del socio · Mauricio Roque");
    },
  );

  it("los demás cobros no cambian: su método, su «Editar» y su «Eliminar» de siempre", () => {
    const html = render([TRANSFERENCIA, CON_UTILIDADES], "ADMIN");
    expect(html).toContain("Transferencia");
    expect(html).toContain("Scotiabank Pesos");
    expect(botones(html, "editar-cobro")).toHaveLength(1);
    expect(botones(html, "eliminar-cobro")).toHaveLength(1);
    expect(html.match(/data-cobro-utilidades/g)).toHaveLength(1);
    // Con un API previo (sin la llave `utilidades`) la card queda igual.
    const { utilidades: _fuera, ...previo } = TRANSFERENCIA;
    void _fuera;
    const sinLlave = render([previo], "ADMIN");
    expect(sinLlave).not.toContain("data-cobro-utilidades");
    expect(sinLlave).not.toContain("Utilidades del socio");
  });
});

describe("«Liquidado con» en la card del vuelo", () => {
  const conFinal = (cobros: FlightCobro[], metodoCobroFinal: string) =>
    renderToStaticMarkup(
      <CobrosCard
        flightId="v-482"
        flightFolio={482}
        flightEstado="COMPLETADO"
        montoTotalUsd={2616.22}
        pendingUsd={0}
        cobradoUsd={2616.22}
        cobros={cobros}
        rol="DIRECCION"
        metodoPrevisto="TRANSFERENCIA"
        metodoCobroFinal={metodoCobroFinal}
      />,
    );

  it("si lo liquidó el cobro con utilidades dice «Utilidades del socio», no «Otro»", () => {
    const html = conFinal([TRANSFERENCIA, CON_UTILIDADES], "OTRO");
    expect(html).toContain("Liquidado con: Utilidades del socio");
    expect(html).not.toContain("Liquidado con: Otro");
    // Sigue marcando que no es lo previsto en la cotización.
    expect(html).toContain("(distinto al previsto)");
  });

  it("los demás métodos, como siempre", () => {
    expect(conFinal([TRANSFERENCIA], "TRANSFERENCIA")).toContain("Liquidado con: Transferencia");
  });
});

describe("la opción se activa desde la página del vuelo y desde la cotización", () => {
  const fichas = (html: string) =>
    [...html.matchAll(/<i data-ficha-cobro="(alta|edicion)" data-utilidades="([^"]*)">/g)].map((m) => ({
      modo: m[1],
      utilidades: m[2].replace(/&quot;/g, '"'),
    }));

  it("con la prop: SOLO la ficha del alta recibe el contexto (avión del vuelo, cliente y fecha)", () => {
    const f = fichas(vuelo([TRANSFERENCIA], "DIRECCION", { utilidadesSocio: { aeronaveId: N4142R } }));
    expect(f).toHaveLength(2);
    const alta = f.find((x) => x.modo === "alta")!;
    expect(JSON.parse(alta.utilidades)).toEqual({
      aeronaveId: N4142R,
      clienteNombre: "Mauricio Roque",
      fechaVuelo: "2026-11-20T15:00:00Z",
    });
    expect(f.find((x) => x.modo === "edicion")!.utilidades).toBe("no");
  });

  it("sin la prop (default): ninguna ficha ofrece la opción", () => {
    for (const f of fichas(vuelo([TRANSFERENCIA], "DIRECCION"))) expect(f.utilidades).toBe("no");
    for (const f of fichas(cotizacion([TRANSFERENCIA], "DIRECCION"))) expect(f.utilidades).toBe("no");
  });

  it("en el código: la pasan la página del vuelo y el ALTA de la cotización; la corrección y Paywise no", () => {
    const leer = (...p: string[]) => readFileSync(path.resolve(__dirname, "..", "..", "..", "..", ...p), "utf8");
    const pagina = leer("app", "admin", "flights", "[id]", "page.tsx");
    const card = pagina.slice(pagina.indexOf("<CobrosCard"), pagina.indexOf("/>", pagina.indexOf("<CobrosCard")));
    expect(card).toContain("utilidadesSocio={{ aeronaveId: snapshot.aeronave_id ?? null }}");
    // Desde el 24-nov-2026 también el «Registrar cobro» de la cotización (la
    // oficina registra ahí casi todos los cobros): avión operativo, cliente y
    // fecha del vuelo, una sola vez.
    const cotizacionSrc = leer("components", "admin", "quotes", "quote-workspace.tsx");
    expect(cotizacionSrc.match(/utilidadesSocio=\{/g)).toHaveLength(1);
    const ficha = cotizacionSrc.slice(
      cotizacionSrc.indexOf("<CobroFormSheet"),
      cotizacionSrc.indexOf("/>", cotizacionSrc.indexOf("<CobroFormSheet")),
    );
    expect(ficha).toContain("aeronaveId: quote.aeronave_id ?? null");
    expect(ficha).toContain("clienteNombre: clientName ?? null");
    expect(ficha).toContain("fechaVuelo: quote.fecha_vuelo ?? null");
    for (const archivo of [
      ["components", "admin", "quotes", "quote-cobros-card.tsx"],
      ["components", "admin", "conciliacion", "paywise-auditoria.tsx"],
    ]) {
      expect(leer(...archivo), archivo.join("/")).not.toContain("utilidadesSocio");
    }
    // La card del vuelo se la pasa una sola vez: a la ficha del alta.
    expect(leer("components", "admin", "flights", "cobros-card.tsx").match(/utilidadesSocio=\{/g)).toHaveLength(1);
  });
});

describe("campos «Socio que paga» y «¿De las utilidades de qué avión?»", () => {
  const mauricio: SocioParaCobro = {
    id: MAURICIO,
    nombre: "Mauricio Roque",
    aviones: [
      { id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true, porEntregarCerradoMxn: 18798.71 },
      { id: XBANU, matricula: "XB-ANU", porcentaje: 70, vigente: true, porEntregarCerradoMxn: -3862.6 },
    ],
    cuentaPorAvion: true,
    adelantadoGeneralMxn: 0,
  };
  const pinta = (
    carga: CargaSociosCobro,
    extra: Partial<Parameters<typeof CamposUtilidadesSocio>[0]> = {},
  ) =>
    renderToStaticMarkup(
      <CamposUtilidadesSocio
        carga={carga}
        socioId=""
        avionId=""
        aeronaveVueloId={N4142R}
        errores={{}}
        saldo={null}
        onSocio={() => {}}
        onAvion={() => {}}
        onReintentar={() => {}}
        {...extra}
      />,
    );

  it("mientras carga lo dice; nunca un selector vacío", () => {
    for (const carga of [{ estado: "sin-cargar" }, { estado: "cargando" }] as CargaSociosCobro[]) {
      const html = pinta(carga);
      expect(html).toContain("Cargando los socios…");
      expect(html).toContain('role="status"');
      expect(html).not.toContain("Socio que paga");
    }
  });

  it("si la lectura falla dice por qué, con «Reintentar» solo cuando sirve", () => {
    const html = pinta({ estado: "error", mensaje: "No se pudieron cargar los socios.", reintentable: true });
    expect(html).toContain('role="alert"');
    expect(html).toContain("No se pudieron cargar los socios.");
    expect(html).toMatch(/<button[^>]*data-accion="reintentar-socios"[^>]*>Reintentar<\/button>/);
    expect(html).toContain("cursor-pointer");
    expect(html).not.toContain("Socio que paga");
    const sinPermiso = pinta({ estado: "error", mensaje: "Tu usuario no puede…", reintentable: false });
    expect(sinPermiso).not.toContain("Reintentar");
  });

  it("sin socios con avión lo dice (no es un error de carga)", () => {
    expect(pinta({ estado: "ok", socios: [] })).toContain("No hay socios con avión registrados.");
  });

  it("sin socio elegido: solo «Socio que paga» (obligatorio); el avión aparece al elegirlo", () => {
    const html = pinta({ estado: "ok", socios: [mauricio] });
    expect(html).toContain("Socio que paga");
    expect(html).toContain("Elige al socio");
    expect(html).not.toContain("¿De las utilidades de qué avión?");
  });

  it("con socio y avión: los dos selectores, el avión del vuelo elegido y el renglón gris del saldo", () => {
    const html = pinta(
      { estado: "ok", socios: [mauricio] },
      {
        socioId: MAURICIO,
        avionId: N4142R,
        saldo: {
          texto:
            "Por entregar a Mauricio Roque de N4142R (meses cerrados): $18,798.71 MXN. Después de este cobro: $10,798.71 MXN.",
          adelantoGeneral: null,
        },
      },
    );
    expect(html).toContain("Mauricio Roque");
    expect(html).toContain("¿De las utilidades de qué avión?");
    expect(html).toContain("N4142R");
    expect(html).toMatch(
      /<p class="text-xs text-muted-foreground"><span data-saldo-utilidades="true">Por entregar a Mauricio Roque de N4142R \(meses cerrados\): \$18,798\.71 MXN\. Después de este cobro: \$10,798\.71 MXN\.<\/span><\/p>/,
    );
    // Toda etiqueta nombra a su selector (for ⇄ id).
    const huerfanas = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].filter((m) => !html.includes(`id="${m[1]}"`));
    expect(huerfanas).toHaveLength(0);
  });

  it("sin el dato del saldo no pinta números: solo la ayuda del campo", () => {
    const html = pinta({ estado: "ok", socios: [mauricio] }, { socioId: MAURICIO, avionId: "" });
    expect(html).toContain("Puede ser un avión distinto al que voló");
    expect(html).not.toContain("data-saldo-utilidades");
    expect(html).not.toContain("$");
  });

  it("los errores de validación van bajo su campo; los adelantos generales, en ámbar", () => {
    expect(pinta({ estado: "ok", socios: [mauricio] }, { errores: { socio: "Elige el socio que paga el vuelo." } })).toMatch(
      /role="alert"[^>]*>Elige el socio que paga el vuelo\./,
    );
    const html = pinta(
      { estado: "ok", socios: [mauricio] },
      {
        socioId: MAURICIO,
        avionId: N4142R,
        saldo: { texto: "Por entregar…", adelantoGeneral: "Ya se le adelantaron $5,000.00 MXN a cuenta general: …" },
      },
    );
    expect(html).toMatch(/<span[^>]*text-amber-700[^>]*data-adelanto-general="true">Ya se le adelantaron/);
  });
});

/**
 * La ficha vive en un portal (el render de servidor no la pinta) y el proyecto
 * no tiene DOM de pruebas: se vigila el CABLEADO en el código, como el resto
 * de las pruebas de «Registrar cobro».
 */
describe("cableado de «Utilidades del socio» en la ficha", () => {
  const src = readFileSync(path.resolve(__dirname, "..", "cobro-form-sheet.tsx"), "utf8");

  it("la opción sale de la fuente única y el selector muestra el centinela SOLO en ese modo", () => {
    expect(src).toContain("const opcionesMetodo = opcionesMetodoCobro(ofrecerUtilidades);");
    expect(src).toContain("options={opcionesMetodo}");
    expect(src).toContain("value={modoUtilidades ? METODO_UTILIDADES_SOCIO : metodo}");
    expect(src).toContain("onChange={handleMetodoSelector}");
    // Solo alta + contexto + rol + no cancelado (regla pura).
    expect(src).toContain("const ofrecerUtilidades = ofreceCobroConUtilidades({");
    expect(src).toContain("const modoUtilidades = ofrecerUtilidades && conUtilidades;");
  });

  it("el centinela JAMÁS se escribe en `metodo_cobro` ni viaja: el modo es un estado aparte", () => {
    const selector = src.slice(src.indexOf("const handleMetodoSelector"), src.indexOf("const cambiarSocio"));
    // Al elegirlo se sale ANTES de tocar el método real.
    expect(selector.indexOf("if (v === METODO_UTILIDADES_SOCIO) {")).toBeGreaterThan(0);
    expect(selector.indexOf("return;")).toBeLessThan(selector.indexOf("handleMetodoChange(v);"));
    // El esquema del formulario sigue aceptando SOLO los métodos reales.
    expect(src).toContain("metodo_cobro: z.enum(METODO_VALUES),");
    expect(src).not.toContain('setValue("metodo_cobro", METODO_UTILIDADES_SOCIO');
  });

  it("guardar va a SU action (una sola llamada) y el alta de siempre no se toca", () => {
    expect(src.match(/registrarCobroUtilidadesAction\(/g)).toHaveLength(1);
    expect(src.match(/registerCobroAction\(/g)).toHaveLength(1);
    const submit = src.slice(src.indexOf("const onSubmit = handleSubmit"), src.indexOf("const guardarCorreccion"));
    const rama = submit.indexOf("if (modoUtilidades) {");
    expect(rama).toBeGreaterThan(0);
    expect(submit.indexOf("registrarConUtilidades(values);")).toBeGreaterThan(rama);
    // La rama de utilidades corta ANTES del alta normal.
    expect(submit.indexOf("return;", rama)).toBeLessThan(submit.indexOf("registerCobroAction("));
    // Cuerpo y validación de la fuente única; la llave es la de esta apertura.
    expect(src).toContain("validarCobroUtilidades(form, { socios: cargaSocios.socios, hoy: todayCancun() })");
    expect(src).toContain("payloadCobroUtilidades(form, { clientRequestId: solicitudId })");
  });

  it("una llave de idempotencia POR APERTURA de la ficha", () => {
    expect(src.match(/setSolicitudId\(/g)).toHaveLength(1);
    expect(src).toContain("setSolicitudId(nuevoIdSolicitud());");
    const abrir = src.slice(src.indexOf("if (open && !inicial) {"), src.indexOf("}, [open, montoPrefill, prefill, reset, inicial]);"));
    expect(abrir).toContain("setSolicitudId(nuevoIdSolicitud());");
    expect(abrir).toContain("setConUtilidades(false);");
    expect(abrir).toContain("setCargaSocios(CARGA_SOCIOS_SIN_CARGAR);");
  });

  it("409 PAGO_EXCEDE_SALDO ⇒ confirmación; «Registrar como adelanto» reenvía el MISMO cuerpo con aceptar_exceso", () => {
    expect(src).toContain("const paso = pasoTrasCobroUtilidades(res);");
    expect(src).toContain("setAdelanto({ details: paso.details, payload, ...ctx });");
    expect(src).toContain("confirmacionAdelantoCobro(adelanto.details, adelanto.fecha)");
    expect(src).toContain("{ ...adelanto.payload, aceptar_exceso: true },");
    expect(src).toContain('data-accion="confirmar-adelanto-cobro"');
    // El adelanto no pasa por el toast de error.
    const adelanto = src.slice(src.indexOf('case "adelanto":'), src.indexOf('case "error":'));
    expect(adelanto).not.toContain("toast.error");
  });

  it("éxito: toast con el socio, cierra y refresca como el alta normal", () => {
    const listo = src.slice(src.indexOf('case "listo":'), src.indexOf("/** Valida lo propio de «Utilidades del socio»"));
    expect(listo).toContain("toast.success(textoCobroUtilidadesRegistrado(ctx.socioNombre));");
    expect(listo).toContain("toast.info(TEXTO_COBRO_UTILIDADES_YA_REGISTRADO);");
    expect(listo).toContain("onOpenChange(false);");
    expect(listo).toContain("router.refresh();");
    expect(listo).toContain("onRegistrado?.();");
  });

  it("los socios se piden AL ELEGIR la opción (no al abrir) y una respuesta tardía se descarta", () => {
    expect(src.match(/sociosParaCobroUtilidadesAction\(/g)).toHaveLength(1);
    const elegir = src.slice(src.indexOf("const elegirUtilidades"), src.indexOf("const salirDeUtilidades"));
    expect(elegir).toContain("cargarSocios();");
    expect(src).toContain("if (turno !== turnoCargaSocios.current) return;");
    // Preselección del socio (cliente del vuelo) y de su avión.
    expect(src).toContain("socioPreseleccionado(carga.socios, utilidadesSocio?.clienteNombre)");
    expect(src).toContain("avionPorDefecto(socioDe(carga.socios, propuesto), utilidadesSocio?.aeronaveId)");
  });

  it("en ese modo: moneda y fecha por defecto, T.C. en las dos monedas y sin comisión, cuenta, referencia ni factura", () => {
    const elegir = src.slice(src.indexOf("const elegirUtilidades"), src.indexOf("const salirDeUtilidades"));
    expect(elegir).toContain("handleMonedaChange(monedaPorDefectoUtilidades(montoTotalMxn), true);");
    expect(elegir).toContain("fechaPorDefectoUtilidades(utilidadesSocio?.fechaVuelo, todayCancun())");
    expect(src).toContain('const mostrarTc = (moneda === "MXN" || modoUtilidades) && !tcBloqueado;');
    expect(src).toContain("{!dineroBloqueado && !modoUtilidades && (");
    // Referencia y factura quedan dentro del bloque que se esconde.
    const oculto = src.slice(src.indexOf("{!modoUtilidades && ("), src.indexOf("{!fechaSoloLectura && ("));
    expect(oculto).toContain('label="Referencia"');
    expect(oculto).toContain("{mostrarSelectorFactura && (");
    expect(src).toContain("hint={modoUtilidades ? ayudaFechaUtilidades(fechaCobro) : undefined}");
    expect(src).toContain("disabled={pending || (modoUtilidades && !utilidadesListas)}");
  });
});

describe("confirmación al eliminar (cableado en las dos cards)", () => {
  const leer = (...p: string[]) => readFileSync(path.resolve(__dirname, "..", "..", "..", "..", ...p), "utf8");

  it.each([
    [["components", "admin", "flights", "cobros-card.tsx"]],
    [["components", "admin", "quotes", "quote-cobros-card.tsx"]],
  ])("%s", (archivo) => {
    const src = leer(...archivo);
    // El diálogo dice que también se quita la entrega (texto de la fuente única).
    expect(src).toContain("confirmacionEliminarCobroUtilidades(toDelete) ??");
    expect(src).toContain("etiquetaMetodoDeCobro(toDelete)");
    // El botón solo para quien puede, y el DELETE avisa que lleva entrega.
    expect(src).toContain("puedeEliminarCobro(c, rol) && (");
    expect(src).toMatch(/deleteCobroAction\(\w+, toDelete\.id, \{ conUtilidades \}\)/);
    expect(src).toContain("TEXTO_COBRO_UTILIDADES_ELIMINADO");
    expect(src).toContain("toast.error(mensajeErrorCobroUtilidades(res));");
    // Ninguna card pinta el método de un cobro por su cuenta.
    expect(src).not.toContain("metodoPagoLabel(c.metodo_cobro)");
    expect(src).not.toContain("metodoPagoLabel(toDelete.metodo_cobro)");
  });
});
