"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalculatorIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReservaFormSheet } from "./reserva-form-sheet";

interface ClientOption {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}

interface PilotOption {
  id: string;
  nombre: string;
}

export function NewReservaButton({
  clients,
  airports,
  aircraft,
  pilots,
}: {
  clients: ClientOption[];
  airports: AirportOption[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      {/* Un solo punto de entrada: la diferencia real entre los dos caminos
          es CUÁNDO se pone el precio, y eso se explica al momento de elegir
          (dos botones con nombres parecidos confundían a los operadores). */}
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ className: "gap-2" })}>
          <CalendarDaysIcon className="h-4 w-4" />
          Nueva cotización
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuItem onClick={() => setOpen(true)} className="gap-3 py-2.5">
            <CalendarDaysIcon className="h-4 w-4 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Apartar operación (precio después)</span>
              <span className="text-xs text-muted-foreground">
                Captura ya la ruta real, avión, piloto y hora — aparta el
                espacio. El precio al cliente se arma después con
                &ldquo;Cotizar&rdquo;.
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push("/admin/quotes/new")}
            className="gap-3 py-2.5"
          >
            <CalculatorIcon className="h-4 w-4 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Cotizar con precio ahora</span>
              <span className="text-xs text-muted-foreground">
                Cotizador completo: ruta comercial, tarifa, TUAS e IVA al
                momento, listo para mandar al cliente.
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* key por apertura: remonta con el formulario limpio (mismo patrón
          que OperationalLegSheet) sin setState dentro de un efecto. */}
      <ReservaFormSheet
        key={open ? "reserva-open" : "reserva-closed"}
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        airports={airports}
        aircraft={aircraft}
        pilots={pilots}
      />
    </>
  );
}
