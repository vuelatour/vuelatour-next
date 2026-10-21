import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/lib/admin/nav-items";
import { FILTROS_CONCILIACION } from "@/lib/admin/conciliacion-vista";
import { TABS_INGRESOS } from "@/lib/admin/ingresos-ui";
import {
  MAX_TEXTO_TITULO,
  PESTANAS_COMPRAS,
  PESTANAS_CONCILIACION,
  PESTANAS_ESTADISTICAS,
  PESTANAS_GASTOS,
  PLANTILLA_TITULO,
  RUTA_SECCION,
  SEPARADOR_TITULO,
  SUFIJO_EN_CONSTRUCCION,
  TITULOS_DETALLE,
  TITULOS_PAGINA,
  TITULOS_SECCION,
  TITULO_PAGINA_NO_ENCONTRADA,
  diaCorto,
  folioParaTitulo,
  mesLargo,
  periodoCorto,
  textoParaTitulo,
  tituloAvion,
  tituloBalance,
  tituloCajaChica,
  tituloCalendario,
  tituloCompra,
  tituloComodin,
  tituloCompras,
  tituloConPlantilla,
  tituloConciliacion,
  tituloCotizacion,
  tituloEstadisticas,
  tituloGastos,
  tituloGrupo,
  tituloIngresos,
  tituloPiloto,
  tituloProducto,
  tituloReparto,
  tituloRepartoAvion,
  tituloHistoricoAvion,
  tituloSocio,
  tituloTacometros,
  tituloVuelo,
  unirTitulo,
  type SeccionMenu,
} from "@/lib/admin/titulos-pestana";

/**
 * Títulos de las pestañas del navegador (14-oct-2026): los TEXTOS EXACTOS.
 * Pedido del cliente: «estaría genial que en cada pestaña del navegador se
 * ponga el nombre de lo que se está consultando en esa pantalla». El cableado
 * de cada página lo vigila `app/admin/__tests__/titulos-pestana-cableado.test.ts`.
 */

const SRC = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("secciones = las etiquetas del menú (nav-items)", () => {
  const items = NAV_GROUPS.flatMap((g) => g.items);

  it("cada ítem del menú tiene su título, idéntico a su etiqueta", () => {
    const porRuta = new Map(
      (Object.keys(RUTA_SECCION) as SeccionMenu[]).map((k) => [RUTA_SECCION[k], k]),
    );
    for (const item of items) {
      const clave = porRuta.get(item.href);
      expect(clave, `falta el título de ${item.href} («${item.label}»)`).toBeDefined();
      expect(TITULOS_SECCION[clave as SeccionMenu]).toBe(item.label);
    }
  });

  it("ninguna sección sobra: todas son ítems del menú, sin rutas repetidas", () => {
    const hrefs = new Set(items.map((i) => i.href));
    const rutas = Object.values(RUTA_SECCION);
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const ruta of rutas) expect(hrefs.has(ruta), `${ruta} no está en el menú`).toBe(true);
    expect(Object.keys(RUTA_SECCION).sort()).toEqual(Object.keys(TITULOS_SECCION).sort());
  });

  it("textos de las secciones que más se usan", () => {
    expect(TITULOS_SECCION.gastos).toBe("Gastos");
    expect(TITULOS_SECCION.conciliacion).toBe("Conciliación");
    expect(TITULOS_SECCION.inventario).toBe("Inventario/Tienda");
    expect(TITULOS_SECCION.facturacionAutomatica).toBe("Facturación automática");
    expect(TITULOS_SECCION.entidadesFiscales).toBe("Entidades fiscales");
    expect(TITULOS_SECCION.tarjetas).toBe("Tarjetas corp.");
    expect(TITULOS_SECCION.rutas).toBe("Rutas");
    expect(TITULOS_SECCION.estadisticas).toBe("Estadísticas");
    expect(TITULOS_SECCION.pagosSocios).toBe("Pagos a socios");
    // Nómina (15-oct-2026): debajo de «Otros gastos» en el menú.
    expect(TITULOS_SECCION.nomina).toBe("Nómina");
    expect(RUTA_SECCION.nomina).toBe("/admin/nomina");
  });

  it("pantallas fuera del menú (incluidas las de sesión, fuera de /admin)", () => {
    expect(TITULOS_PAGINA).toEqual({
      miCuenta: "Mi cuenta",
      cotizacionNueva: "Nueva cotización",
      grupos: "Grupos",
      grupoNuevo: "Nuevo grupo",
      compras: "Compras",
      iniciarSesion: "Iniciar sesión",
      errorSesion: "No se pudo iniciar sesión",
    });
  });
});

