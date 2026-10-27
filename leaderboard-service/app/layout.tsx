import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firefly Grove · Daily leaderboard",
  description: "Daily speed-challenge rankings for Firefly Grove. One shared puzzle, one best time per player.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
