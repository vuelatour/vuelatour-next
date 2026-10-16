"use client";

import { useState } from "react";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { MovimientoDialog } from "./movimiento-dialog";
import type { CajaFondeada, MonedaCaja } from "@/types/caja-chica";

interface MovimientoButtonProps {
  fondoId: string;
  persona: string;
  moneda: MonedaCaja;
  usuarios: { id: string; nombre: string }[];
  /** Caja MADRE: las cajas a las que puede reponer (`cajasParaReponer`); sin ellas, el diálogo de siempre. */
  cajasFondeadas?: CajaFondeada[] | null;
}

export function MovimientoButton(props: MovimientoButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <BanknotesIcon className="h-4 w-4" />
        Registrar movimiento
      </Button>
      <MovimientoDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
