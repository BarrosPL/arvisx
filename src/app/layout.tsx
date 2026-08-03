import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ARVISX",
  description: "Sistema de gestao de trafego pago do grupo ARVISX",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Sem isto NENHUM toast aparece - varios componentes chamam toast.success/error
            (excluir proposta, atualizar dados, falha ao executar) e as mensagens iam pro
            vazio, inclusive as de ERRO. Bug real, achado na varredura de codigo morto:
            o componente existia mas nunca tinha sido montado. */}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
