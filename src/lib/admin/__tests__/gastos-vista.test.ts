/**
 * Vista de GASTOS en una sola tabla (14-oct-2026) — `lib/admin/gastos-vista.ts`:
 * lectura/validación de la URL (la MISMA en servidor y barra), consultas de la
 * lista, de los contadores y del Excel (que ahora hereda la pestaña), vacíos,
 * pestañas, opciones de los filtros, descripción y búsqueda de cada renglón,
 * línea del teléfono, compra, «Sugerir asignaciones» y el modo «Unir en
 * compra». Textos por igualdad exacta.
 */
import { describe, expect, it } from "vitest";
import { coincideBusqueda } from "@/lib/admin/busqueda";
import {
  AVION_FILTRO_DESCONOCIDO,
  AYUDA_MODO_UNIR,
  AYUDA_UN_SELECCIONADO,
  AYUDA_VISTA,
  CLASE_FILTRO_ACTIVO,
  DESCRIPCION_ERROR_LISTA_GASTOS,
  ENCABEZADOS_GASTOS,
  ENCABEZADO_COLUMNA_UNIR,
  ETIQUETAS_FILTRO_GASTOS,
  ETIQUETA_CHIP_AVION,
  ETIQUETA_FECHA_CAPTURA,
  ETIQUETA_FECHA_GASTO,
  ETIQUETA_FOTOS_COMPROBANTES,
  ETIQUETA_LISTA_GASTOS,
  ETIQUETA_SIN_VISTA_PREVIA,
  ETIQUETA_TOTAL_PENDIENTES,
  ETIQUETA_VISTA,
  INSTRUCCION_MODO_UNIR,
  OPCIONES_CAPTURA,
  OPCIONES_ORDEN_GASTOS,
  PISTA_BUSQUEDA_EXCEL,
  PLACEHOLDER_BUSCAR_GASTOS,
  TEXTO_ACTUALIZANDO,
  TEXTO_BOTON_UNIR,
  TEXTO_DUPLICADO,
  TEXTO_FALTA_VISTO_BUENO,
  TEXTO_LIMPIAR_FILTROS,
  TEXTO_MODO_UNIR,
  TEXTO_QUITAR_FILTROS_GASTOS,
  TEXTO_TERMINAR_BARRA,
  TEXTO_TERMINAR_UNIR,
  TITULO_COLUMNA_UNIR,
  TITULO_DUPLICADO,
  TITULO_ENCABEZADO_COMP,
  TITULO_ENCABEZADO_FECHA,
  TITULO_ERROR_LISTA_GASTOS,
  TITULO_FALTA_VISTO_BUENO,
  TITULO_FECHA_CAPTURA,
  TITULO_FECHA_GASTO,
  TITULO_LIMPIAR_FILTROS,
  TITULO_MINIMO_UNIR,
  TITULO_QUITAR_FILTRO_AVION,
  TITULO_SIN_VISTA_PREVIA,
  TITULO_TERMINAR_UNIR,
  altComprobanteGasto,
  ariaCampoFecha,
  ariaQuitarFiltroAvion,
  ayudaSugerirAsignaciones,
  descripcionGasto,
  etiquetaCompra,
  hayFiltrosGastos,
  hrefQuitarFiltrosGastos,
  leerFiltrosGastos,
  lineaEstadoMovilGasto,
  opcionesAvionFiltroGastos,
  opcionesConTodos,
  queryBaseGastos,
  queryExcelGastos,
  queryListaGastos,
  textoAnalizandoPendientes,
  textoBusquedaGasto,
  textoCorteGastos,
  textoGastosSeleccionados,
  textoPagosCompra,
  textoPropinaGasto,
  tituloAbrirCompra,
  tituloUnirSinSeleccionables,
  tituloVistaGastos,
  vacioGastos,
  type FiltrosGastos,
  type VistaGastos,
} from "@/lib/admin/gastos-vista";
import type { Gasto } from "@/types/expenses";

const UUID = "3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b";
const UUID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const leer = (qs: string) => {
  const p = new URLSearchParams(qs);
  return leerFiltrosGastos((k) => p.get(k));
};

