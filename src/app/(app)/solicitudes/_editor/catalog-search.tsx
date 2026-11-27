'use client';

// "Agregar desde el catálogo": búsqueda con debounce de 250 ms. Descarta las respuestas viejas
// (si el usuario sigue escribiendo, solo vale la última) y con el texto vacío muestra los primeros 10.
import { useEffect, useId, useState } from 'react';

import { MoneyText } from '@/ui/base/money-text';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { Label } from '@/ui/components/label';
import type { CurrencyCode } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

import { searchCatalogAction } from '../actions';

import type { CatalogItem } from './editor-state';

const t = messages.requests.catalog;
const DEBOUNCE_MS = 250;
const LIMIT = 10;

type Status = 'loading' | 'ready' | 'error';

export function CatalogSearch({
  currency,
  onAdd,
  pick = false,
  title,
}: {
  currency: CurrencyCode;
  onAdd: (product: CatalogItem) => void;
  /** «Elegir» en vez de «Agregar»: el buscador sirve para escoger un producto (E4-H4). */
  pick?: boolean;
  /** Título de la sección; por defecto, «Agregar desde el catálogo». */
  title?: string;
}) {
  const searchId = useId();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<readonly CatalogItem[]>([]);

  useEffect(() => {
    let stale = false;
    const run = async () => {
      setStatus('loading');
      try {
        const result = await searchCatalogAction({ q: text.trim(), limit: LIMIT });
        if (stale) return;
        if (result.ok) {
          setItems(result.data.items);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      } catch {
        if (!stale) setStatus('error');
      }
    };
    // La primera carga (texto vacío) no espera; al escribir, se espera a que pare.
    const timer = setTimeout(() => void run(), text === '' ? 0 : DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <section
      aria-label={title ?? t.title}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-base font-semibold">{title ?? t.title}</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={searchId} className="text-[13px] font-normal text-muted-foreground">
          {t.search}
        </Label>
        <Input
          id={searchId}
          type="search"
          autoComplete="off"
          placeholder={t.searchPlaceholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      <div aria-live="polite">
        {status === 'loading' && items.length === 0 ? (
          <p role="status" className="py-2 text-muted-foreground">
            {t.searching}
          </p>
        ) : null}
        {status === 'error' ? (
          <p role="alert" className="py-2 text-destructive">
            {t.error}
          </p>
        ) : null}
        {status === 'ready' && items.length === 0 ? (
          <p className="py-2 text-muted-foreground">{t.empty}</p>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul aria-label={t.results} aria-busy={status === 'loading'}>
          {items.map((product) => {
            const otherCurrency = product.currency !== null && product.currency !== currency;
            return (
              <li
                key={product.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-row-divider py-2.5"
              >
                <span className="min-w-[84px] text-xs font-semibold text-muted-foreground">
                  {product.code}
                </span>
                <span className="min-w-0 flex-[1_1_200px] text-sm">{product.name}</span>
                <span className="text-[13px] text-muted-foreground">{t.stock}</span>
                <span className="text-[13px] text-muted-foreground">
                  {product.referencePrice === null ? (
                    t.noPrice
                  ) : (
                    <MoneyText
                      amount={product.referencePrice}
                      currency={product.currency ?? currency}
                      maxFractionDigits={4}
                    />
                  )}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="border-primary px-3.5 font-semibold text-primary"
                  disabled={otherCurrency}
                  aria-label={
                    otherCurrency
                      ? pick
                        ? t.cannotPick(product.code)
                        : t.cannotAdd(product.code)
                      : pick
                        ? t.pickItem(product.code, product.name)
                        : t.addItem(product.code, product.name)
                  }
                  onClick={() => onAdd(product)}
                >
                  {otherCurrency ? t.otherCurrency : pick ? t.pick : t.add}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
