/**
 * Helpers PUROS del avión COTIZADO (feedback del cliente 4-sep-2026): en
 * el previo del cotizador, en el detalle y en el PDF se muestra el TIPO
 * de avión cotizado — el MODELO (Seneca, Kodiak, Meridian, Cessna…), NUNCA
 * la matrícula — porque a veces se cotiza en un avión y la ruta operativa
 * va en otro. La lista de modelos la manda el API (`modelos_cotizados`,
 * fuente única con el PDF); aquí solo se formatea.
 */

function limpio(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/**
 * "Piper Seneca V" / "Seneca V · Cessna 206" (modelos distintos separados
 * por «·»). Precedencia: externo → SOLO el modelo del avión ajeno (la
 * referencia de tarifa no se enseña); lista del API si trae algo; si no,
 * el modelo del snapshot/breakdown. null si no hay nada que mostrar.
 */
export function modelosCotizadosTexto(input: {
  esExterno?: boolean | null;
  externoModelo?: string | null;
  /** `modelos_cotizados` del API (GET /v1/quotes/:id). */
  modelos?: string[] | null;
  /** `breakdown.aeronave.modelo` / `calculo_snapshot.aeronave.modelo`. */
  modelo?: string | null;
}): string | null {
  if (input.esExterno) return limpio(input.externoModelo);
  const lista = (input.modelos ?? []).map((m) => limpio(m)).filter((m): m is string => !!m);
  const unicos = lista.filter((m, i) => lista.indexOf(m) === i);
  if (unicos.length > 0) return unicos.join(" · ");
  return limpio(input.modelo);
}

/** «Cotizado en: Piper Seneca V» (null sin modelo). */
export function textoCotizadoEn(
  input: Parameters<typeof modelosCotizadosTexto>[0],
): string | null {
  const m = modelosCotizadosTexto(input);
  return m ? `Cotizado en: ${m}` : null;
}

/**
 * Ficha de avión TOLERANTE: sirve tanto `AvionFichaMin` del API como el avión
 * elegido en el selector del cotizador (`{id, matricula, modelo}` del
 * catálogo) o una ficha a medias.
 */
export interface AvionFichaComparable {
  id?: string | null;
  matricula?: string | null;
  modelo?: string | null;
}

/**
 * «opera en XB-ANU (Cessna 206)» cuando el avión OPERATIVO del vuelo es
 * distinto al COTIZADO (aquí sí matrícula: es vista interna). null si
 * coinciden, si falta alguno (externo, sin avión) o si el API no los manda.
 */
export function textoOperaEn(
  cotizada: AvionFichaComparable | null | undefined,
  operativa: AvionFichaComparable | null | undefined,
): string | null {
  if (!cotizada || !operativa) return null;
  // Mismo avión = mismo ID (dos aviones distintos pueden compartir modelo).
  // Sin ids —fichas parciales del API viejo— se compara matrícula/modelo:
  // nunca se inventa un «opera en» con los mismos datos de los dos lados.
  const idCot = limpio(cotizada.id);
  const idOp = limpio(operativa.id);
  if (idCot && idOp) {
    if (idCot === idOp) return null;
  } else if (
    limpio(cotizada.matricula) === limpio(operativa.matricula) &&
    limpio(cotizada.modelo) === limpio(operativa.modelo)
  ) {
    return null;
  }
  const matricula = limpio(operativa.matricula);
  const modelo = limpio(operativa.modelo);
  if (!matricula && !modelo) return null;
  const ficha = matricula ? `${matricula}${modelo ? ` (${modelo})` : ""}` : modelo;
  return `opera en ${ficha}`;
}

/**
 * Ficha mínima que puede llegar en cualquiera de las formas con las que el
 * API ha expuesto un avión: objeto (`{id, matricula, modelo}`), texto suelto
 * ("Cessna 206") o nada. Se lee así porque `aeronave_cotizada` /
 * `aeronave_utilizada` son ADITIVOS (11-sep-2026): mientras el API no los
 * mande, el panel cae a lo que ya existía. El `id` se conserva porque es lo
 * único con lo que se puede decidir si el avión cambió de verdad.
 */
interface FichaLeida {
  /** id del avión cuando el API lo manda: ÚNICA forma fiable de comparar. */
  id: string | null;
  matricula: string | null;
  modelo: string | null;
}

function fichaDe(valor: unknown): FichaLeida | null {
  if (!valor) return null;
  if (typeof valor === "string") {
    const t = limpio(valor);
    return t ? { id: null, matricula: null, modelo: t } : null;
  }
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    const id = typeof o.id === "string" ? limpio(o.id) : null;
    const matricula = typeof o.matricula === "string" ? limpio(o.matricula) : null;
    const modelo = typeof o.modelo === "string" ? limpio(o.modelo) : null;
    if (!matricula && !modelo) return null;
    return { id, matricula, modelo };
  }
  return null;
}