describe("leerFiltrosGastos (la URL, validada igual en servidor y barra)", () => {
  it("sin nada: «todos» y captura «todas»", () => {
    expect(leer("")).toEqual({ vista: "todos", captura: "todas" });
  });

  it("f: pendientes | duplicados; cualquier otra cosa ⇒ todos", () => {
    expect(leer("f=pendientes").vista).toBe("pendientes");
    expect(leer("f=duplicados").vista).toBe("duplicados");
    expect(leer("f=PENDIENTES").vista).toBe("todos");
    expect(leer("f=otra").vista).toBe("todos");
  });

  it("uuid inválido se ignora (avión y quién capturó)", () => {
    expect(leer(`aeronave_id=${UUID}&piloto=${UUID2}`)).toMatchObject({ aeronave_id: UUID, piloto: UUID2 });
    const f = leer("aeronave_id=N4142R&piloto=123");
    expect(f.aeronave_id).toBeUndefined();
    expect(f.piloto).toBeUndefined();
  });

  it("categoría: una de las 22, exacta (desconocida o en minúsculas se ignora)", () => {
    expect(leer("categoria=PERSONAL_DUENO").categoria).toBe("PERSONAL_DUENO");
    expect(leer("categoria=COMISION_VENDEDOR_AVION").categoria).toBe("COMISION_VENDEDOR_AVION");
    expect(leer("categoria=VISITA").categoria).toBe("VISITA");
    expect(leer("categoria=comida").categoria).toBeUndefined();
    expect(leer("categoria=PISTA_VIP").categoria).toBeUndefined();
  });

  it("medio fuera del catálogo de captura (incluido BODEGA) se ignora", () => {
    expect(leer("medio=DOMICILIADO").medio).toBe("DOMICILIADO");
    expect(leer("medio=BODEGA").medio).toBeUndefined();
    expect(leer("medio=CHEQUE").medio).toBeUndefined();
  });

  it("rango de fecha del gasto: inválido se ignora e invertido se corrige", () => {
    expect(leer("desde=2026-10-31&hasta=2026-10-01")).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(leer("desde=2026-13-45").desde).toBeUndefined();
  });

  it("facturación (4 + NO_FACTURADA) y banco (conciliados | sin_conciliar)", () => {
    expect(leer("facturacion=NO_FACTURADA").facturacion).toBe("NO_FACTURADA");
    expect(leer("facturacion=NO_FACTURABLE").facturacion).toBe("NO_FACTURABLE");
    expect(leer("facturacion=OTRA").facturacion).toBeUndefined();
    expect(leer("banco=sin_conciliar").banco).toBe("sin_conciliar");
    expect(leer("banco=conciliados").banco).toBe("conciliados");
    expect(leer("banco=todos").banco).toBeUndefined();
  });

  it("captura: cap=7d ⇒ semana; con un día válido de rango manda el rango; día inexistente se ignora", () => {
    expect(leer("cap=7d").captura).toBe("semana");
    expect(leer("cap=7d&cap_desde=2026-10-01")).toMatchObject({ captura: "rango", cap_desde: "2026-10-01" });
    expect(leer("cap_hasta=2026-10-05")).toMatchObject({ captura: "rango", cap_hasta: "2026-10-05" });
    const f = leer("cap_desde=2026-13-45");
    expect(f.captura).toBe("todas");
    expect(f.cap_desde).toBeUndefined();
    expect(leer("cap=30d").captura).toBe("todas");
  });

  it("orden: captura o nada", () => {
    expect(leer("orden=captura").orden).toBe("captura");
    expect(leer("orden=fecha").orden).toBeUndefined();
  });
});

const HOY = "2026-10-14";

