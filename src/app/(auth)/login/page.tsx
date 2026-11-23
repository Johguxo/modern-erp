import { messages } from '@/ui/messages/es-PE';

// Página de relleno para ver el layout; el login real llega en E1-H2.
export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">{messages.auth.signInTitle}</h1>
      <p className="mt-2 text-muted-foreground">{messages.auth.comingSoon}</p>
    </>
  );
}
