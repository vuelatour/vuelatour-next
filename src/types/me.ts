/**
 * Shape de la respuesta de GET /v1/me en el API. Inferido directamente del
 * service del backend mientras agregamos @ApiResponse decorators que dejen
 * el spec OpenAPI completo. Cuando el spec esté completo, esto se reemplazará
 * por el tipo generado en src/types/api.ts.
 */
export type Rol =
  | "ADMIN"
  | "COORDINADOR"
  | "ANALISTA"
  | "FACTURACION"
  | "PILOTO"
  | "SOCIO"
  | "MECANICO"
  // Visitante de trabajo: SOLO registra gastos desde la app móvil (fondo de
  // caja chica + tarjeta corporativa); cero acceso a vuelos ni al panel.
  | "VISITANTE";

export type EstadoUsuario = "ACTIVO" | "INACTIVO" | "INVITADO";

export interface MeResponse {
  id: string;
  supabase_auth_id: string;
  email: string;
  nombre: string;
  rol: Rol;
  estado: EstadoUsuario;
  tiene_fondo_caja: boolean;
  tarjeta_terminacion: string | null;
  es_piloto_externo: boolean;
  telefono: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  /** Dispositivos push del propio usuario (3-sep-2026; ausente = API viejo). */
  push_dispositivos?: number;
  /**
   * Permisos POR PERSONA (26-sep-2026, API 0.0.37, ADITIVO): no dependen del
   * rol — todos los de oficina son ADMIN. Ausente = API previo ⇒ el panel se
   * comporta como hoy (nadie edita una cotización cobrada).
   */
  permisos?: PermisosMe;
  /**
   * Configuración que el API manda junto al usuario. ADITIVA: ausente = API
   * previo. `inicio_oficial` (16-oct-2026, API 0.0.84): «AAAA-MM-DD» del
   * inicio oficial del sistema o `null` (= sin piso, como siempre). Se lee
   * SOLO con `getInicioOficial` / `useInicioOficial`.
   */
  config?: ConfigMe | null;
}

export interface ConfigMe {
  inicio_oficial?: string | null;
  captura_taco_foto_ia?: boolean;
  dias_gracia_gastos_semana?: number;
  gastos_sin_limite_hasta?: string | null;
  /**
   * AFAC por vuelo (16-oct-2026, API 0.0.89, invariante 90): true = la base
   * ya tiene la migración 20261016000005 (costo real por vuelo y la marca
   * «Pago de AFAC» del gasto). Ausente o false ⇒ el panel NO ofrece la
   * casilla ni la celda editable y no manda `es_pago_afac` (el API viejo
   * daría 400 por `forbidNonWhitelisted`). Se lee SOLO con
   * `lib/admin/libro-afac.ts#afacRealHabilitado`.
   */
  afac_real?: boolean;
  /**
   * Gastos «por pagar» (19-oct-2026, API 0.0.95): true = la base ya tiene la
   * migración `20261019000001` y el API manda `estado_pago`, el filtro
   * `?por_pagar=1` y «Marcar pagado». Ausente o false ⇒ todo como antes. Se
   * lee SOLO con `lib/admin/gasto-por-pagar.ts#capacidadPorPagarDeMe`.
   */
  gastos_por_pagar?: boolean;
  /** Tope de la fecha de un gasto para este usuario («YYYY-MM-DD», día Cancún). */
  gasto_fecha_max?: string | null;
}

export interface PermisosMe {
  /**
   * Está en la lista `editores_cotizacion_cobrada` (Configuración): puede
   * editar una cotización que YA tiene cobros. Los demás candados (CFDI, mes
   * cerrado, servicio, grupo) siguen vigentes.
   */
  editar_cotizacion_cobrada?: boolean;
}