describe("consultas: lista, contadores y Excel", () => {
  it("«Esta semana» = capturado desde hoy Cancún − 7 días; el rango conserva sus dos días; la categoría viaja", () => {
    expect(queryBaseGastos(leer("cap=7d&categoria=COMIDA"), HOY)).toMatchObject({
      capturado_desde: "2026-10-07",
      categoria: "COMIDA",
    });
    expect(queryBaseGastos(leer("cap_desde=2026-10-01&cap_hasta=2026-10-05"), HOY)).toMatchObject({
      capturado_desde: "2026-10-01",
      capturado_hasta: "2026-10-05",
    });
  });

  it("base con todo: nombres del API y banco como booleano", () => {
    const f = leer(
      `aeronave_id=${UUID}&categoria=REFACCION&medio=EFECTIVO&piloto=${UUID2}&desde=2026-10-01&hasta=2026-10-14&facturacion=PENDIENTE&banco=sin_conciliar&orden=captura`,
    );
    expect(queryBaseGastos(f, HOY)).toEqual({
      aeronave_id: UUID,
      categoria: "REFACCION",
      medio_pago: "EFECTIVO",
      usuario_captura_id: UUID2,
      desde: "2026-10-01",
      hasta: "2026-10-14",
      estatus_facturacion: "PENDIENTE",
      conciliado: false,
      capturado_desde: undefined,
      capturado_hasta: undefined,
      orden: "captura",
    });
  });

  it("lista: pendientes/duplicados según la vista (todos sin ninguno)", () => {
    expect(queryListaGastos(leer("f=pendientes"), HOY)).toMatchObject({ pendientes: true });
    expect(queryListaGastos(leer("f=duplicados"), HOY)).toMatchObject({ duplicados: true });
    const todos = queryListaGastos(leer(""), HOY);
    expect("pendientes" in todos).toBe(false);
    expect("duplicados" in todos).toBe(false);
  });

  it("Excel: todo en texto, conciliado «false», y la PESTAÑA (pendientes/duplicados = «true»)", () => {
    const q = queryExcelGastos(leer("f=pendientes&banco=sin_conciliar&categoria=COMIDA&cap=7d"), HOY);
    expect(q).toMatchObject({
      conciliado: "false",
      categoria: "COMIDA",
      capturado_desde: "2026-10-07",
      pendientes: "true",
    });
    expect(q.duplicados).toBeUndefined();
    expect(queryExcelGastos(leer("f=duplicados&banco=conciliados"), HOY)).toMatchObject({
      conciliado: "true",
      duplicados: "true",
    });
    const todos = queryExcelGastos(leer(""), HOY);
    expect(todos.pendientes).toBeUndefined();
    expect(todos.duplicados).toBeUndefined();
    expect(todos.conciliado).toBeUndefined();
    for (const v of Object.values(queryExcelGastos(leer(`aeronave_id=${UUID}&orden=captura`), HOY))) {
      expect(v === undefined || typeof v === "string").toBe(true);
    }
  });
});

describe("hayFiltrosGastos", () => {
  it("el orden NO cuenta; captura, banco, categoría y avión sí", () => {
    expect(hayFiltrosGastos(leer(""))).toBe(false);
    expect(hayFiltrosGastos(leer("orden=captura"))).toBe(false);
    expect(hayFiltrosGastos(leer("f=pendientes"))).toBe(false);
    expect(hayFiltrosGastos(leer("cap=7d"))).toBe(true);
    expect(hayFiltrosGastos(leer("cap_desde=2026-10-01"))).toBe(true);
    expect(hayFiltrosGastos(leer("banco=sin_conciliar"))).toBe(true);
    expect(hayFiltrosGastos(leer("categoria=COMIDA"))).toBe(true);
    expect(hayFiltrosGastos(leer(`aeronave_id=${UUID}`))).toBe(true);
    expect(hayFiltrosGastos(leer("medio=EFECTIVO"))).toBe(true);
    expect(hayFiltrosGastos(leer("desde=2026-10-01"))).toBe(true);
  });
});

