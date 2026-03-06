import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunnyvale Onions & Honey",
  description:
    "Boutique organic onions and specialty honey. Root access to your produce.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
