import type { Metadata } from "next";
import { Inter } from "next/font/google";
import clsx from "clsx";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Knotly",
  description: "Plan your wedding by chatting with Knotly.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={clsx("h-full bg-gray-50 text-gray-900 antialiased", inter.variable)}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
