"use client";

import { useState, useTransition } from "react";
import {
  ArrowUturnLeftIcon,
  EllipsisHorizontalIcon,
  ReceiptRefundIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelarFacturaAction,
  emitirNotaCreditoAction,
} from "@/app/admin/facturas/actions";
import { MOTIVOS_CANCELACION, type Factura } from "@/types/invoices";

export function FacturaActions({ factura }: { factura: Factura }) {
  const [openCancelar, setOpenCancelar] = useState(false);
  const [openNota, setOpenNota] = useState(false);

  // Solo facturas TIMBRADAS tienen acciones. Las notas de crédito (E) no se nota-acreditan.
  const esNota = factura.tipo_comprobante === "E";
  const accionable = factura.estado === "TIMBRADA";
  if (!accionable) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!esNota && (
            <DropdownMenuItem onClick={() => setOpenNota(true)} className="gap-2">
              <ReceiptRefundIcon className="h-4 w-4" />
              Nota de crédito
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setOpenCancelar(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            Cancelar CFDI
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CancelarDialog factura={factura} open={openCancelar} onOpenChange={setOpenCancelar} />
      {!esNota && (
        <NotaCreditoDialog factura={factura} open={openNota} onOpenChange={setOpenNota} />
      )}
    </>
  );
}

function CancelarDialog({
  factura,
  open,
  onOpenChange,
}: {
  factura: Factura;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [motivo, setMotivo] = useState<string>("02");
  const [folioSustitucion, setFolioSustitucion] = useState("");
  const [pending, startTransition] = useTransition();

  const esNota = factura.tipo_comprobante === "E";
  const referencia = factura.uuid_fiscal
    ? `…${factura.uuid_fiscal.slice(-8)}`
    : (factura.fel_referencia ?? "");
  const totalFmt = `$${Number(factura.total).toLocaleString("es-MX")} ${factura.moneda}`;

  const handleCancelar = () => {
    startTransition(async () => {
      const result = await cancelarFacturaAction(factura.id, {
        motivo,
        // El folio de sustitución solo aplica al motivo 01; para el resto se descarta.
        folio_sustitucion: motivo === "01" ? folioSustitucion : "",
      });
      if (result.ok) {
        toast.success("CFDI cancelado ante el SAT");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? "No se pudo cancelar el CFDI");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{esNota ? "Cancelar nota de crédito" : "Cancelar CFDI"}</DialogTitle>
          <DialogDescription>
            {esNota ? (
              <>
                Se cancelará ante el SAT la nota de crédito{" "}
                <span className="font-mono">{referencia}</span> por {totalFmt}. No afecta el
                estado del vuelo.
              </>
            ) : (
              <>
                Se solicitará ante el SAT la cancelación del CFDI{" "}
                <span className="font-mono">{referencia}</span> por {totalFmt}. El vuelo
                quedará disponible para refacturar.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Motivo de cancelación</Label>
            <select
              value={motivo}
              onChange={(e) => {
                const v = e.target.value;
                setMotivo(v);
                if (v !== "01") setFolioSustitucion("");
              }}
              disabled={pending}
              className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {MOTIVOS_CANCELACION.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {motivo === "01" && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                UUID de la factura que la sustituye
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                value={folioSustitucion}
                onChange={(e) => setFolioSustitucion(e.target.value)}
                className="font-mono text-xs"
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <p className="text-xs text-muted-foreground">
                Requerido para el motivo 01 (comprobante con relación).
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Volver
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancelar}
            disabled={pending}
          >
            {pending ? "Cancelando…" : "Cancelar CFDI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotaCreditoDialog({
  factura,
  open,
  onOpenChange,
}: {
  factura: Factura;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [pending, startTransition] = useTransition();

  const totalFactura = Number(factura.total);
  const excedeTotal = monto !== "" && Number(monto) > totalFactura;

  const handleEmitir = () => {
    if (excedeTotal) {
      toast.error(
        `No puede exceder el total de la factura ($${totalFactura.toLocaleString("es-MX")})`,
      );
      return;
    }
    startTransition(async () => {
      const result = await emitirNotaCreditoAction({
        factura_id: factura.id,
        monto: monto || undefined,
        descripcion: descripcion || undefined,
      });
      if (result.ok) {
        toast.success("Nota de crédito timbrada");
        onOpenChange(false);
        setMonto("");
        setDescripcion("");
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? "No se pudo emitir la nota de crédito");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nota de crédito</DialogTitle>
          <DialogDescription>
            CFDI de Egreso relacionado a la factura {factura.uuid_fiscal ?? ""}. Si dejas el monto
            vacío se acredita el total (${Number(factura.total).toLocaleString("es-MX")}{" "}
            {factura.moneda}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Monto a acreditar (opcional)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              max={totalFactura}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="font-mono"
              placeholder={`${totalFactura}`}
            />
            {excedeTotal && (
              <p className="text-xs text-destructive">
                No puede exceder el total de la factura ($
                {totalFactura.toLocaleString("es-MX")})
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Descripción (opcional)</Label>
            <Textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={1000}
              placeholder="Motivo de la nota de crédito"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleEmitir} disabled={pending || excedeTotal}>
            {pending ? "Emitiendo…" : "Emitir nota de crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
