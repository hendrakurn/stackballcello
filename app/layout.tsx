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
      "27f667985e369dcf014e5b6e831f94469152faeb8278a0b6784404db620fb9950dd608725ec4d43941bf188eeb6dd1274ad5ee8eda4dd3f87ee48e0c47332433",
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
