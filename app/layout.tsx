import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import "./globals.css";

const titleFont = localFont({
  src: "../public/fonts/2222.ttf",
  variable: "--font-title",
  display: "swap",
});

const bodyFont = localFont({
  src: "../public/fonts/rimouski.otf",
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stack Ball Celo",
  description: "Onchain arcade game on Celo. Break stacks, win CELO.",
  other: {
    "talentapp:project_verification":
      "158d99697828b6debe3ab1f52791bf75b10bedab220ecc0afe2c6e2c46e1d6f9246634716e4ba1f4793fb69fe871359be379cb45d4c67979d5bcf6369349a69a",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${titleFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