describe("piezas", () => {
  it("unirTitulo omite lo vacío y usa « · »", () => {
    expect(SEPARADOR_TITULO).toBe(" · ");
    expect(unirTitulo("Vuelo #315", null, undefined, false, "  ", " Beh Kay ")).toBe("Vuelo #315 · Beh Kay");
    expect(unirTitulo()).toBe("");
  });

  it("textoParaTitulo colapsa espacios y recorta con «…»", () => {
    expect(textoParaTitulo("  Beh   Kay ")).toBe("Beh Kay");
    expect(textoParaTitulo("")).toBeNull();
    expect(textoParaTitulo("   ")).toBeNull();
    expect(textoParaTitulo(null)).toBeNull();
    expect(textoParaTitulo({})).toBeNull();
    expect(textoParaTitulo(315)).toBe("315");
    expect(MAX_TEXTO_TITULO).toBe(40);
    expect(textoParaTitulo("Grupo Empresarial Aeronáutico del Sureste S.A. de C.V.")).toBe(
      "Grupo Empresarial Aeronáutico del Sures…",
    );
  });

  it("folioParaTitulo: «#315»; ausente, 0 o ilegible ⇒ null (nunca «#0»)", () => {
    expect(folioParaTitulo(315)).toBe("#315");
    expect(folioParaTitulo("315")).toBe("#315");
    expect(folioParaTitulo(" 42 ")).toBe("#42");
    expect(folioParaTitulo(0)).toBeNull();
    expect(folioParaTitulo(-3)).toBeNull();
    expect(folioParaTitulo(Number.NaN)).toBeNull();
    expect(folioParaTitulo(3.5)).toBeNull();
    expect(folioParaTitulo("G-12")).toBeNull();
    expect(folioParaTitulo(null)).toBeNull();
    expect(folioParaTitulo(undefined)).toBeNull();
  });
});

describe("detalles: lo distintivo primero", () => {
  it("vuelo", () => {
    expect(tituloVuelo(315, "Beh Kay")).toBe("Vuelo #315 · Beh Kay");
    expect(tituloVuelo("315", "  Beh   Kay ")).toBe("Vuelo #315 · Beh Kay");
    expect(tituloVuelo(315)).toBe("Vuelo #315");
    expect(tituloVuelo(315, null)).toBe("Vuelo #315");
    expect(tituloVuelo(0, "Beh Kay")).toBe("Vuelo");
    expect(tituloVuelo()).toBe("Vuelo");
  });

  it("cotización (mismo folio que su vuelo: el tipo los distingue)", () => {
    expect(tituloCotizacion(332, "Beh Kay")).toBe("Cotización #332 · Beh Kay");
    expect(tituloCotizacion(332)).toBe("Cotización #332");
    expect(tituloCotizacion()).toBe("Cotización");
    expect(tituloCotizacion(1, "Grupo Empresarial Aeronáutico del Sureste S.A. de C.V.")).toBe(
      "Cotización #1 · Grupo Empresarial Aeronáutico del Sures…",
    );
  });

  it("grupo (folio numérico o el «G-12» del API)", () => {
    expect(tituloGrupo(12, "Maqar")).toBe("Grupo G-12 · Maqar");
    expect(tituloGrupo("G-12", "Maqar")).toBe("Grupo G-12 · Maqar");
    expect(tituloGrupo("12")).toBe("Grupo G-12");
    expect(tituloGrupo(null, "Maqar")).toBe("Grupo");
    expect(tituloGrupo("nada")).toBe("Grupo");
    expect(tituloGrupo()).toBe("Grupo");
  });

  it("avión", () => {
    expect(tituloAvion("XB-PEV")).toBe("Avión XB-PEV");
    expect(tituloAvion(" N4142R ")).toBe("Avión N4142R");
    expect(tituloAvion("")).toBe("Avión");
    expect(tituloAvion()).toBe("Avión");
  });

  it("producto: el nombre primero y la sección del menú después", () => {
    expect(tituloProducto("Aceite AeroShell 15W-50")).toBe("Aceite AeroShell 15W-50 · Inventario/Tienda");
    expect(tituloProducto("Aceite AeroShell W100 Plus 15W-50 para motores de pistón (cuarto)")).toBe(
      "Aceite AeroShell W100 Plus 15W-50 para… · Inventario/Tienda",
    );
    expect(tituloProducto(null)).toBe("Producto");
    expect(tituloProducto()).toBe("Producto");
  });

  it("compra", () => {
    expect(tituloCompra(12, "Aircraft Spruce")).toBe("Compra #12 · Aircraft Spruce");
    expect(tituloCompra(12, null)).toBe("Compra #12");
    expect(tituloCompra()).toBe("Compra");
  });

  it("personas: el tipo primero (la misma persona puede ser piloto, socio y tener caja chica)", () => {
    expect(tituloPiloto("Alexander E. Saab")).toBe("Piloto · Alexander E. Saab");
    expect(tituloPiloto()).toBe("Piloto");
    expect(tituloSocio("Mauricio Roque")).toBe("Socio · Mauricio Roque");
    expect(tituloSocio(null)).toBe("Socio");
    expect(tituloCajaChica("Diego Ramírez")).toBe("Caja chica · Diego Ramírez");
    expect(tituloCajaChica(null)).toBe("Caja chica");
  });

  it("los genéricos son los respaldos de cada detalle", () => {
    expect(TITULOS_DETALLE).toEqual({
      vuelo: "Vuelo",
      cotizacion: "Cotización",
      grupo: "Grupo",
      avion: "Avión",
      producto: "Producto",
      compra: "Compra",
      piloto: "Piloto",
      socio: "Socio",
      balanceAvion: "Balance del avión",
      repartoAvion: "Reparto del avión",
      historicoAvion: "Histórico del avión",
    });
  });

  it("pantalla por avión del reparto (20-oct-2026): «Reparto N621TX · septiembre 2026» e «Histórico N621TX»; sin matrícula, el genérico", () => {
    expect(tituloRepartoAvion("N621TX", "2026-09-01", "2026-09-30")).toBe("Reparto N621TX · septiembre 2026");
    expect(tituloRepartoAvion("N621TX", "2026-10-01", "2026-10-14")).toBe("Reparto N621TX · 1–14 oct 2026");
    expect(tituloRepartoAvion("N621TX")).toBe("Reparto N621TX");
    expect(tituloRepartoAvion("", "2026-09-01", "2026-09-30")).toBe("Reparto del avión");
    expect(tituloRepartoAvion()).toBe(TITULOS_DETALLE.repartoAvion);
    expect(tituloHistoricoAvion("N621TX")).toBe("Histórico N621TX");
    expect(tituloHistoricoAvion(null)).toBe("Histórico del avión");
    expect(tituloHistoricoAvion()).toBe(TITULOS_DETALLE.historicoAvion);
  });
});

