/**
 * CUENTA DE DONDE SALIÓ EL PAGO DE UN GASTO (20-oct-2026, API 0.0.100,
 * invariante 98 del API). PURO: sin React ni red.
 *
 * Pedido del cliente (punto 2 de la lista del 20-oct-2026): «cuando
 * registramos un gasto y eliges transferencia que se pueda elegir de cuál
 * banco o cuenta bancaria de las que ya están registradas salió la
 * transferencia, y si no existe alguna que se pueda agregar desde esa parte
 * sin salir a otra pantalla de forma rápida y ágil, la cuenta de paywise
 * entraría en estas opciones de bancos.»
 *
 * Reglas (las aplica el API; aquí solo el espejo de la UI):
 *  - La cuenta va con TRANSFERENCIA, DOMICILIADO y PAYWISE
 *    (`MEDIOS_CON_CUENTA`, copia EXACTA del API). Con otro medio no se pinta
 *    ni viaja; cambiar a efectivo la LIMPIA (el API también).
 *  - Es opcional: sin cuenta el gasto se guarda como siempre.
 *  - El cruce automático NO liga un gasto a un cargo de OTRA cuenta (el
 *    panel lo explica); a mano sí se puede.
 *  - Toda la oficina (ADMIN, FACTURACION, COORDINADOR) da de alta una cuenta
 *    desde el gasto. Editar o dar de baja sigue en «Cuentas bancarias».
 */

/** Medios que llevan la cuenta (espejo de `MEDIOS_CON_CUENTA` del API). */
export const MEDIOS_CON_CUENTA = ["TRANSFERENCIA", "DOMICILIADO", "PAYWISE"] as const;

/** ¿Este medio lleva la cuenta de donde salió el pago? */
export function medioLlevaCuenta(medio: string | null | undefined): boolean {
  return (MEDIOS_CON_CUENTA as readonly string[]).includes((medio ?? "").trim());
}

/** Roles que dan de alta una cuenta desde el gasto (espejo del `@Roles` del POST). */
export const ROLES_ALTA_CUENTA = ["ADMIN", "FACTURACION", "COORDINADOR"] as const;

/** ¿Puede este rol dar de alta una cuenta desde el gasto? Sin rol: no se ofrece. */
export function puedeAgregarCuenta(rol: string | null | undefined): boolean {
  return (ROLES_ALTA_CUENTA as readonly string[]).includes(rol ?? "");
}

/** Opción del selector (respuesta de `GET /v1/bank-accounts/opciones`). */
export interface OpcionCuentaGasto {
  id: string;
  alias: string;
  banco: string | null;
  moneda: string | null;
  tipo: string | null;
  razon_social: string | null;
  activa: boolean;
  /** Últimos 4 dígitos del número de cuenta (nunca el número completo). */
  terminacion: string | null;
}

/** Valor centinela de «＋ Agregar cuenta…» (jamás viaja al API). */
export const VALOR_AGREGAR_CUENTA = "__agregar_cuenta__";
export const ETIQUETA_AGREGAR_CUENTA = "＋ Agregar cuenta…";

export const ETIQUETA_CAMPO_CUENTA = "Cuenta de donde salió";
export const OPCION_SIN_CUENTA = "Sin indicar";
export const PLACEHOLDER_CUENTA = "Elige la cuenta (opcional)";
export const HINT_CUENTA =
  "Opcional. Con la cuenta, el cruce automático con el banco solo busca el pago en esa cuenta.";
export const TEXTO_CUENTAS_CARGANDO = "Cargando las cuentas…";
export const TEXTO_CUENTAS_NO_CARGARON =
  "No se pudieron cargar las cuentas: puedes guardar sin cuenta o reintentar.";
export const MARCA_INACTIVA = " (dada de baja)";

/** «HSBC Pesos · MXN», «Paywise · pasarela», «Amex Ale · MXN · ****2006». */
export function etiquetaOpcionCuenta(c: OpcionCuentaGasto): string {
  const partes = [c.alias];
  if (c.tipo === "PASARELA") partes.push("pasarela");
  else if (c.moneda) partes.push(c.moneda);
  if (c.terminacion) partes.push(`****${c.terminacion}`);
  return `${partes.join(" · ")}${c.activa ? "" : MARCA_INACTIVA}`;
}

