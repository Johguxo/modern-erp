'use client';

// Búsqueda (con debounce de 250 ms) y filtro de estado de las listas del catálogo. Todo vive en
// la URL (?q=&status=); al cambiar cualquiera se borra ?page=. El input guarda su propio estado
// para no perder lo que se escribe mientras la URL se actualiza.
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useEffect, useId, useRef, useState } from 'react';

import { STATUS_FILTERS } from '@/modules/catalog/contracts';
import { Input } from '@/ui/components/input';
import { Label } from '@/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import { messages } from '@/ui/messages/es-PE';

import type { ListParams } from './list-params';

const t = messages.catalog;
const DEBOUNCE_MS = 250;

export function CatalogFilters({ params }: { params: Pick<ListParams, 'q' | 'status'> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchId = useId();
  const statusId = useId();
  const [text, setText] = useState(params.q ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // El servidor es la fuente de verdad de ?q=, pero lo escrito manda mientras el input tiene el
  // foco: solo se sincroniza (atrás/adelante, cambio de pestaña) cuando el input no lo tiene.
  const [focused, setFocused] = useState(false);
  const [prevQ, setPrevQ] = useState(params.q);
  if (params.q !== prevQ) {
    setPrevQ(params.q);
    if (!focused) setText(params.q ?? '');
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const replace = (changes: { q?: string; status?: string }) => {
    // Lee la URL al ejecutarse (no al escribir), para no pisar un cambio posterior.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    const query = next.toString();
    startTransition(() => {
      router.replace((query ? `${pathname}?${query}` : pathname) as Route);
    });
  };

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="grid flex-1 gap-2">
        <Label htmlFor={searchId}>{t.search}</Label>
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
            timer.current = setTimeout(() => replace({ q: value.trim() }), DEBOUNCE_MS);
          }}
        />
      </div>
      <div className="grid gap-2 sm:w-48">
        <Label htmlFor={statusId}>{t.statusFilter}</Label>
        <Select
          value={params.status}
          onValueChange={(value) => {
            clearTimeout(timer.current);
            replace({ status: value });
          }}
        >
          <SelectTrigger id={statusId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {t.statusOptions[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