/** "XB-ANU · Cessna 206" (o solo lo que haya). null si no hay nada. */
function fichaTexto(f: AvionFichaComparable | null): string | null {
  if (!f) return null;
  if (f.matricula && f.modelo) return `${f.matricula} · ${f.modelo}`;
  return f.matricula ?? f.modelo ?? null;
}

/** Forma mínima de la cotización que leen los helpers (tolerante al API viejo). */
export interface QuoteAeronaves {
  es_externo?: boolean | null;
  avion_externo_modelo?: string | null;
  avion_externo_matricula?: string | null;
  modelos_cotizados?: string[] | null;
  aeronave_cotizada?: unknown;
  /** Campo NUEVO del API (11-sep-2026): va al RAÍZ de la cotización / del
   *  snapshot de vuelo, NO dentro de `calculo_snapshot`. */
  aeronave_utilizada?: unknown;
  aeronave_operativa?: unknown;
  calculo_snapshot?: unknown;
  /** Avión asignado al vuelo (respaldo si el API no manda la ficha). */
  aeronave_id?: string | null;
}

/**
 * CONTROL INTERNO (11-sep-2026): «Aeronave cotizada» = con la que se pactó
 * el precio (MODELO del snapshot vigente, nunca matrícula: al cliente se le
 * vende un tipo de avión) y «Aeronave utilizada» = la que hoy tiene asignada
 * el vuelo (matrícula · modelo, porque es vista interna). Si difieren, la
 * oficina debe verlo sin abrir el vuelo.
 *
 * Precedencia (todo ADITIVO, tolera que el API no mande los campos nuevos):
 * campos del RAÍZ que manda el API (`aeronave_cotizada` / `aeronave_utilizada`
 * — ahí viven de verdad, no dentro de `calculo_snapshot`) → los mismos
 * nombres dentro del snapshot (por si algún payload los anida) →
 * `aeronave_operativa` → `modelos_cotizados` / `calculo_snapshot.aeronave` →
 * catálogo por `aeronave_id`. En externos el avión ajeno es ambos.
 *
 * `difieren` se decide por ID cuando el API manda las dos fichas (dos aviones
 * distintos PUEDEN compartir modelo: comparar el texto daría un falso «son el
 * mismo»). Sin ids se compara el modelo utilizado contra los modelos
 * COTIZADOS —en plural: una cotización puede rotar de avión por tramo y
 * `modelos_cotizados` trae varios—, para no pintar la alerta ámbar en un
 * vuelo donde nadie cambió nada.
 */
export function aeronavesDeCotizacion(
  quote: QuoteAeronaves,
  /** Catálogo de aviones para resolver `aeronave_id` cuando el API no manda
   *  la ficha del avión operativo. */
  catalogo?: ReadonlyArray<{ id: string; matricula?: string | null; modelo?: string | null }>,
): {
  cotizada: string | null;
  utilizada: string | null;
  difieren: boolean;
} {
  const snap = (quote.calculo_snapshot ?? null) as Record<string, unknown> | null;
  const snapAeronave = fichaDe(snap?.aeronave);

  const externoFicha = quote.es_externo
    ? fichaDe({
        matricula: quote.avion_externo_matricula ?? null,
        modelo: quote.avion_externo_modelo ?? null,
      })
    : null;

  // COTIZADA: solo el modelo (lo que ve el cliente en el PDF). El campo del
  // RAÍZ manda: es el que devuelve GET /v1/quotes/:id y el snapshot del vuelo.
  const cotizadaFicha =
    fichaDe(quote.aeronave_cotizada) ?? fichaDe(snap?.aeronave_cotizada);
  const cotizada =
    (quote.es_externo ? externoFicha?.modelo : null) ??
    cotizadaFicha?.modelo ??
    modelosCotizadosTexto({
      esExterno: quote.es_externo,
      externoModelo: quote.avion_externo_modelo,
      modelos: quote.modelos_cotizados,
      modelo: snapAeronave?.modelo,
    });

  const utilizadaFicha = fichaAeronaveUtilizada(quote, catalogo);
  const utilizada = fichaTexto(utilizadaFicha);

  return {
    cotizada,
    utilizada,
    difieren: difierenAviones(cotizadaFicha, utilizadaFicha, cotizada),
  };
}

