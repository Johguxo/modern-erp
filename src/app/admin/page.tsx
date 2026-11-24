import { redirect } from 'next/navigation';

// La consola empieza en la lista de clientes (E1-H4).
export default function AdminPage() {
  redirect('/admin/clientes');
}