describe("vacíos y pestañas", () => {
  it("los 6 vacíos con sus textos exactos", () => {
    const casos: Array<[VistaGastos, boolean, string, string]> = [
      ["todos", false, "Sin gastos capturados", "Aquí verás los gastos que capturen pilotos y oficina."],
      ["pendientes", false, "Sin gastos pendientes", "Todos los gastos que necesitan avión ya lo tienen. Bandeja limpia."],
      ["duplicados", false, "Sin duplicados sospechosos", "Ningún gasto está marcado como posible duplicado."],
      ["todos", true, "Ningún gasto coincide con estos filtros", "Cambia o quita algún filtro para ver más gastos."],
      ["pendientes", true, "Sin pendientes con estos filtros", "Cambia o quita algún filtro para ver más gastos."],
      ["duplicados", true, "Sin duplicados con estos filtros", "Cambia o quita algún filtro para ver más gastos."],
    ];
    for (const [vista, conFiltros, titulo, descripcion] of casos) {
      expect(vacioGastos(vista, conFiltros), `${vista} ${conFiltros}`).toEqual({ titulo, descripcion });
    }
    expect(TEXTO_QUITAR_FILTROS_GASTOS).toBe("Quitar filtros");
  });

  it("«Quitar filtros» conserva la pestaña y el orden", () => {
    expect(hrefQuitarFiltrosGastos("todos")).toBe("/admin/expenses");
    expect(hrefQuitarFiltrosGastos("pendientes")).toBe("/admin/expenses?f=pendientes");
    expect(hrefQuitarFiltrosGastos("duplicados")).toBe("/admin/expenses?f=duplicados");
    expect(hrefQuitarFiltrosGastos("todos", "captura")).toBe("/admin/expenses?orden=captura");
    expect(hrefQuitarFiltrosGastos("pendientes", "captura")).toBe("/admin/expenses?f=pendientes&orden=captura");
  });

  it("pestañas: nombres de siempre y title con la ayuda; un conteo que falló lo dice (jamás «0»)", () => {
    expect(ETIQUETA_VISTA).toEqual({ todos: "Todos", pendientes: "Pendientes", duplicados: "Duplicados" });
    expect(AYUDA_VISTA.todos).toBe("Todos los gastos con los filtros de abajo.");
    expect(tituloVistaGastos("pendientes", 36)).toBe(
      "Gastos que necesitan avión y aún no lo tienen. Debe quedar vacía.",
    );
    expect(tituloVistaGastos("pendientes", null)).toBe(
      "Gastos que necesitan avión y aún no lo tienen. Debe quedar vacía. (no se pudo contar)",
    );
    expect(tituloVistaGastos("duplicados", null)).toBe(
      "Gastos que el sistema marcó como posible duplicado. Revísalos y descarta los que no lo son. (no se pudo contar)",
    );
    expect(tituloVistaGastos("todos", undefined)).toBe("Todos los gastos con los filtros de abajo.");
    expect(tituloVistaGastos("todos", null)).toBe("Todos los gastos con los filtros de abajo.");
  });

  it("chip de avión, corte y error de la lista", () => {
    expect(ETIQUETA_CHIP_AVION).toBe("Avión:");
    expect(TITULO_QUITAR_FILTRO_AVION).toBe("Quitar el filtro de avión");
    expect(ariaQuitarFiltroAvion("N4142R")).toBe("Quitar el filtro de avión N4142R");
    expect(AVION_FILTRO_DESCONOCIDO).toBe("desconocido");
    expect(textoCorteGastos(1000, 1128)).toBe("Mostrando 1000 de 1128 gastos — usa los filtros para acotar la lista.");
    expect(TITULO_ERROR_LISTA_GASTOS).toBe("No se pudieron cargar los gastos");
    expect(DESCRIPCION_ERROR_LISTA_GASTOS).toBe("El servidor no respondió. Pulsa Reintentar: tus filtros se conservan.");
    expect(ETIQUETA_FOTOS_COMPROBANTES).toBe("las fotos de los comprobantes");
    expect(ETIQUETA_TOTAL_PENDIENTES).toBe("el total de pendientes");
  });
});

