import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Home/Navbar/page";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "3d.me | Image to 3D, fully offline",
  description:
    "Turn any 2D image into a textured 3D model in about 30 seconds, running locally with no cloud.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar defaultDark={false} defaultActive={0} sound={false} />
        <main className="flex-1 pb-24 md:pb-0 md:pt-20">{children}</main>
      </body>
    </html>
  );
}
