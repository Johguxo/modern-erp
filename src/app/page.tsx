import { redirect } from 'next/navigation';

// La entrada de la app es la bandeja (mapa-pantallas.md). E1-H2 agrega el paso por /login.
export default function HomePage() {
  redirect('/bandeja');
}