describe("opciones de la barra", () => {
  it("opcionesConTodos antepone la opción vacía", () => {
    expect(opcionesConTodos("Todas", [{ value: "A", label: "a" }])).toEqual([
      { value: "", label: "Todas" },
      { value: "A", label: "a" },
    ]);
  });

  it("aviones: «Todos», activos A–Z, dados de baja al final; un id desconocido ⇒ «Avión desconocido»", () => {
    const aviones = [
      { id: "3", matricula: "XB-OLD", activa: false },
      { id: "1", matricula: "N990GG", activa: true },
      { id: "2", matricula: "N4142R" },
      { id: "4", matricula: "AA-BAJA", activa: false },
    ];
    expect(opcionesAvionFiltroGastos(aviones)).toEqual([
      { value: "", label: "Todos" },
      { value: "2", label: "N4142R" },
      { value: "1", label: "N990GG" },
      { value: "4", label: "AA-BAJA", description: "Dado de baja" },
      { value: "3", label: "XB-OLD", description: "Dado de baja" },
    ]);
    const conDesconocido = opcionesAvionFiltroGastos(aviones, UUID);
    expect(conDesconocido[conDesconocido.length - 1]).toEqual({ value: UUID, label: "Avión desconocido" });
    expect(opcionesAvionFiltroGastos(aviones, "1")).toHaveLength(5);
  });

  it("textos de la barra", () => {
    expect(CLASE_FILTRO_ACTIVO).toBe("border-brand-600/60 bg-brand-600/5");
    expect(ETIQUETA_FECHA_GASTO).toBe("Fecha del gasto");
    expect(TITULO_FECHA_GASTO).toBe("Fecha del consumo (la del ticket)");
    expect(ETIQUETA_FECHA_CAPTURA).toBe("Fecha de captura");
    expect(TITULO_FECHA_CAPTURA).toBe(
      "Cuándo se capturó (cargó a la app o al panel), en hora Cancún — aunque el ticket traiga otra fecha",
    );
    expect(TEXTO_ACTUALIZANDO).toBe("Actualizando…");
    expect(TEXTO_LIMPIAR_FILTROS).toBe("Limpiar");
    expect(TITULO_LIMPIAR_FILTROS).toBe("Quita todos los filtros; conserva la pestaña, el orden y la búsqueda de la tabla.");
    expect(PISTA_BUSQUEDA_EXCEL).toBe(
      "La búsqueda de la tabla solo filtra lo que ves: el Excel sale con la pestaña y los filtros de arriba.",
    );
    expect(ETIQUETAS_FILTRO_GASTOS).toEqual({
      categoria: "Categoría",
      avion: "Avión",
      facturacion: "Facturación",
      banco: "Banco",
      medio: "Tipo de pago",
      capturo: "Capturó",
      orden: "Ordenar por",
    });
    expect(ariaCampoFecha("Fecha del gasto", "desde")).toBe("Fecha del gasto: desde");
    expect(ariaCampoFecha("Fecha de captura", "hasta")).toBe("Fecha de captura: hasta");
    expect(OPCIONES_CAPTURA.map((o) => [o.valor, o.etiqueta])).toEqual([
      ["todas", "Todas"],
      ["semana", "Esta semana"],
      ["rango", "Rango…"],
    ]);
    expect(OPCIONES_CAPTURA[1].titulo).toBe(
      "Solo lo capturado en los últimos 7 días (aunque el ticket traiga otra fecha): lo que subieron desde la app esta semana",
    );
    expect(OPCIONES_ORDEN_GASTOS.map((o) => o.label)).toEqual(["Fecha del gasto", "Fecha de captura"]);
  });
});

function gasto(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "g-1",
    vuelo_id: null,
    aeronave_id: null,
    usuario_captura_id: "u-1",
    categoria: "OTRO",
    monto: "2763.00",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-14",
    proveedor_id: null,
    medio_pago: "EFECTIVO",
    tarjeta_terminacion: null,
    folio_ticket: "A-77821",
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    estatus_facturacion: "NO_FACTURABLE",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    requiere_visto_bueno: false,
    origen: "OFICINA",
    escala_id: null,
    factura_recibida_id: null,
    notas: "CFE oficina Pago de energía eléctrica",
    created_at: "2026-10-14T15:33:00Z",
    captura: { nombre: "Mary Cruz" },
    ...over,
  } as Gasto;
}