/** Descripción (gris) de la opción: el banco, si no está ya en el alias. */
export function descripcionOpcionCuenta(c: OpcionCuentaGasto): string | undefined {
  const banco = (c.banco ?? "").trim();
  if (!banco) return undefined;
  return c.alias.toLowerCase().includes(banco.toLowerCase()) ? undefined : banco;
}

/**
 * Opciones del selector: «Sin indicar» al frente, las ACTIVAS por alias, la
 * actual aunque esté dada de baja (para no perderla al editar) y, con
 * permiso, «＋ Agregar cuenta…» al final.
 */
export function opcionesSelectorCuenta(
  cuentas: readonly OpcionCuentaGasto[],
  opts: { actualId?: string | null; conAgregar?: boolean } = {},
): Array<{ value: string; label: string; description?: string }> {
  const visibles = cuentas
    .filter((c) => c.activa || c.id === opts.actualId)
    .slice()
    .sort((a, b) => a.alias.localeCompare(b.alias, "es"));
  return [
    { value: "", label: OPCION_SIN_CUENTA },
    ...visibles.map((c) => ({
      value: c.id,
      label: etiquetaOpcionCuenta(c),
      description: descripcionOpcionCuenta(c),
    })),
    ...(opts.conAgregar ? [{ value: VALOR_AGREGAR_CUENTA, label: ETIQUETA_AGREGAR_CUENTA }] : []),
  ];
}

/**
 * Cuenta que se sugiere al elegir el medio (solo si el campo está vacío):
 * con PAYWISE, la ÚNICA cuenta tipo pasarela activa. Con transferencia o
 * domiciliado no se adivina nada.
 */
export function cuentaSugeridaParaMedio(
  medio: string | null | undefined,
  cuentas: readonly OpcionCuentaGasto[],
): string | null {
  if (medio !== "PAYWISE") return null;
  const pasarelas = cuentas.filter((c) => c.activa && c.tipo === "PASARELA");
  return pasarelas.length === 1 ? pasarelas[0].id : null;
}

/**
 * La cuenta que VIAJA en el alta: solo con un medio que la lleva y con una
 * cuenta elegida (nunca el centinela). Sin cuenta, la llave no viaja.
 */
export function cuentaParaAlta(
  medio: string | null | undefined,
  cuentaId: string | null | undefined,
): string | undefined {
  if (!medioLlevaCuenta(medio)) return undefined;
  const id = (cuentaId ?? "").trim();
  if (!id || id === VALOR_AGREGAR_CUENTA) return undefined;
  return id;
}

/**
 * La cuenta que VIAJA en el PATCH de «Verificar / editar»: solo si cambió
 * contra la que tenía el gasto al abrir el diálogo. `null` = quitarla (o el
 * medio ya no la lleva y el gasto tenía una).
 */
export function cuentaParaPatch(
  medio: string | null | undefined,
  cuentaId: string | null | undefined,
  cuentaBase: string | null | undefined,
): string | null | undefined {
  const base = cuentaBase ?? null;
  const nueva = medioLlevaCuenta(medio)
    ? ((cuentaId ?? "").trim() && cuentaId !== VALOR_AGREGAR_CUENTA ? (cuentaId as string) : null)
    : null;
  return nueva === base ? undefined : nueva;
}

/** Renglón bajo el monto en Gastos: «Transferencia · HSBC Pesos». */
export function sufijoCuentaPago(
  medio: string | null | undefined,
  alias: string | null | undefined,
): string {
  const a = (alias ?? "").trim();
  return medioLlevaCuenta(medio) && a ? ` · ${a}` : "";
}

// ---------------------------------------------------------------------------
// Alta rápida de una cuenta (desde el gasto)
// ---------------------------------------------------------------------------

export const MONEDAS_CUENTA = [
  { value: "MXN", label: "Pesos (MXN)" },
  { value: "USD", label: "Dólares (USD)" },
] as const;

/** Razón social de la cuenta (enum del API). */
export const RAZONES_SOCIALES_CUENTA = [
  { value: "AEROCHARTER", label: "Aero Charter Cancún" },
  { value: "AERODINAMICA", label: "Aerodinámica" },
  { value: "OTRA", label: "Otra (personal o de un socio)" },
] as const;

