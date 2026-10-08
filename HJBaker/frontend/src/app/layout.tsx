import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alferix · AP Invoice Platform",
  description: "AP Invoice Processing Platform by Alferix",
  icons: { icon: "/assets/alferix-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fonts loaded by literal family name so the ported inline-style strings
            ('Sora', 'Manrope', 'JetBrains Mono') resolve exactly as in the prototype. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
