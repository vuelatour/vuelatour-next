/**
 * FOTOS DE BUCKET PRIVADO con URL FIRMADA que VENCE (1-oct-2026, API 0.0.48).
 *
 * Reporte de la oficina: «las fotos de las facturas no están cargando» — la
 * miniatura de la columna «Comp.» de Gastos salía como una rayita blanca y el
 * visor como una franja delgada. Los archivos estaban sanos: el panel firma
 * las URLs al renderizar la página (1 h) y la oficina deja la pestaña abierta
 * toda la mañana. Al vencer, Supabase responde HTTP 400 JSON
 * `InvalidJWT · "exp" claim timestamp check failed` y el navegador pinta la
 * imagen rota.
 *
 * Este módulo es PURO (sin React ni red; la red se INYECTA) y lo usa
 * `components/admin/image-preview.tsx`:
 *  - `pathDeUrlFirmada` / `vencimientoDeUrlFirmada`: leen la URL de Supabase
 *    (`…/object/sign/<bucket>/<path>?token=<JWT>`).
 *  - `debeRenovarUrl`: ¿hay que pedir otra firma ANTES de usarla?
 *  - `crearFotoFirmada`: la máquina de estados de UNA foto (miniatura + visor
 *    comparten URL): al fallar pide otra firma y reintenta UNA vez; si vuelve
 *    a fallar, placeholder (nunca un `<img>` roto).
 *  - `crearPedidorDeUrls`: junta en UN lote las firmas que piden muchas
 *    miniaturas a la vez. Las server actions de Next se despachan UNA POR UNA
 *    (`docs/01-app/01-getting-started/07-mutating-data.md`): 50 miniaturas
 *    vencidas = 50 viajes en fila (y un «Guardar» de la oficina esperando
 *    detrás). Con el lote son uno por bucket (tope 100 paths, el del API).
 */

/**
 * Buckets que `POST /v1/storage/firmar` acepta (lista blanca del API). Un
 * bucket fuera de aquí ni se manda: el API respondería 400.
 */
export const BUCKETS_FIRMABLES = [
  "gasto-fotos",
  "taco-fotos",
  "cobro-vouchers",
  "planes-vuelo",
  "facturas",
  "estados-cuenta",
  "documentos-flota",
  "ingresos",
  "inventario-fotos",
] as const;

export type BucketFirmable = (typeof BUCKETS_FIRMABLES)[number];

export function esBucketFirmable(b: unknown): b is BucketFirmable {
  return typeof b === "string" && (BUCKETS_FIRMABLES as readonly string[]).includes(b);
}

/** Tope de paths por llamada (`@ArrayMaxSize(100)` del DTO del API). */
export const TOPE_PATHS_FIRMA = 100;

/** Sin vencimiento legible en el token: una URL de más de 50 min se renueva. */
export const EDAD_MAXIMA_URL_MS = 50 * 60 * 1000;

/** Con vencimiento legible: se renueva si le quedan menos de 10 min. */
export const MARGEN_RENOVAR_MS = 10 * 60 * 1000;

/**
 * Entre dos renovaciones AUTOMÁTICAS (por `onError`) de la misma foto. Una
 * firma recién hecha dura 8 h: si falla a los pocos minutos NO es que venció
 * (archivo corrupto, formato que el navegador no pinta, la miniatura carga y
 * el visor no…) y volver a firmar no lo arregla. Sin este freno, «la
 * miniatura cargó» devolvía el reintento y el visor que fallaba con la MISMA
 * URL pedía otra firma, y otra, y otra (ping-pong sin fin). «Reintentar» (el
 * clic de la persona) no pasa por aquí.
 */
export const ESPERA_ENTRE_RENOVACIONES_MS = 5 * 60 * 1000;

const MARCA_FIRMA = "/object/sign/";

/** Largo máximo de un path (`LARGO_MAX_PATH` del API; Storage acepta 1024). */
export const LARGO_MAX_PATH_FIRMA = 1024;

