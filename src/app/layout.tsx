import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sans = Inter({
  variable: "--font-hm-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-hm-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HashmiMart Admin",
    template: "%s · HashmiMart Admin",
  },
  description: "Operate the HashmiMart catalog, orders, inventory and media end to end.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#06B6D4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            style: {
              borderRadius: "var(--hm-radius-control-lg)",
              border: "1px solid var(--hm-border)",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
