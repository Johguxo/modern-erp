'use client';

// "Datos generales" del SOF: solicitante (solo lectura), equipo, centro de costo y motivo.
import { useId, type Dispatch } from 'react';

import { REASON_MAX } from '@/modules/requests/contracts';
import { Input } from '@/ui/components/input';
import { NativeSelect } from '@/ui/components/native-select';
import { messages } from '@/ui/messages/es-PE';

import type { EditorAction, EditorState } from './editor-state';
import { Field } from './field';
import type { SelectOption } from './load-editor-data';

const t = messages.requests.general;

/** Un id que ya no está entre los activos (borrador viejo) sigue visible, marcado como no disponible. */
export function withCurrent(options: readonly SelectOption[], current: string): SelectOption[] {
  if (current === '' || options.some((option) => option.id === current)) return [...options];
  return [...options, { id: current, label: t.unavailable }];
}

export function HeaderFields({
  state,
  requesterEmail,
  costCenters,
  equipment,
  dispatch,
}: {
  state: EditorState;
  requesterEmail: string;
  costCenters: readonly SelectOption[];
  equipment: readonly SelectOption[];
  dispatch: Dispatch<EditorAction>;
}) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const { fields } = state.errors;
  const describedBy = (field: string) => (fields[field] ? id(`${field}-error`) : undefined);

  return (
    <section
      aria-label={t.title}
      className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2"
    >
      <Field label={t.requester} htmlFor={id('requester')} errorId={id('requester-error')}>
        <Input id={id('requester')} type="text" value={requesterEmail} readOnly />
      </Field>

      <Field
        label={t.equipment}
        htmlFor={id('equipment')}
        error={fields.equipmentId}
        errorId={id('equipmentId-error')}
      >
        <NativeSelect
          id={id('equipment')}
          value={state.equipmentId}
          aria-invalid={fields.equipmentId ? true : undefined}
          aria-describedby={describedBy('equipmentId')}
          onChange={(event) =>
            dispatch({ type: 'setHeader', field: 'equipmentId', value: event.target.value })
          }
        >
          <option value="">{t.noEquipment}</option>
          {withCurrent(equipment, state.equipmentId).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field
        label={t.costCenter}
        htmlFor={id('costCenter')}
        error={fields.costCenterId}
        errorId={id('costCenterId-error')}
        required
      >
        <NativeSelect
          id={id('costCenter')}
          value={state.costCenterId}
          required
          aria-invalid={fields.costCenterId ? true : undefined}
          aria-describedby={describedBy('costCenterId')}
          onChange={(event) =>
            dispatch({ type: 'setHeader', field: 'costCenterId', value: event.target.value })
          }
        >
          <option value="">{t.costCenterPlaceholder}</option>
          {withCurrent(costCenters, state.costCenterId).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field
        label={t.reason}
        htmlFor={id('reason')}
        error={fields.reason}
        errorId={id('reason-error')}
        required
      >
        <Input
          id={id('reason')}
          type="text"
          value={state.reason}
          maxLength={REASON_MAX}
          autoComplete="off"
          placeholder={t.reasonPlaceholder}
          required
          aria-invalid={fields.reason ? true : undefined}
          aria-describedby={describedBy('reason')}
          onChange={(event) =>
            dispatch({ type: 'setHeader', field: 'reason', value: event.target.value })
          }
        />
      </Field>
    </section>
  );
}
