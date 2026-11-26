'use server';

// Acciones de solicitudes (E3-H2): validan con los contratos de requests y catalog y llaman al caso
// de uso. Crear, editar y enviar son de escritura (no pasan en solo lectura); el buscador del
// catálogo es de lectura.
import { createPreviewRouteDeps, previewRoute } from '@/modules/approvals';
import { previewRouteContract } from '@/modules/approvals/contracts';
import { createCatalogDeps, searchProducts } from '@/modules/catalog';
import { searchProductsContract } from '@/modules/catalog/contracts';
import {
  cancelRequest,
  createDraft,
  createRequestsDeps,
  submitRequest,
  updateDraft,
} from '@/modules/requests';
import {
  cancelRequestContract,
  createDraftContract,
  submitRequestContract,
  updateDraftContract,
} from '@/modules/requests/contracts';

import { action } from '../../_lib/action';
import { catalogExtras } from '../../_lib/catalog';
import { requestsExtras } from '../../_lib/requests';

export const createDraftAction = action(
  createDraftContract,
  'requests.create',
  ({ ctx, input, tx, shared }) =>
    createDraft(ctx, input, createRequestsDeps(tx, requestsExtras(shared))),
  { name: 'requests.createDraft' },
);

export const updateDraftAction = action(
  updateDraftContract,
  'requests.create',
  ({ ctx, input, tx, shared }) =>
    updateDraft(ctx, input, createRequestsDeps(tx, requestsExtras(shared))),
  { name: 'requests.updateDraft' },
);

export const submitRequestAction = action(
  submitRequestContract,
  'requests.create',
  ({ ctx, input, tx, shared }) =>
    submitRequest(ctx, input, createRequestsDeps(tx, requestsExtras(shared))),
  { name: 'requests.submitRequest' },
);

// Anular: el caso de uso revisa `requests.create` o `requests.cancel_any` (la acción no exige uno
// solo) y que el usuario pueda ver y anular ese documento.
export const cancelRequestAction = action(
  cancelRequestContract,
  null,
  ({ ctx, input, tx, shared }) =>
    cancelRequest(ctx, input, createRequestsDeps(tx, requestsExtras(shared))),
  { name: 'requests.cancelRequest' },
);

// El buscador solo lee: sigue disponible en solo lectura (ADR-006).
export const searchCatalogAction = action(
  searchProductsContract,
  'requests.create',
  ({ ctx, input, tx, shared }) =>
    searchProducts(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.searchProducts', access: 'read' },
);

// La ruta se recalcula con el total en vivo; solo lee, así que también corre en solo lectura.
export const previewRouteAction = action(
  previewRouteContract,
  'requests.create',
  ({ ctx, input, tx }) => previewRoute(ctx, input, createPreviewRouteDeps(tx)),
  { name: 'approvals.previewRoute', access: 'read' },
);
