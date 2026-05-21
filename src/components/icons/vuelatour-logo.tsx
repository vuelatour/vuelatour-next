import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo Vuelatour. Dos variantes:
 *  - `variant="dark"`  → logo claro para fondos oscuros (default, igual al header/footer públicos)
 *  - `variant="light"` → logo oscuro para fondos claros
 *
 * Tamaño controlado por `className` (ej: `h-8 w-auto`).
 */
export function VuelatourLogo({
  className,
  variant = "dark",
  priority = false,
}: {
  className?: string;
  variant?: "light" | "dark";
  priority?: boolean;
}) {
  const src =
    variant === "dark"
      ? "/brand/logo-vuelatour-dark.webp"
      : "/brand/logo-vuelatour.webp";

  return (
    <Image
      src={src}
      alt="Vuelatour"
      width={800}
      height={200}
      priority={priority}
      className={cn("h-8 w-auto md:h-9", className)}
    />
  );
}
