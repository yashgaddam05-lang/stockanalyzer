import type { ReactNode } from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { Footer } from '@/components/layout/Footer';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <NavBar />
      <main className="flex-1 w-full mx-auto max-w-6xl px-4 sm:px-8 py-8">{children}</main>
      <Footer />
    </div>
  );
}
