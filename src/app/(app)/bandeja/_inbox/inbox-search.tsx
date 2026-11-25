'use client';

// Búsqueda de la bandeja (número o motivo) con debounce de 250 ms. Vive en la URL (?q=); al
// cambiar se borra ?page= y se conserva la pestaña. El input guarda su propio estado para no
// perder lo que se escribe mientras la URL se actualiza.
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useEffect, useId, useRef, useState } from 'react';

import { Input } from '@/ui/components/input';
import { Label } from '@/ui/components/label';
import { messages } from '@/ui/messages/es-PE';

const t = messages.inbox;
const DEBOUNCE_MS = 250;

export function InboxSearch({ q }: { q: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchId = useId();
  const [text, setText] = useState(q ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // El servidor es la fuente de verdad de ?q=, pero lo escrito manda mientras el input tiene el
  // foco: solo se sincroniza (atrás/adelante, cambio de pestaña) cuando el input no lo tiene.
  const [focused, setFocused] = useState(false);
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    if (!focused) setText(q ?? '');
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const replace = (value: string) => {
    // Lee la URL al ejecutarse (no al escribir), para no pisar un cambio posterior de pestaña.
    const next = new URLSearchParams(window.location.search);
    if (value) next.set('q', value);
    else next.delete('q');
    next.delete('page');
    const query = next.toString();
    startTransition(() => {
      router.replace((query ? `${pathname}?${query}` : pathname) as Route);
    });
  };

  return (
    <div className="w-full sm:ml-auto sm:w-72">
      <Label htmlFor={searchId} className="sr-only">
        {t.search}
      </Label>
      <Input
        id={searchId}
        type="search"
        autoComplete="off"
        placeholder={t.searchPlaceholder}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => replace(value.trim()), DEBOUNCE_MS);
        }}
      />
    </div>
  );
}
