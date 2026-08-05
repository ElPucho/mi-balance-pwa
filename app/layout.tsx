import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Mi balance · Control de gastos",
  description: "Controla manualmente tus gastos, previsiones y objetivos de ahorro desde el móvil.",
  applicationName: "Mi balance",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mi balance",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: `${basePath}/icon-192.png`, type: "image/png", sizes: "192x192" },
      { url: `${basePath}/icon-512.png`, type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: `${basePath}/apple-touch-icon.png`, type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Mi balance · Control de gastos",
    description: "Una forma sencilla de entender tus gastos y ahorrar mejor.",
    type: "website",
    images: [{ url: `${basePath}/social-card.png`, width: 1536, height: 1024, alt: "Mi balance, control de gastos y ahorro" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7fb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