export const TIPOS_CUENTA = [
  { value: "BANCO", label: "Cuenta de banco o tarjeta" },
  { value: "PASARELA", label: "Pasarela de pago (como Paywise)" },
] as const;

export interface FormCuentaRapida {
  alias: string;
  banco: string;
  moneda: string;
  razon_social: string;
  tipo: string;
  numero_cuenta: string;
  clabe: string;
}

export const FORM_CUENTA_VACIO: FormCuentaRapida = {
  alias: "",
  banco: "",
  moneda: "MXN",
  razon_social: "AEROCHARTER",
  tipo: "BANCO",
  numero_cuenta: "",
  clabe: "",
};

export const TITULO_CUENTA_RAPIDA = "Agregar cuenta bancaria";
export const DESCRIPCION_CUENTA_RAPIDA =
  "La cuenta queda disponible en todos los gastos y en Conciliación. El número completo y la CLABE son opcionales; se corrigen después en «Cuentas bancarias».";
export const BOTON_GUARDAR_CUENTA = "Agregar cuenta";
export const HINT_ALIAS_CUENTA = "Cómo la reconoce la oficina, p. ej. «HSBC Pesos».";

/** Errores del formulario (los mismos límites del DTO del API). */
export function erroresCuentaRapida(
  f: FormCuentaRapida,
  existentes: readonly OpcionCuentaGasto[] = [],
): Partial<Record<keyof FormCuentaRapida, string>> {
  const e: Partial<Record<keyof FormCuentaRapida, string>> = {};
  const alias = f.alias.trim();
  if (!alias) e.alias = "Escribe el nombre de la cuenta.";
  else if (alias.length > 50) e.alias = "Máximo 50 caracteres.";
  else if (existentes.some((c) => c.alias.trim().toLowerCase() === alias.toLowerCase()))
    e.alias = `Ya existe una cuenta «${alias}»: elígela de la lista.`;
  const banco = f.banco.trim();
  if (!banco) e.banco = "Escribe el banco (o «Paywise»).";
  else if (banco.length > 50) e.banco = "Máximo 50 caracteres.";
  if (!MONEDAS_CUENTA.some((m) => m.value === f.moneda)) e.moneda = "Elige la moneda.";
  if (!RAZONES_SOCIALES_CUENTA.some((r) => r.value === f.razon_social))
    e.razon_social = "Elige de quién es la cuenta.";
  if (!TIPOS_CUENTA.some((t) => t.value === f.tipo)) e.tipo = "Elige el tipo.";
  if (f.numero_cuenta.trim().length > 30) e.numero_cuenta = "Máximo 30 caracteres.";
  const clabe = f.clabe.replace(/\s/g, "");
  if (clabe && !/^\d{18}$/.test(clabe)) e.clabe = "La CLABE son 18 dígitos.";
  return e;
}

/** Cuerpo EXACTO de `POST /v1/bank-accounts` (sin llaves vacías). */
export function cuerpoCuentaRapida(f: FormCuentaRapida): Record<string, string> {
  const cuerpo: Record<string, string> = {
    alias: f.alias.trim(),
    banco: f.banco.trim(),
    moneda: f.moneda,
    razon_social: f.razon_social,
    tipo: f.tipo,
  };
  const numero = f.numero_cuenta.trim();
  if (numero) cuerpo.numero_cuenta = numero;
  const clabe = f.clabe.replace(/\s/g, "");
  if (clabe) cuerpo.clabe = clabe;
  return cuerpo;
}

/** Texto de un rechazo del API al dar de alta la cuenta. */
export function mensajeErrorCuentaRapida(r: {
  status?: number;
  code?: string;
  error?: string;
}): string {
  if (r.code === "CUENTA_ALIAS_DUPLICADO" && r.error) return r.error;
  if (r.status === 403) return "Tu usuario no puede dar de alta cuentas bancarias.";
  if (r.status === 404) return "Falta actualizar el servidor para agregar cuentas desde el gasto.";
  return r.error || "No se pudo agregar la cuenta.";
}

/** Toast tras agregarla. */
export function textoCuentaAgregada(alias: string): string {
  return `Cuenta «${alias}» agregada y elegida en este gasto.`;
}
