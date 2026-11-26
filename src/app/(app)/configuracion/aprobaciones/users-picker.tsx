'use client';

// Selector de personas de un paso (E4-H1): chips de lo elegido (los desactivados con su marca) y una
// lista con búsqueda de los miembros activos. Es un campo controlado para React Hook Form.
import { XIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { Checkbox } from '@/ui/components/checkbox';
import { Input } from '@/ui/components/input';
import { Label } from '@/ui/components/label';
import { messages } from '@/ui/messages/es-PE';

const t = messages.approvals;

export interface PickerMember {
  readonly userId: string;
  readonly name: string;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function UsersPicker({
  members,
  names,
  value,
  onChange,
  disabled,
  invalid,
}: {
  /** Miembros activos que se pueden elegir. */
  members: readonly PickerMember[];
  /** Nombre de cada usuario conocido (activo o no). */
  names: ReadonlyMap<string, string>;
  value: readonly string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const baseId = useId();
  const [query, setQuery] = useState('');
  const activeIds = new Set(members.map((member) => member.userId));
  const needle = normalize(query.trim());
  const visible = members.filter((member) => normalize(member.name).includes(needle));

  const toggle = (userId: string, checked: boolean) =>
    onChange(checked ? [...value, userId] : value.filter((id) => id !== userId));

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t.usersNone}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {value.map((userId) => {
            const name = names.get(userId) ?? '';
            const inactive = !activeIds.has(userId);
            return (
              <li
                key={userId}
                className={
                  inactive
                    ? 'flex items-center gap-1 rounded-full border border-warning-border bg-warning-bg py-1 pr-1 pl-3 text-[13px] text-warning-text'
                    : 'flex items-center gap-1 rounded-full border border-border bg-background py-1 pr-1 pl-3 text-[13px]'
                }
              >
                <span>{inactive ? `${name} (${t.inactiveTag})` : name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t.removeUser(name)}
                  onClick={() => toggle(userId, false)}
                  className="flex size-7 items-center justify-center rounded-full hover:bg-accent disabled:opacity-50"
                >
                  <XIcon aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.usersSearch}
        aria-label={t.usersSearch}
        aria-invalid={invalid || undefined}
        disabled={disabled}
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {visible.length === 0 ? (
          <p className="px-3 py-2 text-[13px] text-muted-foreground">{t.usersEmpty}</p>
        ) : (
          visible.map((member) => {
            const id = `${baseId}-${member.userId}`;
            return (
              <div key={member.userId} className="flex min-h-11 items-center gap-3 px-3">
                <Checkbox
                  id={id}
                  checked={value.includes(member.userId)}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggle(member.userId, checked === true)}
                />
                <Label htmlFor={id} className="flex-1 py-2 font-normal">
                  {member.name}
                </Label>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