/**
 * ¿El API aceptaría este path? Espejo de `motivoPathInvalido`
 * (`vuelatour-api/src/modules/storage/storage-firma.util.ts`): sin `/`
 * inicial, sin `\`, sin `.`/`..`, sin caracteres de control, nunca una URL
 * completa. IMPORTA porque el API rechaza el LOTE ENTERO (400 `PATH_INVALIDO`)
 * si UN path es inválido: un solo valor viejo en la BD dejaría en placeholder
 * todas las fotos que se renovaron junto con él. El que no pasa ni se manda.
 */
export function esPathFirmable(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.length > LARGO_MAX_PATH_FIRMA) return false;
  if (path.includes("://") || path.startsWith("/") || path.includes("\\")) return false;
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  return !path.split("/").some((seg) => seg === "." || seg === "..");
}

function decodificar(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Payload del JWT de la URL firmada (`?token=`), o null si no se puede leer. */
function payloadDelToken(url: string): Record<string, unknown> | null {
  let token: string | null;
  try {
    token = new URL(url).searchParams.get("token");
  } catch {
    return null;
  }
  const partes = token?.split(".") ?? [];
  if (partes.length !== 3 || !partes[1]) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const relleno = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(relleno)) as unknown;
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Bucket y path de una URL firmada de Supabase
 * (`https://<ref>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=…`).
 * Para los callers que solo reciben la URL (taco-live, histórico del avión).
 * null si no es una URL firmada.
 */
export function pathDeUrlFirmada(
  url: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const i = pathname.indexOf(MARCA_FIRMA);
  if (i < 0) return null;
  const resto = pathname.slice(i + MARCA_FIRMA.length);
  const corte = resto.indexOf("/");
  if (corte <= 0) return null;
  const bucket = decodificar(resto.slice(0, corte));
  if (!bucket) return null;
  // El token trae la llave EXACTA del objeto (`url: "<bucket>/<path>"`): si
  // está, gana sobre el pathname (que pudo pasar por un `encodeURI` de más).
  const claim = payloadDelToken(url)?.url;
  if (typeof claim === "string" && claim.startsWith(`${bucket}/`)) {
    const path = claim.slice(bucket.length + 1);
    if (path) return { bucket, path };
  }
  const path = decodificar(resto.slice(corte + 1));
  if (!path) return null;
  return { bucket, path };
}

/** Vencimiento (epoch ms) que trae el token de la URL firmada; null si no se sabe. */
export function vencimientoDeUrlFirmada(url: string | null | undefined): number | null {
  if (!url) return null;
  const exp = payloadDelToken(url)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
}

/**
 * ¿Hay que pedir otra firma ANTES de usar la URL (abrir el visor, descargar)?
 * Con el vencimiento del token (lo normal): si le quedan menos de 10 min.
 * Sin él: si la URL tiene más de 50 min (`nacioEn` = hora del render o del
 * montaje). Un reloj del equipo adelantado solo provoca una firma de más; uno
 * atrasado lo cubre el reintento por `onError`.
 */
export function debeRenovarUrl({
  url,
  nacioEn,
  ahora,
}: {
  url: string;
  nacioEn: number;
  ahora: number;
}): boolean {
  const vence = vencimientoDeUrlFirmada(url);
  if (vence != null) return vence - ahora < MARGEN_RENOVAR_MS;
  return ahora - nacioEn > EDAD_MAXIMA_URL_MS;
}

// =============================================================================
// Una foto: miniatura + visor
// =============================================================================

export type FaseFoto = "lista" | "renovando" | "fallo";

export interface EstadoFoto {
  /** URL que se pinta; null ⇒ placeholder. */
  url: string | null;
  /** `renovando`: pidiendo otra firma; `fallo`: placeholder con «Reintentar». */
  fase: FaseFoto;
  /** La URL actual YA falló: no se vuelve a pintar (nunca un `<img>` roto). */
  rota: boolean;
  /** Cambia con cada URL nueva o reintento: `key` del `<img>` (lo remonta). */
  intento: number;
}

export interface ConfigFoto {
  /** URL firmada que trajo la página. */
  src: string | null;
  /** Bucket y path del objeto: sin ellos no se puede pedir otra firma. */
  bucket?: string | null;
  path?: string | null;
  /** Hora (epoch ms) en que la página firmó la URL; sin ella, el montaje. */
  firmadaEn?: number | null;
}

export type PedirUrl = (bucket: string, path: string) => Promise<string | null>;

export interface FotoFirmada {
  estado(): EstadoFoto;
  suscribir(oyente: () => void): () => void;
  /** `onError` de la miniatura o del visor, con la URL que se pintó. */
  alFallar(urlPintada: string): Promise<void>;
  /** `onLoad`: la URL sirvió, el reintento automático vuelve a estar disponible. */
  alCargar(urlPintada: string): void;
  /** Botón «Reintentar» / clic en el placeholder. */
  reintentar(): Promise<void>;
  /** Al ABRIR el visor o DESCARGAR: renueva si la URL ya es vieja. null = no hay foto. */
  vigente(): Promise<string | null>;
  /** Llegaron props nuevas (p. ej. `router.refresh()` volvió a firmar). */
  configurar(config: ConfigFoto): void;
}

function estadoInicial(config: ConfigFoto, intento: number): EstadoFoto {
  return {
    url: config.src || null,
    fase: config.src ? "lista" : "fallo",
    rota: false,
    intento,
  };
}

/**
 * Máquina de estados de UNA foto. Reglas:
 *  - `alFallar`: sin bucket/path ⇒ placeholder SIN llamadas; con ellos, pide
 *    otra firma y reintenta UNA vez; si la nueva también falla ⇒ placeholder.
 *    Un `onLoad` exitoso devuelve el reintento (una URL que sirvió y vence
 *    horas después merece otro), pero NUNCA antes de
 *    `ESPERA_ENTRE_RENOVACIONES_MS` desde la anterior: miniatura que carga +
 *    visor que falla con la misma URL no hacen ping-pong de firmas.
 *  - `vigente` (abrir visor / descargar): renueva ANTES de usar una URL vieja.
 *    Si esa renovación falla, se queda la URL que había (puede seguir viva;
 *    si no, la atrapa `alFallar`).
 *  - Una sola firma en vuelo a la vez (miniatura y visor que fallan juntos
 *    piden UNA); la respuesta de una configuración vieja se descarta.
 */
export function crearFotoFirmada(
  configInicial: ConfigFoto,
  deps: { pedirUrl: PedirUrl; ahora?: () => number },
): FotoFirmada {
  const ahora = deps.ahora ?? (() => Date.now());
  let config = configInicial;
  let nacioEn = config.firmadaEn ?? ahora();
  let reintentoUsado = false;
  /** Cuándo `alFallar` pidió la última firma automática (freno anti ping-pong). */
  let renovadaPorFalloEn: number | null = null;
  let generacion = 0;
  let pendiente: Promise<void> | null = null;
  let estado = estadoInicial(config, 0);
  const oyentes = new Set<() => void>();

  const poner = (parcial: Partial<EstadoFoto>) => {
    estado = { ...estado, ...parcial };
    for (const o of oyentes) o();
  };
  const puedeRefrescar = () => Boolean(config.bucket && config.path);

  function renovar(): Promise<void> {
    if (pendiente) return pendiente;
    const gen = generacion;
    const bucket = config.bucket as string;
    const path = config.path as string;
    poner({ fase: "renovando" });
    const p = (async () => {
      let nueva: string | null = null;
      try {
        nueva = await deps.pedirUrl(bucket, path);
      } catch {
        nueva = null;
      }
      if (gen !== generacion) return; // llegaron props nuevas: se descarta
      if (nueva) {
        nacioEn = ahora();
        poner({ url: nueva, fase: "lista", rota: false, intento: estado.intento + 1 });
      } else {
        poner({ fase: estado.rota || !estado.url ? "fallo" : "lista" });
      }
    })();
    pendiente = p;
    void p.finally(() => {
      if (pendiente === p) pendiente = null;
    });
    return p;
  }

  return {
    estado: () => estado,
    suscribir(oyente) {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
    async alFallar(urlPintada) {
      // Un error tardío de una URL que ya se reemplazó no cuenta.
      if (urlPintada !== estado.url || estado.fase === "fallo") return;
      if (pendiente) {
        poner({ rota: true });
        await pendiente;
        return;
      }
      const reciente =
        renovadaPorFalloEn != null &&
        ahora() - renovadaPorFalloEn < ESPERA_ENTRE_RENOVACIONES_MS;
      if (!puedeRefrescar() || reintentoUsado || reciente) {
        poner({ fase: "fallo", rota: true });
        return;
      }
      reintentoUsado = true;
      renovadaPorFalloEn = ahora();
      poner({ rota: true });
      await renovar();
    },
    alCargar(urlPintada) {
      if (urlPintada === estado.url) reintentoUsado = false;
    },
    async reintentar() {
      if (pendiente) return pendiente;
      reintentoUsado = true;
      if (!puedeRefrescar()) {
        // Sin bucket/path no hay a quién pedir otra firma: se vuelve a
        // intentar la MISMA URL (sin llamadas).
        if (estado.url) poner({ fase: "lista", rota: false, intento: estado.intento + 1 });
        return;
      }
      poner({ rota: true });
      await renovar();
    },
    async vigente() {
      if (pendiente) {
        await pendiente;
      } else if (
        estado.fase === "lista" &&
        !estado.rota &&
        estado.url &&
        puedeRefrescar() &&
        debeRenovarUrl({ url: estado.url, nacioEn, ahora: ahora() })
      ) {
        await renovar();
      }
      return estado.fase === "lista" && !estado.rota ? estado.url : null;
    },
    configurar(nueva) {
      if (
        nueva.src === config.src &&
        nueva.bucket === config.bucket &&
        nueva.path === config.path &&
        nueva.firmadaEn === config.firmadaEn
      ) {
        return;
      }
      config = nueva;
      generacion += 1;
      pendiente = null;
      reintentoUsado = false;
      renovadaPorFalloEn = null;
      nacioEn = nueva.firmadaEn ?? ahora();
      estado = estadoInicial(nueva, estado.intento + 1);
      for (const o of oyentes) o();
    },
  };
}

// =============================================================================
// Lote de firmas
// =============================================================================

/** Firma un lote de UN bucket: `{path: url}` (o null si falló). */
export type FirmarLote = (
  bucket: string,
  paths: string[],
) => Promise<Record<string, string> | null>;

/**
 * Junta en UN lote por bucket las firmas pedidas dentro de `esperaMs` (y las
 * parte en trozos de `tope`). Un path repetido viaja una vez y resuelve a
 * todos los que lo pidieron. Nunca rechaza: sin firma ⇒ null.
 */
export function crearPedidorDeUrls(
  firmar: FirmarLote,
  opciones: {
    esperaMs?: number;
    tope?: number;
    programar?: (fn: () => void, ms: number) => void;
  } = {},
): PedirUrl {
  const esperaMs = opciones.esperaMs ?? 25;
  const tope = Math.max(1, opciones.tope ?? TOPE_PATHS_FIRMA);
  const programar = opciones.programar ?? ((fn, ms) => void setTimeout(fn, ms));
  const colas = new Map<string, Map<string, Array<(u: string | null) => void>>>();
  let programado = false;

  const vaciar = () => {
    programado = false;
    const lotes = [...colas];
    colas.clear();
    for (const [bucket, porPath] of lotes) {
      const paths = [...porPath.keys()];
      for (let i = 0; i < paths.length; i += tope) {
        const trozo = paths.slice(i, i + tope);
        void firmar(bucket, trozo)
          .catch(() => null)
          .then((urls) => {
            for (const p of trozo) {
              const url = urls?.[p];
              for (const resolver of porPath.get(p) ?? []) {
                resolver(typeof url === "string" && url ? url : null);
              }
            }
          });
      }
    }
  };

  return (bucket, path) =>
    new Promise<string | null>((resolve) => {
      let porPath = colas.get(bucket);
      if (!porPath) {
        porPath = new Map();
        colas.set(bucket, porPath);
      }
      const lista = porPath.get(path) ?? [];
      lista.push(resolve);
      porPath.set(path, lista);
      if (!programado) {
        programado = true;
        programar(vaciar, esperaMs);
      }
    });
}