/**
 * ¿El avión cotizado y el utilizado son distintos? Por ID si el API mandó las
 * dos fichas (regla del API, que compara igual); si no, por MODELO contra el
 * conjunto de modelos cotizados (`cotizadaTexto` puede traer varios unidos con
 * « · » cuando la cotización rota de avión por tramo). Sin datos suficientes:
 * false — nunca se inventa una alerta.
 */
function difierenAviones(
  cotizada: AvionFichaComparable | null,
  utilizada: AvionFichaComparable | null,
  cotizadaTexto: string | null,
): boolean {
  if (cotizada?.id && utilizada?.id) return cotizada.id !== utilizada.id;
  const modeloUtilizado = limpio(utilizada?.modelo ?? null);
  if (!modeloUtilizado || !cotizadaTexto) return false;
  const usado = modeloUtilizado.toLocaleLowerCase("es-MX");
  const cotizados = cotizadaTexto
    .split("·")
    .map((m) => m.trim().toLocaleLowerCase("es-MX"))
    .filter(Boolean);
  return !cotizados.includes(usado);
}

/**
 * Avión UTILIZADO (operativo) de la cotización como ficha, para comparar con
 * el COTIZADO. Precedencia: `aeronave_utilizada` del RAÍZ → el mismo nombre
 * dentro del snapshot → `aeronave_operativa` → el avión ajeno cuando es
 * externo → el catálogo por `aeronave_id`.
 *
 * `aeronave_utilizada` la resuelve el API desde los TRAMOS VIVOS (herencia
 * `escala.aeronave_id ?? vuelo.aeronave_id`, helper `avionesUtilizados`) y no
 * de la cabecera a secas (24-sep-2026, #338: cabecera XA-VGV y tramos N4142R
 * ⇒ utilizada N4142R, el avión con el que de verdad se voló). El panel NO la
 * recalcula de las escalas: sería un cálculo paralelo del mismo dato.
 */
export function fichaAeronaveUtilizada(
  quote: QuoteAeronaves,
  catalogo?: ReadonlyArray<{ id: string; matricula?: string | null; modelo?: string | null }>,
): AvionFichaComparable | null {
  const snap = (quote.calculo_snapshot ?? null) as Record<string, unknown> | null;
  const externoFicha = quote.es_externo
    ? fichaDe({
        matricula: quote.avion_externo_matricula ?? null,
        modelo: quote.avion_externo_modelo ?? null,
      })
    : null;
  const delCatalogo =
    quote.aeronave_id && catalogo
      ? (catalogo.find((a) => a.id === quote.aeronave_id) ?? null)
      : null;
  return (
    fichaDe(quote.aeronave_utilizada) ??
    fichaDe(snap?.aeronave_utilizada) ??
    fichaDe(quote.aeronave_operativa) ??
    externoFicha ??
    fichaDe(delCatalogo)
  );
}

// ===== LA COTIZACIÓN ES INDEPENDIENTE DE LA OPERACIÓN (12-sep-2026) =====
//
// Pedido del cliente sobre el folio #298: «al realizar un ajuste en el vuelo
// operativo (cambio de avión) terminó afectando a la cotización; esto no debe
// ser así: se cotiza con un avión y se vuela con otro por distintos motivos,
// pero la cotización no debe verse afectada por cambios en el vuelo
// operativo». Avión COTIZADO = `aeronave_cotizada` / `calculo_snapshot.
// aeronave` (con él se pactó el precio). Avión OPERATIVO = `aeronave_id` del
// vuelo / los tramos. El cotizador SIEMPRE parte del cotizado.

/** Id del avión con el que se PACTÓ el precio (snapshot vigente). null si no hay snapshot. */
export function idAeronaveCotizada(quote: QuoteAeronaves): string | null {
  const snap = (quote.calculo_snapshot ?? null) as Record<string, unknown> | null;
  return (
    idDeAvion(quote.aeronave_cotizada) ??
    idDeAvion(snap?.aeronave_cotizada) ??
    idDeAvion(snap?.aeronave)
  );
}

