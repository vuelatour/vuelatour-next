import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Vuelatour Admin",
    template: "%s · Vuelatour",
  },
  description: "Sistema de Control Financiero y Operativo",
  applicationName: "Vuelatour",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#102a43" },
  ],
};

// El admin siempre vive en dark (filosofía §8 del DESIGN_SYSTEM). El resto
// respeta localStorage + prefers-color-scheme. Este script corre antes del
// paint para evitar FOUC.
const themeInitScript = `
(function() {
  try {
    var path = window.location.pathname;
    var isAdmin = path === '/admin' || path.indexOf('/admin/') === 0;
    if (isAdmin) {
      document.documentElement.classList.add('dark');
      return;
    }
    var stored = localStorage.getItem('vt-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <QueryProvider>{children}</QueryProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          theme="system"
          toastOptions={{
            classNames: {
              toast: "rounded-xl",
            },
          }}
        />
      </body>
    </html>
  );
}
