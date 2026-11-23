"use client";

import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import {
  AYUDA_AVION_UTILIDADES,
  ETIQUETA_AVION_UTILIDADES,
  ETIQUETA_SOCIO_QUE_PAGA,
  TEXTO_CARGANDO_SOCIOS,
  TEXTO_SIN_SOCIOS,
  opcionesAvionCobro,
  opcionesSocioCobro,
  socioDe,
  type CargaSociosCobro,
  type ErroresCobroUtilidades,
  type SaldoUtilidadesTexto,
} from "@/lib/admin/cobro-utilidades";

/**
 * Campos propios de «Utilidades del socio» en la ficha «Registrar cobro»
 * (23-nov-2026, API 0.0.148): QUIÉN paga (un socio; la empresa no se ofrece)
 * y DE LAS UTILIDADES DE QUÉ AVIÓN se descuenta (los aviones de ese socio),
 * con el renglón gris de lo que hay por entregar de ese avión y cómo queda
 * después del cobro.
 *
 * Solo pinta: la lista se pide al elegir la opción (la ficha guarda el estado
 * de la carga) y TODO texto, opción y propuesta sale de
 * `lib/admin/cobro-utilidades.ts`. Mientras carga o si la lectura falla lo
 * DICE (con «Reintentar» cuando sirve): jamás un selector vacío que parezca
 * «no hay socios».
 */
export function CamposUtilidadesSocio({
  carga,
  socioId,
  avionId,
  aeronaveVueloId,
  errores,
  saldo,
  onSocio,
  onAvion,
  onReintentar,
}: {
  carga: CargaSociosCobro;
  socioId: string;
  avionId: string;
  /** El avión que voló (se marca en la lista: «el avión de este vuelo»). */
  aeronaveVueloId: string | null;
  errores: ErroresCobroUtilidades;
  /** Renglón del saldo del avión elegido (null = el dato no llegó: sin números). */
  saldo: SaldoUtilidadesTexto | null;
  onSocio: (id: string) => void;
  onAvion: (id: string) => void;
  onReintentar: () => void;
}) {
  if (carga.estado === "sin-cargar" || carga.estado === "cargando") {
    return (
      <p
        role="status"
        data-utilidades-socios="cargando"
        className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
      >
        {TEXTO_CARGANDO_SOCIOS}
      </p>
    );
  }
  if (carga.estado === "error") {
    return (
      <div
        role="alert"
        data-utilidades-socios="error"
        className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        <p>{carga.mensaje}</p>
        {carga.reintentable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 cursor-pointer text-xs"
            data-accion="reintentar-socios"
            onClick={onReintentar}
          >
            Reintentar
          </Button>
        )}
      </div>
    );
  }
  if (carga.socios.length === 0) {
    return (
      <p
        role="note"
        data-utilidades-socios="vacio"
        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
      >
        {TEXTO_SIN_SOCIOS}
      </p>
    );
  }
  const socio = socioDe(carga.socios, socioId);
  return (
    <>
      <Field label={ETIQUETA_SOCIO_QUE_PAGA} required error={errores.socio}>
        <SearchableSelect
          options={opcionesSocioCobro(carga.socios)}
          value={socioId}
          onChange={onSocio}
          placeholder="Elige al socio"
          searchPlaceholder="Buscar socio…"
        />
      </Field>
      {socio && (
        <Field
          label={ETIQUETA_AVION_UTILIDADES}
          required
          error={errores.avion}
          hint={
            saldo ? (
              <span data-saldo-utilidades>
                {saldo.texto}
                {saldo.adelantoGeneral && (
                  <span className="mt-0.5 block text-amber-700 dark:text-amber-400" data-adelanto-general>
                    {saldo.adelantoGeneral}
                  </span>
                )}
              </span>
            ) : (
              AYUDA_AVION_UTILIDADES
            )
          }
        >
          <SearchableSelect
            options={opcionesAvionCobro(socio, aeronaveVueloId)}
            value={avionId}
            onChange={onAvion}
            placeholder="Elige el avión"
            searchPlaceholder="Buscar matrícula…"
          />
        </Field>
      )}
    </>
  );
}
