import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { getCurrentAuthSession } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { deriveCapabilities, derivePersona } from "@/lib/profile-capabilities";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Basis",
  description: "Your real financial picture — for tech workers and high-income professionals",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentAuthSession();
  const profile = session
    ? await prisma.authUser.findUnique({
        where: { id: session.user.id },
        select: {
          profile: {
            select: {
              profileType: true,
              primaryPersona: true,
              financialCapabilitiesJson: true,
            },
          },
        },
      })
    : null;
  const persona = profile?.profile
    ? derivePersona(profile.profile.primaryPersona, profile.profile.profileType)
    : null;
  const capabilities = profile?.profile
    ? deriveCapabilities(profile.profile.financialCapabilitiesJson, profile.profile.profileType)
    : [];

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar persona={persona} capabilities={capabilities} />
          <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