describe("pestañas de una sección: «Sección · Pestaña»", () => {
  it("Conciliación (Todos no se nombra)", () => {
    expect(tituloConciliacion("todos")).toBe("Conciliación");
    expect(tituloConciliacion(null)).toBe("Conciliación");
    expect(tituloConciliacion("pendientes")).toBe("Conciliación · Pendientes");
    expect(tituloConciliacion("conciliados")).toBe("Conciliación · Conciliados");
    expect(tituloConciliacion("omitidos")).toBe("Conciliación · Omitidos");
    expect(tituloConciliacion("sin_banco")).toBe("Conciliación · Gastos sin banco");
    expect(tituloConciliacion("cobros_sin_banco")).toBe("Conciliación · Cobros sin banco");
    expect(tituloConciliacion("paywise")).toBe("Conciliación · Auditoría Paywise");
    // Toda pestaña que valida `filtroConciliacionDeUrl` tiene su etiqueta.
    expect(Object.keys(PESTANAS_CONCILIACION).sort()).toEqual([...FILTROS_CONCILIACION].sort());
  });

  it("Gastos (Todos no se nombra)", () => {
    expect(tituloGastos("todos")).toBe("Gastos");
    expect(tituloGastos()).toBe("Gastos");
    expect(tituloGastos("pendientes")).toBe("Gastos · Pendientes");
    expect(tituloGastos("duplicados")).toBe("Gastos · Duplicados");
  });

  it("Ingresos (etiquetas = las de sus chips, `ETIQUETA_TAB_INGRESOS`)", () => {
    expect(tituloIngresos("todos")).toBe("Ingresos");
    expect(tituloIngresos(null)).toBe("Ingresos");
    expect(tituloIngresos("cobros")).toBe("Ingresos · Cobros de vuelos");
    expect(tituloIngresos("otros")).toBe("Ingresos · Otros ingresos");
    expect(tituloIngresos("anticipos")).toBe("Ingresos · Anticipos");
    expect(tituloIngresos("por-conciliar")).toBe("Ingresos · Por conciliar");
    for (const t of TABS_INGRESOS) expect(tituloIngresos(t).startsWith("Ingresos")).toBe(true);
  });

  it("Estadísticas (cada pestaña es un tablero: la activa siempre se nombra)", () => {
    expect(tituloEstadisticas("ejecutivo")).toBe("Estadísticas · Ejecutivo");
    expect(tituloEstadisticas("operativo")).toBe("Estadísticas · Operativo");
    expect(tituloEstadisticas("gastos")).toBe("Estadísticas · Gastos");
    expect(tituloEstadisticas("tarjetas")).toBe("Estadísticas · Gastos por tarjeta");
    expect(tituloEstadisticas("horas")).toBe("Estadísticas · Horas de piloto");
    expect(tituloEstadisticas(null)).toBe("Estadísticas");
    expect(tituloEstadisticas()).toBe("Estadísticas");
  });

  it("Compras (Por recibir es el default; Todas no se nombra)", () => {
    expect(tituloCompras("por-recibir")).toBe("Compras · Por recibir");
    expect(tituloCompras("sin-gasto")).toBe("Compras · Sin gasto");
    expect(tituloCompras("completas")).toBe("Compras · Completas");
    expect(tituloCompras("todas")).toBe("Compras");
    expect(tituloCompras(null)).toBe("Compras");
  });
});

