/**
 * MODELO DE IA configurable (2-oct-2026, API 0.0.51).
 *
 * Pedido del cliente (captura de Configuración → Créditos de IA): «dejar una
 * opción en la configuración para adaptar el modelo que quieran utilizar,
 * aunque ahorita dejaremos por default el que estamos usando actualmente».
 *
 * Solo la FORMA del contrato (1:1 con `GET/PUT /v1/config/ia-modelo`, ADMIN).
 * El catálogo, la validación del id, las tarifas y los textos viven en
 * `lib/admin/ia-modelo.ts` (fuente única del panel, con prueba de paridad
 * contra el API). El API guarda la elección en `configuracion_sistema`
 * (clave `ia_modelo`, `valor_json` = id o null) y la manda a pyservices en
 * la cabecera `X-IA-Modelo` de cada petición; sin elección viaja sin
 * cabecera y pyservices usa su `ANTHROPIC_MODEL` (hoy `claude-opus-4-8`).
 */

/** Renglón del catálogo tal como lo manda el API (forma tolerante). */
export interface ModeloIaCatalogoApi {
  id: string;
  nombre?: string | null;
  descripcion?: string | null;
  in_usd_por_millon?: number | null;
  out_usd_por_millon?: number | null;
  [extra: string]: unknown;
}

export interface ModeloIa {
  /** Id elegido en Configuración; `null` = «usar el del servidor». */
  configurado: string | null;
  /**
   * `ANTHROPIC_MODEL` de pyservices (`GET /ia/modelo`, best-effort): `null`
   * cuando pyservices es previo o no contestó — no se sabe cuál es.
   */
  default_servidor: string | null;
  /** El que se usa: `configurado ?? default_servidor`. */
  efectivo: string | null;
  /** Catálogo del API (el panel pinta su COPIA; este solo da nombres). */
  catalogo?: ModeloIaCatalogoApi[] | null;
  actualizado_at?: string | null;
  actualizado_por_nombre?: string | null;
  /**
   * Aviso del CONFIGURADO cuando está fuera del catálogo («verifica que el id
   * exista…» y, sin tarifa, «costo 0…»); `null` sin aviso. Viaja en el GET y
   * en el PUT. Opcional: sin la llave, el panel usa su espejo.
   */
  aviso?: string | null;
}

/**
 * Lectura de la página (nunca lanza):
 *  - `ok` ⇒ la tarjeta «Modelo de IA» se pinta;
 *  - `no-disponible` ⇒ 404 (API previo a 0.0.51) o 401/403: la tarjeta NO
 *    se monta (no hay nada que el operador pueda hacer);
 *  - `fallo` ⇒ red / 5xx / respuesta rara: la tarjeta lo DICE («No se pudo
 *    cargar…»), jamás se esconde como si no existiera.
 */
export type LecturaModeloIa =
  | { estado: "ok"; datos: ModeloIa }
  | { estado: "no-disponible" }
  | { estado: "fallo" };
