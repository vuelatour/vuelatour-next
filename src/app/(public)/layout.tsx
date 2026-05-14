import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";

/**
 * Layout compartido por la web pública (landing + páginas de servicios).
 * El admin tiene su propio layout en `app/admin/layout.tsx` y no comparte
 * este header/footer. El `pt-16 md:pt-20` compensa el header fijo.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen pt-16 md:pt-20">{children}</main>
      <SiteFooter />
    </>
  );
}