describe("periodo corto (días de pared Cancún)", () => {
  it("un día, un mes parcial, el mes completo", () => {
    expect(periodoCorto("2026-10-14", "2026-10-14")).toBe("14 oct 2026");
    expect(periodoCorto("2026-10-01", "2026-10-14")).toBe("1–14 oct 2026");
    expect(periodoCorto("2026-09-01", "2026-09-30")).toBe("septiembre 2026");
    expect(periodoCorto("2026-02-01", "2026-02-28")).toBe("febrero 2026");
    // 2028 es bisiesto: el 28 de febrero NO cierra el mes.
    expect(periodoCorto("2028-02-01", "2028-02-28")).toBe("1–28 feb 2028");
    expect(periodoCorto("2028-02-01", "2028-02-29")).toBe("febrero 2028");
  });

  it("varios meses y años", () => {
    expect(periodoCorto("2026-09-28", "2026-10-14")).toBe("28 sep – 14 oct 2026");
    expect(periodoCorto("2025-12-28", "2026-01-03")).toBe("28 dic 2025 – 3 ene 2026");
    expect(periodoCorto("2026-07-01", "2026-09-30")).toBe("jul – sep 2026");
    expect(periodoCorto("2026-01-01", "2026-12-31")).toBe("2026");
    expect(periodoCorto("2025-11-01", "2026-02-28")).toBe("nov 2025 – feb 2026");
  });

  it("invertido se endereza; un extremo; inválidos", () => {
    expect(periodoCorto("2026-10-14", "2026-10-01")).toBe("1–14 oct 2026");
    expect(periodoCorto("2026-10-01", null)).toBe("desde 1 oct 2026");
    expect(periodoCorto(undefined, "2026-10-14")).toBe("hasta 14 oct 2026");
    expect(periodoCorto("2026-02-30", "2026-03-01")).toBe("hasta 1 mar 2026");
    expect(periodoCorto("2026-13-45", "nada")).toBeNull();
    expect(periodoCorto(null, undefined)).toBeNull();
    // Un ISO con hora no es un día de pared: se ignora.
    expect(periodoCorto("2026-10-01T05:00:00Z", "2026-10-14")).toBe("hasta 14 oct 2026");
  });

  it("los doce meses cortos salen de MESES_LARGOS_ES", () => {
    const cortos = Array.from({ length: 12 }, (_, i) =>
      diaCorto(`2026-${String(i + 1).padStart(2, "0")}-05`),
    );
    expect(cortos).toEqual([
      "5 ene 2026",
      "5 feb 2026",
      "5 mar 2026",
      "5 abr 2026",
      "5 may 2026",
      "5 jun 2026",
      "5 jul 2026",
      "5 ago 2026",
      "5 sep 2026",
      "5 oct 2026",
      "5 nov 2026",
      "5 dic 2026",
    ]);
    expect(diaCorto("2026-10-14")).toBe("14 oct 2026");
    expect(diaCorto("2026-02-30")).toBeNull();
    expect(mesLargo(2026, 10)).toBe("octubre 2026");
    expect(mesLargo(2026, 13)).toBeNull();
    expect(mesLargo(2026, 0)).toBeNull();
    expect(mesLargo(Number.NaN, 10)).toBeNull();
    expect(mesLargo("2026", 10)).toBeNull();
  });
});

