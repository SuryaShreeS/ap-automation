"use client";

import Providers from "./providers";
import AppShell from "@/components/AppShell";

export default function Page() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
