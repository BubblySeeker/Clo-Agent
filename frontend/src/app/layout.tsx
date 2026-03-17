import type { Metadata } from "next";
import { DM_Sans, Sora, Cinzel, Josefin_Sans } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/shared/providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  weight: ["400", "500", "600", "700"],
});

const josefinSans = Josefin_Sans({
  subsets: ["latin"],
  variable: "--font-josefin",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CloAgent",
  description: "CloAgent — AI-powered CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
    >
      <html lang="en">
        <body className={`${dmSans.variable} ${sora.variable} ${cinzel.variable} ${josefinSans.variable} ${dmSans.className}`}>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
