// Descarga de la plantilla de productos (E2-H3): 401 sin sesión, 404 sin catalog.manage.
import { productionTemplateRoute } from '../../../../_lib/import-template-production';

export const GET = productionTemplateRoute('products');