describe("libros, reportes y vistas con fecha", () => {
  const avionId = "3f9a1c2e-1234-4abc-8def-0123456789ab";

  it("balance de la flota: el libro y su periodo", () => {
    expect(tituloBalance({ tipo: "vuelatour", modo: "general" }, "2026-10-01", "2026-10-14")).toBe(
      "Balance general · 1–14 oct 2026",
    );
    expect(tituloBalance({ tipo: "vuelatour", modo: "mensual" }, "2026-10-01", "2026-10-14")).toBe(
      "Balance mensual · 1–14 oct 2026",
    );
    expect(tituloBalance({ tipo: "vuelatour", modo: "mensual" }, "2026-09-01", "2026-09-30")).toBe(
      "Balance mensual · septiembre 2026",
    );
  });

  it("balance de un avión: la matrícula (llega con el libro) o el genérico", () => {
    expect(tituloBalance({ tipo: "avion", avionId }, "2026-09-01", "2026-09-30", "XB-PEV")).toBe(
      "Balance XB-PEV · septiembre 2026",
    );
    expect(tituloBalance({ tipo: "avion", avionId }, "2026-10-01", "2026-10-14", null)).toBe(
      "Balance del avión · 1–14 oct 2026",
    );
    expect(tituloBalance({ tipo: "avion", avionId }, "nada", "nada")).toBe("Balance del avión");
  });

  it("reparto de utilidades", () => {
    expect(tituloReparto("2026-10-01", "2026-10-14")).toBe("Reparto de utilidades · 1–14 oct 2026");
    expect(tituloReparto("2026-09-01", "2026-09-30")).toBe("Reparto de utilidades · septiembre 2026");
    expect(tituloReparto(null, null)).toBe("Reparto de utilidades");
  });

  it("calendario: el mes que se ve", () => {
    expect(tituloCalendario(2026, 10)).toBe("Calendario · octubre 2026");
    expect(tituloCalendario(2026, 1)).toBe("Calendario · enero 2026");
    expect(tituloCalendario(2026, 13)).toBe("Calendario");
    expect(tituloCalendario(Number.NaN, 10)).toBe("Calendario");
  });

  it("tacómetros en vivo: el día solo cuando NO es hoy", () => {
    const hoy = "2026-10-14";
    expect(tituloTacometros(undefined, hoy)).toBe("Tacómetros en vivo");
    expect(tituloTacometros("2026-10-14", hoy)).toBe("Tacómetros en vivo");
    expect(tituloTacometros("2026-10-13", hoy)).toBe("Tacómetros en vivo · 13 oct 2026");
    expect(tituloTacometros("nada", hoy)).toBe("Tacómetros en vivo");
  });

  it("comodín de /admin: ruta que no existe (nunca «en construcción» de un módulo que funciona)", () => {
    expect(TITULO_PAGINA_NO_ENCONTRADA).toBe("Página no encontrada");
    expect(tituloComodin("Vuelos")).toBe("Vuelos · Página no encontrada");
    expect(tituloComodin("Vuelos", false)).toBe("Vuelos · Página no encontrada");
    expect(tituloComodin(null)).toBe("Página no encontrada");
    expect(tituloComodin()).toBe(TITULO_PAGINA_NO_ENCONTRADA);
    expect(tituloComodin("  ")).toBe("Página no encontrada");
    // Solo un módulo del menú marcado `comingSoon` dice «En construcción».
    expect(SUFIJO_EN_CONSTRUCCION).toBe("En construcción");
    expect(tituloComodin("Bitácora", true)).toBe("Bitácora · En construcción");
    expect(tituloComodin(null, true)).toBe("Página no encontrada");
  });
});

describe("plantilla del layout raíz (la usa <TituloPestana>, que escribe directo en la pestaña)", () => {
  it("«Vuelo #315 · Beh Kay» ⇒ «Vuelo #315 · Beh Kay · Vuelatour»", () => {
    expect(PLANTILLA_TITULO).toBe("%s · Vuelatour");
    expect(tituloConPlantilla(tituloVuelo(315, "Beh Kay"))).toBe("Vuelo #315 · Beh Kay · Vuelatour");
    expect(tituloConPlantilla(tituloAvion("XB-PEV"))).toBe("Avión XB-PEV · Vuelatour");
  });

  it("un «$&» o «$1» en el nombre del cliente se copia tal cual (no es un patrón de reemplazo)", () => {
    expect(tituloConPlantilla(tituloCotizacion(332, "Fondo $& Cía"))).toBe(
      "Cotización #332 · Fondo $& Cía · Vuelatour",
    );
    expect(tituloConPlantilla(tituloSocio("$1 $' $`"))).toBe("Socio · $1 $' $` · Vuelatour");
  });
});