function idDeAvion(valor: unknown): string | null {
  if (!valor || typeof valor !== "object") return null;
  const id = (valor as Record<string, unknown>).id;
  return typeof id === "string" ? limpio(id) : null;
}

/**
 * Avión con el que ARRANCA el formulario del cotizador (R1 del contrato
 * 12-sep-2026): el COTIZADO, jamás el operativo.
 *
 * `aeronave_cotizada.id` → `calculo_snapshot.aeronave.id` → `aeronave_id`
 * (sin snapshot todavía no hay nada pactado: el avión del vuelo ES la
 * referencia) → el default del catálogo (snapshots legados con `aeronave.id`
 * null y externos sin avión propio: el motor necesita una referencia de
 * tarifa o responde 400).
 *
 * `seleccionables` = el catálogo que alimenta el selector (aeronaves
 * ACTIVAS). Un avión que ya NO está ahí se SALTA: `POST /v1/quotes/calculate`
 * responde 400 «Aeronave inactiva», así que arrancar con él dejaría la
 * cotización imposible de abrir y de editar (regresión que R1 introduce en
 * cotizaciones viejas cuyo avión se dio de baja). Se cae al operativo —si
 * sigue activo— y luego al default; el cotizador AVISA en ámbar
 * (`avisoAvionCotizadoNoSeleccionable`) para que nadie guarde un precio
 * recalculado sin darse cuenta. Sin catálogo (llamadas puras/tests) no se
 * filtra nada.
 */
export function aeronaveInicialDeCotizacion(
  quote: QuoteAeronaves,
  aeronaveDefaultId: string,
  seleccionables?: ReadonlyArray<{ id: string }>,
): string {
  const disponible = (id: string | null): string | null => {
    if (!id) return null;
    if (!seleccionables) return id;
    return seleccionables.some((a) => a.id === id) ? id : null;
  };
  return (
    disponible(idAeronaveCotizada(quote)) ??
    disponible(limpio(quote.aeronave_id ?? null)) ??
    aeronaveDefaultId
  );
}

/**
 * Aviso ámbar cuando el avión COTIZADO ya no se puede elegir (dado de baja):
 * el cotizador arrancó con OTRO avión, así que el desglose que se ve —y el
 * que se guardaría— ya no es el que se pactó. null cuando el cotizado sigue
 * disponible, cuando no hay cotizado o cuando no hay catálogo con el que
 * comparar (nunca se inventa una alarma).
 */
export function avisoAvionCotizadoNoSeleccionable(
  quote: QuoteAeronaves,
  seleccionables: ReadonlyArray<{ id: string }> | null | undefined,
): string | null {
  const cotizada = idAeronaveCotizada(quote);
  if (!cotizada || !seleccionables) return null;
  if (seleccionables.some((a) => a.id === cotizada)) return null;
  const modelo = modelosCotizadosTexto({
    esExterno: quote.es_externo,
    externoModelo: quote.avion_externo_modelo,
    modelos: quote.modelos_cotizados,
    modelo: ((quote.calculo_snapshot ?? null) as { aeronave?: { modelo?: string } } | null)
      ?.aeronave?.modelo,
  });
  return (
    `El avión con el que se cotizó${modelo ? ` (${modelo})` : ""} ya no está ` +
    "activo en el catálogo, así que la hoja se recalculó con otro avión: " +
    "revisa el precio antes de guardar."
  );
}

/**
 * ¿El avión elegido en el cotizador SIGUE siendo el cotizado? Con `true` el
 * panel pinta `modelos_cotizados` del API (fuente única con el PDF); con
 * `false` el operador cambió de avión a propósito y manda el breakdown.
 * Sin snapshot (nada pactado aún) es false: no hay lista del API que respetar.
 */
export function esAeronaveCotizada(
  quote: QuoteAeronaves,
  aeronaveIdSeleccionada: string | null | undefined,
): boolean {
  const cotizada = idAeronaveCotizada(quote);
  if (!cotizada) return false;
  return cotizada === limpio(aeronaveIdSeleccionada ?? null);
}

