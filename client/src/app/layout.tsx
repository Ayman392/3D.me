import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AnimeNavBar } from "@/components/Home/Navbar/page";
import DoodleCrewFooter from "@/components/Home/Footer/page";

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

const items = [
  {
    name: "Home",
    url: "/",
    icon: "home" as const,
  },
  {
    name: "Convert",
    url: "/convert",
    icon: "file-text" as const,
  },
  {
    name: "Pricing",
    url: "/pricing",
    icon: "credit-card" as const,
  },
  {
    name: "About",
    url: "/about",
    icon: "info" as const,
  },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnimeNavBar items={items} defaultActive="Home" />
        {children}
        <DoodleCrewFooter />
      </body>
    </html>
  );
}
