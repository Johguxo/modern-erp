import { messages } from '@/ui/messages/es-PE';

import { RecoverForm } from './recover-form';

export default function RecoverPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">{messages.auth.recoverTitle}</h1>
      <p className="mt-1 mb-4 text-muted-foreground">{messages.auth.recoverDescription}</p>
      <RecoverForm />
    </>
  );
}
