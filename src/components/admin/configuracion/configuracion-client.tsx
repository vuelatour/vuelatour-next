"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BanknotesIcon, CalendarDaysIcon, CameraIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { fmtDateTime } from "@/lib/datetime";
import { updateConfiguracionAction } from "@/app/admin/configuracion/actions";
import type { ConfiguracionFlag } from "@/lib/api/configuracion-server";

/** Clave de config con su propia sección (lista de usuarios, no switch). */
const CLAVE_RESPONSABLES_FACTURACION = "responsables_facturacion";

/**
 * Copy amigable por bandera conocida (el fallback usa la descripción de la
 * BD, así una bandera nueva aparece sola sin tocar el panel).
 */
const FLAGS_UI: Record<
  string,
  {
    titulo: string;
    icon?: typeof CameraIcon;
    encendida: string;
    apagada: string;
    confirmarEncender: string;
    confirmarApagar: string;
  }
> = {
  captura_taco_foto_ia: {
    titulo: "Captura de tacómetro con foto e IA",
    icon: CameraIcon,
    encendida:
      "La app pide al piloto la foto del tacómetro y la IA propone la lectura (la foto queda como evidencia). Consume créditos de IA y memoria del teléfono.",
    apagada:
      "El piloto solo teclea la lectura, sin foto ni IA: no se consumen créditos ni memoria. Las validaciones de coherencia (lectura que retrocede, saltos, duración del tramo) siguen activas.",
    confirmarEncender:
      "Los pilotos volverán a ver la opción de fotografiar el tacómetro y la IA propondrá la lectura. El cambio llega a cada teléfono la siguiente vez que abra la app con internet.",
    confirmarApagar:
      "Los pilotos capturarán la lectura tecleándola, sin foto ni lectura por IA (deja de consumir créditos). Las capturas ya encoladas con foto se siguen aceptando y la oficina podrá seguir ajustando en Tacómetros en vivo. El cambio llega a cada teléfono la siguiente vez que abra la app con internet.",
  },
};

/**
 * Copy amigable de las banderas NUMÉRICAS (traen valor_numerico en la BD):
 * se editan con un input de número, no con el switch. El fallback (clave +
 * descripción de la BD) cubre banderas numéricas nuevas sin tocar el panel.
 */
const NUMERICAS_UI: Record<
  string,
  {
    titulo: string;
    unidad: string;
    ayuda: string;
    icon?: typeof CameraIcon;
    /** Tope (inclusive). Sin él, cualquier número ≥ 0. */
    max?: number;
    /** Paso del input (default 1). */
    step?: number;
  }
> = {
  dias_gracia_gastos_semana: {
    titulo: "Día(s) de gracia de la semana de gastos",
    unidad: "día(s)",
    icon: CalendarDaysIcon,
    ayuda:
      "Los gastos de campo (piloto, mecánico o visitante) se capturan y corrigen dentro de su semana, de lunes a domingo (hora Cancún). Este número dice cuántos días más, tras el domingo, todavía pueden capturar o corregir lo de la semana pasada: 1 = hasta el lunes. La oficina siempre puede editar desde el panel, y todo cambio queda en el historial del vuelo.",
  },
  // Utilidad de la tienda VuelaTour (25-sep-2026): margen sobre el costo FIFO
  // de lo que sale de bodega a un avión sin precio de venta. El API valida
  // 0–100 (400 VALOR_FUERA_DE_RANGO); aquí se valida antes para no gastar
  // el viaje.
  inventario_margen_venta_pct: {
    titulo: "Utilidad de la tienda (margen sobre el costo)",
    unidad: "%",
    icon: BanknotesIcon,
    max: 100,
    step: 0.5,
    ayuda:
      "Cuando una pieza sale de bodega a un avión sin precio de venta, el avión paga el costo FIFO más este porcentaje; esa diferencia es la utilidad de la tienda (25 = costo + 25 %). 0 = las salidas sin precio se cargan a costo, sin utilidad. Un precio de venta capturado en el producto o en la salida siempre gana. Aplica a las salidas NUEVAS: las ya registradas no cambian.",
  },
};

/**
 * Bandera con valor numérico: input + Guardar en lugar del switch (el
 * switch de las booleanas no significa nada aquí y pintaba un toggle roto).
 */