describe("descripción del renglón", () => {
  it("quita el prefijo con la matrícula PROPIA del gasto", () => {
    const g = gasto({ notas: "XA-VGV · Aeropuerto de Cancún (ASUR) · Aterrizaje\nsegunda línea", aeronave: { matricula: "XA-VGV" } });
    expect(descripcionGasto(g)).toEqual({
      texto: "Aeropuerto de Cancún (ASUR) · Aterrizaje",
      title: "XA-VGV · Aeropuerto de Cancún (ASUR) · Aterrizaje\nsegunda línea",
    });
  });

  it("sin matrícula propia no se toca; el prefijo de OTRA matrícula tampoco", () => {
    expect(descripcionGasto(gasto({ notas: "XA-VGV · Aeropuerto" })).texto).toBe("XA-VGV · Aeropuerto");
    expect(descripcionGasto(gasto({ notas: "N4142R · Aeropuerto", aeronave: { matricula: "XA-VGV" } })).texto).toBe(
      "N4142R · Aeropuerto",
    );
  });

  it("solo la matrícula (o el prefijo sin nada más) se conserva", () => {
    expect(descripcionGasto(gasto({ notas: "XA-VGV", aeronave: { matricula: "XA-VGV" } })).texto).toBe("XA-VGV");
    expect(descripcionGasto(gasto({ notas: "XA-VGV · ", aeronave: { matricula: "XA-VGV" } })).texto).toBe("XA-VGV ·");
  });

  it("sin notas: proveedor ⇒ lugar ⇒ null (title null)", () => {
    expect(descripcionGasto(gasto({ notas: null, proveedor: { nombre: "GOGAS" }, lugar: "CUN" }))).toEqual({
      texto: "GOGAS",
      title: null,
    });
    expect(descripcionGasto(gasto({ notas: "  ", proveedor: null, lugar: "CUN" }))).toEqual({ texto: "CUN", title: null });
    expect(descripcionGasto(gasto({ notas: null, proveedor: null, lugar: null }))).toEqual({ texto: null, title: null });
  });

  it("la matrícula se escapa en la regex (un punto no es comodín)", () => {
    expect(descripcionGasto(gasto({ notas: "N1X23 · Hangar", aeronave: { matricula: "N1.23" } })).texto).toBe(
      "N1X23 · Hangar",
    );
  });
});

describe("búsqueda rápida del renglón", () => {
  const otro = gasto();
  const comida = gasto({
    id: "g-2",
    categoria: "COMIDA",
    monto: "564.00",
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "2865",
    folio_ticket: null,
    estatus_facturacion: "PENDIENTE",
    duplicado_sospechado: true,
    requiere_visto_bueno: true,
    notas: "The Money Bar Beach Club",
    origen: "PILOTO",
    captura: { nombre: "Alexander E. Saab" },
  });

  it("encuentra lo que se ve: montos, medio, folio, destino, insignias y banco", () => {
    const t = textoBusquedaGasto(otro);
    for (const q of ["2,763", "2763.00", "$2,763", "efectivo", "A-77821", "vuelatour", "panel", "oficina", "no requiere factura"]) {
      expect(coincideBusqueda(t, q), q).toBe(true);
    }
    const c = textoBusquedaGasto(comida);
    for (const q of ["falta avion", "duplicado", "visto bueno", "sin conciliar", "tarjeta 2865", "saab", "app"]) {
      expect(coincideBusqueda(c, q), q).toBe(true);
    }
  });

  it("un gasto sin esas marcas NO coincide con «falta avion» ni «duplicado»", () => {
    const conAvion = gasto({ categoria: "OPERACIONES", aeronave_id: "a", aeronave: { matricula: "XA-VGV" }, notas: "Aterrizaje" });
    const t = textoBusquedaGasto(conAvion);
    expect(coincideBusqueda(t, "falta avion")).toBe(false);
    expect(coincideBusqueda(t, "duplicado")).toBe(false);
    expect(coincideBusqueda(t, "xa-vgv")).toBe(true);
  });

  it("vuelo y matrículas del reparto", () => {
    const g = gasto({
      vuelo_id: "v",
      vuelo: { folio: "437" },
      repartos: [{ aeronave_id: "a", monto: "1", aeronave: { matricula: "N621TX" } }],
    });
    const t = textoBusquedaGasto(g);
    expect(coincideBusqueda(t, "vuelo 437")).toBe(true);
    expect(coincideBusqueda(t, "n621tx")).toBe(true);
    expect(coincideBusqueda(t, "repartido")).toBe(true);
  });

  it("placeholder exacto", () => {
    expect(PLACEHOLDER_BUSCAR_GASTOS).toBe("Buscar: proveedor, monto, matrícula, folio, vuelo…");
  });
});