describe("reglas del texto", () => {
  const muestras = [
    ...Object.values(TITULOS_SECCION),
    ...Object.values(TITULOS_PAGINA),
    ...Object.values(TITULOS_DETALLE),
    tituloVuelo(315, "Beh Kay"),
    tituloBalance({ tipo: "vuelatour", modo: "general" }, "2026-10-01", "2026-10-14"),
    tituloConciliacion("pendientes"),
    tituloComodin(null),
    tituloComodin("Vuelos"),
  ];

  it("ningún título lleva «Vuelatour»: el sufijo lo pone el template del layout raíz", () => {
    for (const t of muestras) expect(t, t).not.toMatch(/vuelatour/i);
  });

  it("el layout raíz conserva su template « · Vuelatour» y su default", () => {
    const layout = leer("app/layout.tsx");
    expect(layout).toContain('template: "%s · Vuelatour"');
    expect(layout).toContain('default: "Vuelatour Admin"');
    expect(layout).toContain(`%s${SEPARADOR_TITULO}Vuelatour`);
    // La copia que aplica <TituloPestana> es IDÉNTICA a la del layout.
    expect(layout).toContain(`template: "${PLANTILLA_TITULO}"`);
  });

  it("nadie arma el título con espacios sobrantes ni separadores dobles", () => {
    for (const t of muestras) {
      expect(t).toBe(t.trim());
      expect(t).not.toMatch(/ {2}|·\s*·/);
    }
  });
});

describe("el módulo es PURO (sin React ni red)", () => {
  const fuente = leer("lib/admin/titulos-pestana.ts");
  const imports = [...fuente.matchAll(/^import[\s\S]*?from\s+["']([^"']+)["'];?$/gm)].map((m) => m[1]);

  it("solo importa módulos puros de lib", () => {
    expect(imports.length).toBeGreaterThan(0);
    for (const ruta of imports) {
      expect(ruta, ruta).toMatch(/^(\.\/[\w-]+|@\/lib\/datetime)$/);
    }
    expect(fuente).not.toMatch(/from\s+["'](react|next|next\/[\w/-]+|server-only)["']/);
    expect(fuente).not.toMatch(/@\/lib\/(api|supabase)\//);
    expect(fuente).not.toMatch(/@\/components\//);
    expect(fuente).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("las pestañas se llaman como los chips de su pantalla", () => {
  /**
   * Las etiquetas de los chips viven en cada página; si alguien renombra un
   * chip, el título dejaría de decir lo mismo. Pasa si la página tiene el
   * texto o si ya usa el mapa de este módulo.
   */
  const casos: Array<{ pagina: string; mapa: string; etiquetas: string[] }> = [
    {
      pagina: "app/admin/conciliacion/page.tsx",
      mapa: "PESTANAS_CONCILIACION",
      etiquetas: Object.values(PESTANAS_CONCILIACION),
    },
    { pagina: "app/admin/expenses/page.tsx", mapa: "PESTANAS_GASTOS", etiquetas: Object.values(PESTANAS_GASTOS) },
    {
      pagina: "app/admin/dashboards/page.tsx",
      mapa: "PESTANAS_ESTADISTICAS",
      etiquetas: Object.values(PESTANAS_ESTADISTICAS),
    },
    {
      pagina: "app/admin/inventory/compras/page.tsx",
      mapa: "PESTANAS_COMPRAS",
      etiquetas: Object.values(PESTANAS_COMPRAS),
    },
  ];

  for (const { pagina, mapa, etiquetas } of casos) {
    it(pagina, () => {
      const src = leer(pagina);
      if (src.includes(mapa)) return;
      for (const e of etiquetas) expect(src, `«${e}» no aparece en ${pagina}`).toContain(e);
    });
  }

  it("las claves de Estadísticas son las de la página (`TabKey`)", () => {
    const src = leer("app/admin/dashboards/page.tsx");
    if (src.includes("PESTANAS_ESTADISTICAS")) return;
    for (const clave of Object.keys(PESTANAS_ESTADISTICAS)) {
      expect(src).toContain(`key: "${clave}"`);
    }
  });
});
