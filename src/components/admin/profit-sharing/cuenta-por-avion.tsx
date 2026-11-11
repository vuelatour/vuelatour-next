import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtMxn } from "@/lib/format";
import {
  AYUDA_COLUMNAS_CUENTA_POR_AVION,
  AYUDA_SECCION_GENERAL,
  ETIQUETA_ENTREGADO_SECCION,
  ETIQUETA_ENTREGADO_SIN_AVION,
  ETIQUETA_GENERO_SECCION,
  NOTA_FILTRO_CUENTA_POR_AVION,
  TEXTO_CUENTA_POR_AVION,
  TEXTO_SIN_MOVIMIENTOS_CUENTA,
  TITULO_CUENTA_POR_AVION,
  claveSeccionAvion,
  etiquetaMes,
  saldoDeSeccionAvion,
  textoMesEnCurso,
  textoRangoSeccion,
  tituloSeccionAvion,
  type ContextoEntrega,
  type ContextoRegistro,
} from "@/lib/admin/reparto-pagos";
import type { SeccionAvionCuenta } from "@/types/reparto-pagos";
import { MovimientosCuenta } from "./movimientos-cuenta";

const ID_TITULO = "cuenta-por-avion-titulo";

/**
 * ESTADO DE CUENTA SEPARADO POR AVIÓN (10-nov-2026, API 0.0.134). Pedido del
 * cliente con la cuenta de un socio de DOS aviones: «está mezclado todos los
 * aviones que tenga un socio en su cuenta; debería ser, dentro de la cuenta
 * del socio, un balance para cada avión, porque las entregas son por avión…
 * lo mete todo en la misma licuadora».
 *
 * En lugar de la card única «Movimientos» (un saldo corrido que mezclaba los
 * aviones) va UNA card por sección del API (`por_avion`): cada avión con sus
 * tres cifras — Generó · Entregado · saldo — y debajo SU tabla, la misma
 * `MovimientosCuenta` de siempre alimentada con los movimientos de ese avión
 * (su columna «Saldo» es el saldo corrido DEL AVIÓN; Editar, Eliminar y el
 * comprobante siguen ahí). Al final, si existe, «A cuenta general (sin
 * avión)»: el saldo inicial y las entregas que no se asignaron a un avión.
 *
 * Aquí no se calcula nada: cada número es el que manda el API para esa
 * sección; las etiquetas y los textos salen de `lib/admin/reparto-pagos.ts`.
 * La página solo monta este componente cuando `saldosPorAvion(datos)` dice
 * que la cuenta se lleva por avión; si no, pinta la card de siempre.
 */
export function CuentaPorAvion({
  secciones,
  desde,
  hasta,
  filtrado,
  mesEnCurso,
  contexto,
  registro,
  puedeRegistrar,
  filtro,
}: {
  secciones: SeccionAvionCuenta[];
  /** Rango que se está viendo (`YYYY-MM`). */
  desde: string;
  hasta: string;
  /** true = la URL trae filtro de meses: las tablas no son toda la cuenta. */
  filtrado: boolean;
  /** `YYYY-MM` del mes en curso (para «incluye $X de Noviembre 2026»). */
  mesEnCurso: string | null;
  /** Para editar una entrega desde su renglón (el mismo de la página). */
  contexto: ContextoEntrega;
  registro: ContextoRegistro;
  puedeRegistrar: boolean;
  /** El filtro «Desde / Hasta» (uno solo para todas las cards). */
  filtro?: React.ReactNode;
}) {
  return (
    <section className="space-y-4" aria-labelledby={ID_TITULO} data-cuenta-por-avion>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-3xl space-y-1">
          <h2 id={ID_TITULO} className="text-base font-medium">
            {TITULO_CUENTA_POR_AVION}
          </h2>
          <p className="text-sm text-muted-foreground" data-texto-cuenta-por-avion>
            {TEXTO_CUENTA_POR_AVION}
          </p>
          <p className="text-xs text-muted-foreground" data-rango-cuenta-por-avion>
            {etiquetaMes(desde)} a {etiquetaMes(hasta)}
            {filtrado && <> · {NOTA_FILTRO_CUENTA_POR_AVION}</>}
          </p>
          <p className="text-xs text-muted-foreground">{AYUDA_COLUMNAS_CUENTA_POR_AVION}</p>
        </div>
        {filtro}
      </div>
      {secciones.map((s) => (
        <SeccionAvion
          key={claveSeccionAvion(s)}
          seccion={s}
          filtrado={filtrado}
          mesEnCurso={mesEnCurso}
          contexto={contexto}
          registro={registro}
          puedeRegistrar={puedeRegistrar}
        />
      ))}
    </section>
  );
}