/**
 * «Opera en N990GG (Seneca V)»: nota TENUE junto al selector del avión de la
 * hoja/cotizador cuando el vuelo vuela en un avión distinto al que se está
 * cotizando. Es informativa — nunca cambia el selector (R5).
 *
 * Con `yaVolo` (24-sep-2026, #338) dice «Voló en N4142R (Piper Seneca V)»: de
 * un vuelo que ya aterrizó no se dice en qué avión «opera».
 */
export function fraseOperaEn(
  cotizada: AvionFichaComparable | null | undefined,
  operativa: AvionFichaComparable | null | undefined,
  opts: { yaVolo?: boolean } = {},
): string | null {
  const t = textoOperaEn(cotizada, operativa);
  if (!t) return null;
  if (opts.yaVolo) return `Voló en ${t.slice("opera en ".length)}`;
  return `${t.charAt(0).toLocaleUpperCase("es-MX")}${t.slice(1)}`;
}

/**
 * Texto del diálogo de confirmación al editar una cotización cuyo vuelo ya
 * tiene tripulación (R5). El anterior («Esta cotización tiene tripulación
 * asignada. ¿Editar?») confundía: sugería que cotización y operación son lo
 * mismo. Ahora explica la separación y, si el API manda el avión utilizado,
 * dice en cuál opera hoy — sin que eso toque lo cotizado.
 */
export function textoConfirmarEdicionCotizacion(input: {
  folio: number | string | null | undefined;
  /** Estado del vuelo: RESERVA ⇒ «reservado»; cualquier otro ⇒ «confirmado». */
  estado?: string | null;
  /** «N990GG · Seneca V» (aeronavesDeCotizacion(...).utilizada). null = no se menciona. */
  aeronaveUtilizada?: string | null;
  /**
   * El vuelo YA VOLÓ (`vueloYaVolo`, 24-sep-2026, #338): un CONFIRMADO con
   * algún tramo con tacómetro. Ahí la cotización ya no avisa a nadie ni mueve
   * la operación, y prometer «la tripulación recibe aviso» sería mentir.
   */
  yaVolo?: boolean;
  /**
   * `estadoVueloVolado(...).termino`. Solo importa con `yaVolo`: un viaje de
   * varios días A MEDIO CAMINO (`termino === false`) sí reagenda —y avisa— su
   * regreso pendiente (el API lo escribe y manda el push), así que decir «la
   * tripulación no recibe aviso» sería falso (revisión adversaria
   * 24-sep-2026). Sin el dato se asume terminado (texto de siempre).
   */
  termino?: boolean;
}): { titulo: string; cuerpo: string } {
  const vuelo = input.folio != null && `${input.folio}`.trim() !== ""
    ? `El vuelo #${input.folio}`
    : "El vuelo";
  const estado = input.estado === "RESERVA" ? "reservado" : "confirmado";
  const opera = limpio(input.aeronaveUtilizada ?? null);
  if (input.yaVolo) {
    const aMedioCamino = input.termino === false;
    return {
      titulo: "La cotización es independiente de la operación. ¿Editar?",
      cuerpo:
        `${vuelo} ya ${aMedioCamino ? "salió" : "voló"}` +
        (opera ? ` en ${opera}` : "") +
        ". La cotización es independiente: aquí editas lo pactado con el " +
        "cliente (con qué avión y cuánto se cobra). " +
        (aMedioCamino
          ? "Lo ya volado no se mueve; si cambias el regreso o la pernocta " +
            "pendientes, la tripulación recibe aviso."
          : "La operación no se mueve y la tripulación no recibe aviso."),
    };
  }
  return {
    titulo: "La cotización es independiente de la operación. ¿Editar?",
    cuerpo:
      `${vuelo} ya está ${estado} con piloto` +
      (opera ? ` y hoy opera en ${opera}` : "") +
      ". La cotización es independiente: aquí editas lo pactado con el " +
      "cliente y el avión con el que se vuela no cambia lo cotizado. Si " +
      "cambias fechas, avión cotizado o pernocta, la tripulación recibe aviso.",
  };
}

/**
 * ¿`modelos_cotizados` del API sigue hablando del avión COTIZADO? (R3 del
 * contrato 12-sep-2026.) El API viejo, con ≥2 aviones en los tramos vivos,
 * listaba los modelos OPERATIVOS: dato de la operación colándose a la hoja y
 * al PDF del cliente. Si la lista NO menciona el modelo con el que se está
 * cotizando, el panel la descarta y pinta el modelo cotizado.
 *
 * Devuelve la lista tal cual cuando es válida (una cotización puede rotar de
 * avión por tramo y traer varios), o `null` para que el llamador derive el
 * modelo del cálculo. Sin modelo con el que comparar se conserva la lista:
 * nunca se esconde información por falta de datos.
 */
