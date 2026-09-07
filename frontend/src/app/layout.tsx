import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOVARA AI",
  description: "Sovereign AI Reasoning Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}