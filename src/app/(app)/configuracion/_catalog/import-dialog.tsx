'use client';

// «Importar desde Excel» (E2-H3): plantilla y archivo → vista previa con errores → confirmar. El
// navegador solo avisa del tamaño; el servidor valida el tipo y el contenido, y al confirmar
// vuelve a leer el archivo (no usa las filas de la vista previa).
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import type { ImportKind, RowError } from '@/modules/catalog/contracts';
import { SPREADSHEET_LIMITS } from '@/shared/ports/spreadsheet';
import { Button, buttonVariants } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/dialog';
import { Label } from '@/ui/components/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/components/table';
import { FormError } from '@/ui/forms/form-error';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

import { confirmImportAction, previewImportAction } from './import-actions';
import { errorSentence } from './import-row-errors';

const t = messages.catalog.importer;

const TEMPLATE_HREF = {
  products: '/configuracion/productos/plantilla',
  equipment: '/configuracion/equipos/plantilla',
} as const;

/** Columnas de la vista previa (clave de la fila importada), en el orden de la plantilla. */
const COLUMNS: Record<
  ImportKind,
  readonly ('code' | 'name' | 'unit' | 'category' | 'price' | 'currency' | 'type')[]
> = {
  products: ['code', 'name', 'unit', 'category', 'price', 'currency'],
  equipment: ['code', 'name', 'type'],
};

/** Errores que se listan debajo de la tabla; el resto se resume en «y N más». */
const LISTED_ERRORS = 50;

interface Preview {
  total: number;
  valid: number;
  failed: number;
  rows: { row: number; values: Record<string, string | null> }[];
  errors: RowError[];
}

export function ImportDialog({ kind, readOnly }: { kind: ImportKind; readOnly: boolean }) {
  const router = useRouter();
  const fileId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(undefined);
    if (inputRef.current) inputRef.current.value = '';
  };

  const formData = (selected: File) => {
    const data = new FormData();
    data.set('kind', kind);
    data.set('file', selected);
    return data;
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPreview(null);
    setError(undefined);
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > SPREADSHEET_LIMITS.maxFileBytes) {
      setFile(null);
      setError(messages.errors.reasons.file_too_large());
      return;
    }
    setFile(selected);
  };

  const review = () => {
    if (!file) {
      setError(t.chooseFile);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await previewImportAction(formData(file));
      if (!result.ok) {
        setPreview(null);
        setError(result.error.message);
        return;
      }
      setPreview(result.data);
    });
  };

  const confirm = () => {
    if (!file) return;
    setError(undefined);
    startTransition(async () => {
      const result = await confirmImportAction(formData(file));
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (!result.data.queued) {
        setError(t.queueFailed);
        return;
      }
      router.push(`/configuracion/importaciones/${result.data.jobId}`);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={readOnly}>
          {messages.catalog.import}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.title[kind]}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <FormError message={error} />

        <div className="flex flex-col gap-3">
          <div>
            <a
              href={TEMPLATE_HREF[kind]}
              download
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              {t.downloadTemplate}
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fileId}>{t.fileLabel}</Label>
            <input
              id={fileId}
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              disabled={pending}
              onChange={onFileChange}
              aria-describedby={`${fileId}-hint`}
              className="block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:font-medium"
            />
            <p id={`${fileId}-hint`} className="text-sm text-muted-foreground">
              {t.fileHint} {t.existingHint}
            </p>
          </div>
        </div>

        <div aria-live="polite">
          {preview ? <PreviewSection kind={kind} preview={preview} /> : null}
        </div>

        <DialogFooter className="gap-2">
          {preview ? (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={reset}>
                {t.chooseAnother}
              </Button>
              <Button type="button" disabled={pending || preview.valid === 0} onClick={confirm}>
                {pending ? t.confirming : t.confirm}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {t.cancel}
              </Button>
              <Button type="button" disabled={pending || !file} onClick={review}>
                {pending ? t.reviewing : t.review}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewSection({ kind, preview }: { kind: ImportKind; preview: Preview }) {
  const columns = COLUMNS[kind];
  const errorId = (row: number, field: string) => `import-error-${row}-${field}`;
  // Por fila y columna: el primer error de esa celda.
  const byCell = new Map<string, RowError>();
  for (const error of preview.errors) {
    const key = `${error.row}:${error.field ?? ''}`;
    if (!byCell.has(key)) byCell.set(key, error);
  }
  const listed = preview.errors.slice(0, LISTED_ERRORS);

  return (
    <section aria-labelledby="import-preview-title" className="flex flex-col gap-3">
      <h3 id="import-preview-title" className="text-base font-semibold">
        {t.previewTitle}
      </h3>
      <p>{t.previewTotals(preview.total, preview.valid, preview.failed)}</p>
      {preview.valid === 0 ? <FormError message={t.noValidRows} /> : null}
      <Table aria-label={t.previewTableLabel}>
        <TableHeader>
          <TableRow>
            <TableHead>{t.rowColumn}</TableHead>
            {columns.map((column) => (
              <TableHead key={column}>{t.fields[column]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.rows.map((row) => (
            <TableRow key={row.row}>
              <TableCell className="text-muted-foreground">{row.row}</TableCell>
              {columns.map((column) => {
                const cellError = byCell.get(`${row.row}:${column}`);
                return (
                  <TableCell
                    key={column}
                    aria-invalid={cellError ? true : undefined}
                    aria-describedby={cellError ? errorId(row.row, column) : undefined}
                    className={cn(cellError && 'bg-warning-bg text-warning-text')}
                  >
                    {row.values[column] ?? messages.catalog.noValue}
                    {cellError ? (
                      <span id={errorId(row.row, column)} className="block text-xs">
                        {errorSentence(cellError)}
                      </span>
                    ) : null}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        {t.previewShowing(preview.rows.length, preview.total)}
      </p>

      {listed.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="font-medium">{t.errorsTitle}</h4>
          <p className="text-sm text-muted-foreground">{t.errorsHint}</p>
          <ul className="list-disc pl-5 text-sm">
            {listed.map((error, index) => (
              <li key={`${error.row}-${error.field ?? ''}-${index}`}>
                {t.rowColumn} {error.row}
                {error.code ? ` (${error.code})` : ''}: {errorSentence(error)}
              </li>
            ))}
          </ul>
          {preview.errors.length > listed.length ? (
            <p className="text-sm text-muted-foreground">
              {t.errorsMore(preview.errors.length - listed.length)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