export function modelosCotizadosVigentes(
  modelos: string[] | null | undefined,
  modeloCotizado: string | null | undefined,
): string[] | null {
  const lista = (modelos ?? []).map((m) => limpio(m)).filter((m): m is string => !!m);
  if (lista.length === 0) return null;
  const esperado = limpio(modeloCotizado ?? null);
  if (!esperado) return lista;
  const clave = esperado.toLocaleLowerCase("es-MX");
  return lista.some((m) => m.toLocaleLowerCase("es-MX") === clave) ? lista : null;
}

// ===== EL VUELO YA VOLÓ: cambiar el avión es SOLO COMERCIAL (24-sep-2026) =====
//
// Reporte del cliente (cotización #338, CUN→PTU→CUN): se cotizó y se voló en
// el Seneca N4142R; con el vuelo YA COMPLETADO la oficina guardó la v2 con
// «se cobra como cessna, pidieron cessna» (Cessna 206). El API leyó el avión
// nuevo como un cambio DELIBERADO de operación: escribió XA-VGV en la cabecera
// del vuelo (los tramos, con tacómetro, siguieron en N4142R) y le avisó al
// piloto «Ahora vuela en XA-VGV» de un vuelo que ya había aterrizado. Salían
// dos matrículas y nadie sabía con cuál se voló.
//
// REGLA (espejo de `resolverAeronaveDeRevision` del API): si el vuelo ya voló,
// un avión distinto en la cotización es SOLO COMERCIAL — el precio y el
// snapshot se calculan con el avión elegido (con eso se cobra), la operación
// no se toca (ni la cabecera ni los tramos), no se valida squawk como
// asignación y no se avisa a la tripulación. El panel solo lo DICE: la regla
// la aplica el API.

/** Estados en los que el vuelo ya salió (espejo del API). */
export const ESTADOS_VUELO_YA_VOLO: readonly string[] = ["EN_VUELO", "COMPLETADO"];

/** Forma mínima que lee `estadoVueloVolado` (tolera escalas parciales del API). */
export interface VueloYaVoloInput {
  estado?: string | null;
  escalas?: ReadonlyArray<{
    orden?: number | null;
    taco_salida?: unknown;
    taco_llegada?: unknown;
    cancelada_at?: string | null;
  }> | null;
}

/** El viaje ARRANCÓ (`yaVolo`) y/o TERMINÓ (`termino`). Espejo del API. */
export interface EstadoVueloVolado {
  /**
   * El avión YA VOLÓ: estado EN_VUELO o COMPLETADO, o CUALQUIER tramo VIVO
   * (no cancelado; ferries y tramos solo-operativos incluidos: también los
   * voló un avión) con tacómetro de salida o de llegada. Con esto el avión del
   * cotizador es SOLO COMERCIAL y la fecha de SALIDA ya no se mueve desde la
   * cotización. Un CONFIRMADO con el tramo 1 capturado cuenta.
   */
  yaVolo: boolean;
  /**
   * El viaje YA TERMINÓ: COMPLETADO, o el ÚLTIMO tramo vivo (por `orden`) ya
   * tiene tacómetro. Con esto tampoco se mueve la fecha de REGRESO ni se avisa
   * a la tripulación de nada (reagenda, pernocta, itinerario). Un viaje de
   * varios días a medio camino (EN_VUELO, regreso pendiente) SÍ sigue avisando
   * del regreso, que todavía no vuela.
   */
  termino: boolean;
}

function tacoCapturado(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  return typeof v === "string" ? v.trim() !== "" : true;
}

/**
 * ¿El vuelo ya voló / ya terminó? MISMA definición que el API
 * (`estadoVueloVolado` de `quotes/aeronave-revision.util.ts`): si una de las
 * dos cambia, la otra también, o el panel promete (o calla) un aviso que el
 * API no manda.
 */
