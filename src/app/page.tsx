import { messages } from '@/ui/messages/es-PE';

// Página temporal: E1 la reemplaza por la redirección a /bandeja o /login.
export default function HomePage() {
  return (
    <main>
      <h1>{messages.home.title}</h1>
      <p>{messages.home.description}</p>
    </main>
  );
}
