import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

const tektur = localFont({
  src: "./fonts/Tektur-Variable.ttf",
  variable: "--font-tektur",
  weight: "400 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cinsight.moxs.space"),
  title: { default: "Cinsight", template: "%s · Cinsight" },
  description: "Prioritize CFPB complaints that are likely to end in relief.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={tektur.variable}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