describe("línea de estado del teléfono", () => {
  it("monto · avión · factura · banco (solo si aplica) · «Sin comp.»", () => {
    expect(
      lineaEstadoMovilGasto(
        gasto({
          categoria: "OPERACIONES",
          monto: "295.67",
          aeronave_id: "a",
          aeronave: { matricula: "XA-VGV" },
          medio_pago: "TARJETA_CORP",
          estatus_facturacion: "PENDIENTE",
        }),
      ),
    ).toBe("$295.67 MXN · XA-VGV · Factura: Pendiente · Banco: Sin conciliar");
    // Efectivo: el banco no aplica («—») y se omite; sin comprobante se dice.
    expect(
      lineaEstadoMovilGasto(gasto({ categoria: "TAXI", monto: "300", estatus_comprobante: "SIN_COMPROBANTE", estatus_facturacion: "PENDIENTE" })),
    ).toBe("$300 MXN · Falta avión · Factura: Pendiente · Sin comp.");
    expect(lineaEstadoMovilGasto(gasto())).toBe("$2,763 MXN · VuelaTour · Factura: No requiere");
  });
});

describe("compra, celdas e insignias", () => {
  it("pagos de la compra: normal y parcial", () => {
    expect(textoPagosCompra(1, 1)).toEqual({ texto: "1 pago", parcial: null, title: null });
    expect(textoPagosCompra(3, null)).toEqual({ texto: "3 pagos", parcial: null, title: null });
    expect(textoPagosCompra(2, 3)).toEqual({
      texto: "2 de 3 pagos",
      parcial: "(parcial: hay pagos fuera de este filtro)",
      title:
        "La compra tiene pagos que no entran en el filtro o en el corte de esta vista; los totales del grupo son parciales. Abre la compra para verlos todos.",
    });
    expect(tituloAbrirCompra(5)).toBe("Abrir la compra #5");
    expect(etiquetaCompra(5)).toBe("Compra #5");
  });

  it("propina y alt del comprobante", () => {
    expect(textoPropinaGasto("50.00", "MXN")).toBe("incl. propina $50 MXN");
    expect(textoPropinaGasto("12.5", "USD")).toBe("incl. propina $12.50 USD");
    expect(textoPropinaGasto("0", "MXN")).toBeNull();
    expect(textoPropinaGasto(null, "MXN")).toBeNull();
    expect(altComprobanteGasto("PERSONAL_DUENO")).toBe("Comprobante · Gasto personal del dueño");
  });

  it("constantes de la tabla", () => {
    expect(TEXTO_DUPLICADO).toBe("¿Duplicado?");
    expect(TITULO_DUPLICADO).toBe("Posible duplicado: revísalo y, si no lo es, márcalo con «No es duplicado» en el menú ⋯.");
    expect(TEXTO_FALTA_VISTO_BUENO).toBe("Falta visto bueno");
    expect(TITULO_FALTA_VISTO_BUENO).toBe(
      "Prellenado con IA desde la app: pendiente del visto bueno de administración (menú ⋯ → Dar visto bueno).",
    );
    expect(ETIQUETA_SIN_VISTA_PREVIA).toBe("Sin vista previa");
    expect(TITULO_SIN_VISTA_PREVIA).toBe(
      "No se pudo cargar la foto del comprobante; recarga la página o ábrelo en «Verificar / editar».",
    );
    expect(TITULO_ENCABEZADO_FECHA).toBe(
      "Fecha del gasto (la del ticket). Debajo: cuándo se capturó y quién lo capturó (hora Cancún).",
    );
    expect(TITULO_ENCABEZADO_COMP).toBe("Comprobante (ticket, factura o voucher)");
    expect(ETIQUETA_LISTA_GASTOS).toBe("Lista de gastos");
    expect(ENCABEZADOS_GASTOS).toEqual({
      fecha: "Fecha",
      concepto: "Concepto",
      monto: "Monto",
      avion: "Avión · vuelo",
      comp: "Comp.",
      compLargo: "Comprobante",
      facturacion: "Facturación",
      banco: "Banco",
      acciones: "Acciones",
    });
  });
});

