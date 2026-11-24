'use client';

// Logo de la empresa (E1-H5): vista previa, subir (PNG/JPG/WebP hasta 512 KB) y quitar. El
// navegador revisa tamaño y tipo para avisar en es-PE antes de enviar (Next corta en 1 MB con un
// error genérico); el servidor vuelve a revisar el tipo por los bytes del archivo.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import type { CompanySettingsView } from '@/modules/identity';
import { MAX_LOGO_BYTES } from '@/modules/identity/contracts';
import { Button } from '@/ui/components/button';
import { Label } from '@/ui/components/label';
import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import { removeCompanyLogoAction, uploadCompanyLogoAction } from './actions';

const t = messages.company;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export function LogoField({
  settings,
  readOnly,
}: {
  settings: CompanySettingsView;
  readOnly: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();

  const upload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(messages.validation.required);
      return;
    }
    // Algunos sistemas no informan el tipo (''): en ese caso decide el servidor por los bytes.
    if (file.type !== '' && !ACCEPTED.includes(file.type)) {
      setError(messages.errors.reasons.logo_invalid_type());
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(messages.errors.reasons.logo_too_large());
      return;
    }
    const data = new FormData();
    data.set('logo', file);
    startTransition(async () => {
      const result = await uploadCompanyLogoAction(data);
      if (!result.ok) {
        setError(result.error.fieldErrors?.logo?.[0] ?? result.error.message);
        return;
      }
      if (inputRef.current) inputRef.current.value = '';
      setNotice(t.notices.logoUploaded);
      router.refresh();
    });
  };

  const remove = () =>
    startTransition(async () => {
      setError(undefined);
      setNotice(undefined);
      const result = await removeCompanyLogoAction({});
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setNotice(t.notices.logoRemoved);
      router.refresh();
    });

  return (
    <section
      aria-labelledby="company-logo-title"
      className="rounded-xl border border-border bg-surface p-4 md:p-6"
    >
      <h2 id="company-logo-title" className="mb-4 text-lg font-semibold">
        {t.logoTitle}
      </h2>
      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-border bg-background px-3 py-2 text-foreground"
        >
          {notice}
        </p>
      ) : null}
      <FormError className="mb-4" message={error} />

      <div className="mb-4 flex min-h-20 items-center justify-center rounded-md border border-dashed border-border-strong bg-ink p-4">
        {settings.logoUrl ? (
          // Logo de Storage (otro origen, sin next/image para no configurar remotePatterns).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.logoUrl}
            alt={t.logoCurrent}
            className="max-h-16 max-w-full object-contain"
          />
        ) : (
          <p className="text-center text-sm text-nav-muted">{t.logoNone}</p>
        )}
      </div>

      <form onSubmit={upload} className="flex flex-col gap-3" noValidate>
        <fieldset disabled={readOnly || pending} className="flex flex-col gap-3">
          <Label htmlFor={inputId}>{t.logoChoose}</Label>
          <input
            id={inputId}
            ref={inputRef}
            name="logo"
            type="file"
            accept={ACCEPTED.join(',')}
            aria-describedby={`${inputId}-hint`}
            className="block w-full min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:font-medium"
          />
          <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
            {t.logoHint}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">{t.logoUpload}</Button>
            {settings.logoUrl ? (
              <Button type="button" variant="outline" onClick={remove}>
                {t.logoRemove}
              </Button>
            ) : null}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
