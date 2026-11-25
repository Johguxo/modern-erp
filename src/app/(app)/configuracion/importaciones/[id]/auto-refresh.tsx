'use client';

// Vuelve a pedir la página cada 2 segundos mientras el trabajo siga pendiente (se monta solo en
// ese caso, así que al terminar deja de refrescar).
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const INTERVAL_MS = 2000;

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