describe("«Sugerir asignaciones»", () => {
  it("title con el total GLOBAL (36, 1 y null)", () => {
    expect(ayudaSugerirAsignaciones(36)).toBe(
      "Propone el avión de los 36 gastos pendientes de toda la bandeja (no solo de lo filtrado).",
    );
    expect(ayudaSugerirAsignaciones(1)).toBe("Propone el avión del gasto pendiente de la bandeja (no solo de lo filtrado).");
    expect(ayudaSugerirAsignaciones(null)).toBe(
      "No se pudieron contar los pendientes; el análisis revisa toda la bandeja.",
    );
  });

  it("texto de carga", () => {
    expect(textoAnalizandoPendientes(36)).toBe("Analizando 36 pendientes… esto toma unos segundos.");
    expect(textoAnalizandoPendientes(1)).toBe("Analizando 1 pendiente… esto toma unos segundos.");
    expect(textoAnalizandoPendientes(null)).toBe("Analizando los pendientes… esto toma unos segundos.");
  });
});

describe("modo «Unir en compra»", () => {
  it("textos exactos", () => {
    expect(TEXTO_MODO_UNIR).toBe("Unir en compra…");
    expect(TEXTO_TERMINAR_UNIR).toBe("Terminar de unir");
    expect(AYUDA_MODO_UNIR).toBe(
      "Muestra casillas para marcar los pagos de una misma compra (la factura de mercancía y su envío, impuestos…) y unirlos.",
    );
    expect(TITULO_TERMINAR_UNIR).toBe("Oculta las casillas y limpia la selección.");
    expect(INSTRUCCION_MODO_UNIR).toBe(
      "Marca los gastos que son pagos de una misma compra: la factura de mercancía y al menos otro pago (envío, impuestos…).",
    );
    expect(TEXTO_TERMINAR_BARRA).toBe("Terminar");
    expect(ENCABEZADO_COLUMNA_UNIR).toBe("Unir en compra");
    expect(TITULO_COLUMNA_UNIR).toBe("Marca los pagos de una misma compra");
    expect(TEXTO_BOTON_UNIR).toBe("Unir en compra");
    expect(TITULO_MINIMO_UNIR).toBe("Marca al menos dos gastos para unirlos");
    expect(AYUDA_UN_SELECCIONADO).toBe(
      "Marca la factura de mercancía y al menos otro pago (envío, impuestos…). Para un solo gasto usa “Crear compra con esta factura” en su menú.",
    );
    expect(textoGastosSeleccionados(1)).toBe("gasto seleccionado");
    expect(textoGastosSeleccionados(3)).toBe("gastos seleccionados");
  });

  it("sin nada que unir lo explica con las 3 categorías de compra", () => {
    expect(tituloUnirSinSeleccionables()).toBe(
      "En esta vista no hay gastos que se puedan unir: solo gastos sueltos de Refacción, Otros gastos VuelaTour y Operaciones.",
    );
  });
});

// El tipo de los filtros es parte del contrato de la barra.
const _f: FiltrosGastos = { vista: "todos", captura: "todas" };
void _f;
