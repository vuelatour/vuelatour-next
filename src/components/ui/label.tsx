"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        // «Todas las opciones que sean cliqueables deben tener la clase
        // cursor-pointer» (cliente, 22-sep-2026). Una etiqueta LIGADA a un
        // control (`Field` le pone `htmlFor`) SÍ se puede pulsar: el clic
        // enciende el switch o enfoca el campo. Sin ligar no hace nada, y
        // prometer la manita ahí sería mentir.
        props.htmlFor ? "cursor-pointer" : undefined,
        className
      )}
      {...props}
    />
  )
}

export { Label }