/** La card de UN avión (o de «a cuenta general»): sus cifras y su tabla. */
function SeccionAvion({
  seccion: s,
  filtrado,
  mesEnCurso,
  contexto,
  registro,
  puedeRegistrar,
}: {
  seccion: SeccionAvionCuenta;
  filtrado: boolean;
  mesEnCurso: string | null;
  contexto: ContextoEntrega;
  registro: ContextoRegistro;
  puedeRegistrar: boolean;
}) {
  // «A cuenta general» no tiene utilidades: sin «Generó».
  const general = !s.aeronave;
  const saldo = saldoDeSeccionAvion(s);
  // La parte del mes EN CURSO todavía cambia: se dice bajo «Generó» y bajo el
  // saldo, igual que en los totales de la cuenta.
  const enCurso = textoMesEnCurso(s.mes_en_curso_mxn, mesEnCurso);
  const rango = filtrado ? textoRangoSeccion(s) : null;
  return (
    <Card data-seccion-cuenta={claveSeccionAvion(s)}>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">{tituloSeccionAvion(s)}</CardTitle>
        {general && <CardDescription>{AYUDA_SECCION_GENERAL}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl
          className={cn("grid gap-x-6 gap-y-3", general ? "sm:grid-cols-2" : "sm:grid-cols-3")}
          data-cifras-seccion
        >
          {!general && (
            <Cifra etiqueta={ETIQUETA_GENERO_SECCION} nota={enCurso}>
              <span className={cn(s.generado_mxn < 0 && "text-destructive")} data-cifra="genero">
                {fmtMxn(s.generado_mxn)}
              </span>
            </Cifra>
          )}
          <Cifra etiqueta={general ? ETIQUETA_ENTREGADO_SIN_AVION : ETIQUETA_ENTREGADO_SECCION}>
            <span data-cifra="entregado">{fmtMxn(s.entregado_mxn)}</span>
          </Cifra>
          <Cifra etiqueta={saldo.etiqueta} nota={enCurso} ayuda={saldo.ayuda}>
            <span className={saldo.clase || undefined} data-cifra="saldo" data-saldo-seccion={saldo.clave}>
              {fmtMxn(saldo.monto)}
            </span>
          </Cifra>
        </dl>
        {rango && (
          <p className="text-xs text-muted-foreground" data-rango-seccion>
            {rango}
          </p>
        )}
        {s.movimientos.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-seccion-sin-movimientos>
            {TEXTO_SIN_MOVIMIENTOS_CUENTA}
          </p>
        ) : (
          <MovimientosCuenta
            movimientos={s.movimientos}
            contexto={contexto}
            registro={registro}
            puedeRegistrar={puedeRegistrar}
            ayuda={null}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Una cifra de la card: etiqueta, número y, debajo, sus notas. */
function Cifra({
  etiqueta,
  nota,
  ayuda,
  children,
}: {
  etiqueta: string;
  /** «incluye $X de Noviembre 2026 (en curso…)». */
  nota?: string | null;
  /** Qué significa la cifra (solo «Pérdida acumulada»). */
  ayuda?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5">
        <span className="block font-mono text-lg font-semibold">{children}</span>
        {nota && <span className="mt-0.5 block text-[11px] text-muted-foreground">{nota}</span>}
        {ayuda && (
          <span className="mt-0.5 block text-[11px] text-muted-foreground" data-ayuda-saldo>
            {ayuda}
          </span>
        )}
      </dd>
    </div>
  );
}
