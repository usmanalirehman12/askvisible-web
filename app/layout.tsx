import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AskVisible — Own the AI answer",
  description: "Track how AI engines talk about your brand, see why competitors win, and get fixes that improve your visibility."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
