import type { Metadata } from "next";
import { Fleur_De_Leah, Niconne, Sono } from "next/font/google";
import "./globals.css";

const fleurDeLeah = Fleur_De_Leah({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-fleur-de-leah",
});

const niconne = Niconne({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-niconne",
});

const sono = Sono({
  subsets: ["latin"],
  variable: "--font-sono",
});

export const metadata: Metadata = {
  title: "Sunnyvale Onions & Honey",
  description:
    "Boutique organic onions and specialty honey. Root access to your produce.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fleurDeLeah.variable} ${niconne.variable} ${sono.variable}`}>     
      <body className="min-h-screen">{children}</body>
    </html>
  );
}