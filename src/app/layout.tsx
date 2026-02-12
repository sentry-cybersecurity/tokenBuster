import type { Metadata } from "next";
import { Geist, Geist_Mono, Tinos, Tiny5 } from "next/font/google";
import "./globals.css";
import ClientLayout from './client-layout';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const tinos = Tinos({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-tinos',
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const tiny5 = Tiny5({
  weight: "400",
  style: "normal",
  subsets: ["latin"],
  variable: "--font-tiny5",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TokenBuster",
  description: "A ChatTemplate to tokenizer Playground",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${tiny5.variable}  ${geistSans.variable} ${geistMono.variable} ${tinos.variable}  antialiased font-tinos`}
      >
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