export function estadoVueloVolado(v: VueloYaVoloInput | null | undefined): EstadoVueloVolado {
  if (!v) return { yaVolo: false, termino: false };
  const e = (v.estado ?? "").toUpperCase();
  const completado = e === "COMPLETADO";
  const conTaco = (t: { taco_salida?: unknown; taco_llegada?: unknown }) =>
    tacoCapturado(t.taco_salida) || tacoCapturado(t.taco_llegada);
  // Mismo orden que el API: por `orden` y, sin él, por posición.
  const clave = (t: { orden?: number | null }, i: number) =>
    Number.isFinite(Number(t.orden)) ? Number(t.orden) : i;
  const vivos = (v.escalas ?? [])
    .filter((t) => !t.cancelada_at)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => clave(a.t, a.i) - clave(b.t, b.i))
    .map(({ t }) => t);
  const ultimo = vivos.length > 0 ? vivos[vivos.length - 1] : null;
  return {
    yaVolo: ESTADOS_VUELO_YA_VOLO.includes(e) || vivos.some(conTaco),
    termino: completado || (ultimo != null && conTaco(ultimo)),
  };
}

/** Atajo de `estadoVueloVolado(v).yaVolo`. */
export function vueloYaVolo(v: VueloYaVoloInput | null | undefined): boolean {
  return estadoVueloVolado(v).yaVolo;
}

/**
 * Texto ÚNICO (diálogo «Guardar vN» y nota junto al selector) cuando se
 * cambia el avión de la cotización de un vuelo que YA VOLÓ:
 *
 * «Este vuelo ya voló en N4142R. Cambiar el avión aquí solo cambia con qué
 * se cobra (Cessna 206); la operación no se mueve ni se avisa a la
 * tripulación.»
 *
 * `volo` = el avión UTILIZADO (`fichaAeronaveUtilizada`: el API lo resuelve de
 * los tramos vivos); se nombra por MATRÍCULA porque es vista interna (sin
 * matrícula, por modelo; sin ninguno, no se inventa). `modeloCobro` = el
 * MODELO elegido en el cotizador (con el que se cobra, lo que ve el cliente).
 */
export function textoCambioAvionVueloVolado(input: {
  volo: AvionFichaComparable | null | undefined;
  modeloCobro: string | null | undefined;
}): string {
  const donde = limpio(input.volo?.matricula ?? null) ?? limpio(input.volo?.modelo ?? null);
  const cobro = limpio(input.modeloCobro ?? null);
  return (
    `Este vuelo ya voló${donde ? ` en ${donde}` : ""}. ` +
    `Cambiar el avión aquí solo cambia con qué se cobra${cobro ? ` (${cobro})` : ""}; ` +
    "la operación no se mueve ni se avisa a la tripulación."
  );
}

/**
 * COMPATIBILIDAD: el API vigente NO valida squawk al cambiar el avión de un
 * vuelo que ya voló (no es una asignación). Si aun así llega el 409
 * `SQUAWK_ALTA_SIN_RESOLVER`, es un backend sin desplegar que todavía trata
 * el cambio como REASIGNACIÓN — confirmarlo movería la cabecera del vuelo al
 * avión nuevo (el bug de la #338). No se ofrece el diálogo: se frena y se dice.
 */
export const MSG_AVION_VUELO_VOLADO_API_VIEJO =
  "Falta actualizar el API: todavía trata el cambio de avión de un vuelo que " +
  "ya voló como una reasignación de la operación (pidió confirmar un squawk " +
  "del avión nuevo). La versión NO se guardó para no mover el vuelo; avisa a " +
  "sistemas. Tus cambios siguen aquí.";

/** Marca ámbar junto al avión utilizado cuando no es el cotizado (espejo del PDF interno). */
export const ETIQUETA_DISTINTO_AL_COTIZADO = "Distinto al cotizado";

/**
 * Ayuda bajo «Aeronave utilizada» (card «Operación»). Con el vuelo ya volado
 * habla en pasado: es el avión con el que SE VOLÓ, no «el que tiene hoy».
 */
export function hintAeronaveUtilizada(input: { difieren: boolean; yaVolo: boolean }): string {
  if (input.difieren) {
    return input.yaVolo
      ? "Voló en un avión distinto al cotizado: el precio se cobra con el cotizado."
      : "Opera en un avión distinto al cotizado: el precio NO cambia solo.";
  }
  return input.yaVolo ? "El avión con el que se voló." : "La que tiene asignada el vuelo hoy.";
}
