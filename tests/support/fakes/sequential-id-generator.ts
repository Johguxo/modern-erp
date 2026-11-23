// Ids deterministas con formato UUID v4 válido: 00000000-0000-4000-8000-000000000001, ...
import type { IdGenerator } from '@/shared/ports/id-generator';

export function sequentialUuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export class SequentialIdGenerator implements IdGenerator {
  private next: number;

  constructor(start = 1) {
    this.next = start;
  }

  newId(): string {
    const id = sequentialUuid(this.next);
    this.next += 1;
    return id;
  }
}