function FlagNumerica({
  flag,
  onSaved,
}: {
  flag: ConfiguracionFlag;
  onSaved: (f: ConfiguracionFlag) => void;
}) {
  const meta = NUMERICAS_UI[flag.clave];
  const Icon = meta?.icon;
  const [valor, setValor] = useState(String(Number(flag.valor_numerico ?? 0)));
  const [pending, startTransition] = useTransition();

  const numero = Number(valor);
  const max = meta?.max;
  const valido =
    valor.trim() !== "" &&
    Number.isFinite(numero) &&
    numero >= 0 &&
    (max == null || numero <= max);
  const sinCambio = valido && numero === Number(flag.valor_numerico ?? 0);

  const guardar = () => {
    if (!valido || sinCambio || pending) return;
    startTransition(async () => {
      const res = await updateConfiguracionAction(flag.clave, {
        valor_numerico: numero,
      });
      if (res.ok && res.data) {
        // Defensa de skew: si el API aún no devuelve valor_numerico, se
        // conserva el tecleado para no degradar la card a switch.
        onSaved({ ...flag, ...res.data, valor_numerico: res.data.valor_numerico ?? numero });
        toast.success("Valor guardado.");
      } else {
        toast.error(res.error ?? "No se pudo guardar el cambio");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1 min-w-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {meta?.titulo ?? flag.clave}
            <Badge variant="outline" className="font-mono">
              {Number(flag.valor_numerico ?? 0)}
              {meta ? ` ${meta.unidad}` : ""}
            </Badge>
          </CardTitle>
          <CardDescription>{flag.descripcion}</CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Input
            type="number"
            min={0}
            max={max}
            step={meta?.step ?? 1}
            inputMode={meta?.step != null && meta.step < 1 ? "decimal" : "numeric"}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardar()}
            className="w-24 text-right"
            disabled={pending}
            aria-label={meta?.titulo ?? flag.clave}
          />
          <Button size="sm" onClick={guardar} disabled={pending || !valido || sinCambio}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {meta?.ayuda && <p className="text-xs text-muted-foreground">{meta.ayuda}</p>}
        {!valido && (
          <p className="text-xs text-destructive mt-1">
            {max != null
              ? `Captura un número de 0 a ${max}.`
              : "Captura un número igual o mayor a 0."}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Último cambio: {fmtDateTime(flag.updated_at)}
        </p>
      </CardContent>
    </Card>
  );
}

export function ConfiguracionClient({
  initial,
}: {
  initial: ConfiguracionFlag[];
}) {
  // «Responsables de facturación» (24-sep-2026) es una LISTA de usuarios
  // (`valor_json`), no un switch: tiene su propia sección. El API nuevo ya la
  // excluye del listado; esto es la defensa por si un API viejo la manda.
  const [flags, setFlags] = useState(() =>
    initial.filter((f) => f.clave !== CLAVE_RESPONSABLES_FACTURACION),
  );
  const [confirmando, setConfirmando] = useState<{
    flag: ConfiguracionFlag;
    nuevo: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const aplicar = () => {
    if (!confirmando) return;
    const { flag, nuevo } = confirmando;
    startTransition(async () => {
      const res = await updateConfiguracionAction(flag.clave, { activa: nuevo });
      if (res.ok && res.data) {
        const actualizado = res.data;
        setFlags((prev) =>
          prev.map((f) => (f.clave === actualizado.clave ? actualizado : f)),
        );
        setConfirmando(null);
        toast.success(
          nuevo ? "Opción activada." : "Opción desactivada.",
        );
      } else {
        toast.error(res.error ?? "No se pudo guardar el cambio");
      }
    });
  };

  const ui = confirmando ? FLAGS_UI[confirmando.flag.clave] : undefined;

  return (
    <>
      <div className="space-y-4">
        {flags.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin banderas de configuración registradas.
          </p>
        )}
        {flags.map((flag) => {
          // Bandera NUMÉRICA (gateada por presencia del campo, no por la
          // clave): input + Guardar — el switch booleano aquí no significa
          // nada y pintaría un toggle roto.
          if (flag.valor_numerico != null) {
            return (
              <FlagNumerica
                key={flag.clave}
                flag={flag}
                onSaved={(actualizado) =>
                  setFlags((prev) =>
                    prev.map((f) => (f.clave === actualizado.clave ? actualizado : f)),
                  )
                }
              />
            );
          }
          const meta = FLAGS_UI[flag.clave];
          const Icon = meta?.icon;
          return (
            <Card key={flag.clave}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                    {meta?.titulo ?? flag.clave}
                    <Badge
                      variant="outline"
                      className={
                        flag.activa
                          ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      }
                    >
                      {flag.activa ? "Activada" : "Desactivada"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{flag.descripcion}</CardDescription>
                </div>
                <Switch
                  checked={flag.activa}
                  onCheckedChange={(v) =>
                    setConfirmando({ flag, nuevo: v })
                  }
                  disabled={pending}
                />
              </CardHeader>
              {meta && (
                <CardContent className="pt-0">
                  <div className="grid gap-2 sm:grid-cols-2 text-xs">
                    <div
                      className={`rounded-lg border p-3 ${flag.activa ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/20 text-muted-foreground"}`}
                    >
                      <p className="font-medium mb-1">Activada</p>
                      <p>{meta.encendida}</p>
                    </div>
                    <div
                      className={`rounded-lg border p-3 ${!flag.activa ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/20 text-muted-foreground"}`}
                    >
                      <p className="font-medium mb-1">Desactivada</p>
                      <p>{meta.apagada}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Último cambio: {fmtDateTime(flag.updated_at)}
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog
        open={!!confirmando}
        onOpenChange={(v) => !v && !pending && setConfirmando(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmando?.nuevo ? "Activar" : "Desactivar"} ·{" "}
              {ui?.titulo ?? confirmando?.flag.clave}
            </DialogTitle>
            <DialogDescription>
              {confirmando
                ? (confirmando.nuevo
                    ? ui?.confirmarEncender
                    : ui?.confirmarApagar) ??
                  `Se ${confirmando.nuevo ? "activará" : "desactivará"} esta bandera para toda la operación.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmando(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={aplicar} disabled={pending}>
              {pending
                ? "Guardando…"
                : confirmando?.nuevo
                  ? "Sí, activar"
                  : "Sí, desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
