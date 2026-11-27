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
  correctLine,
  createDraft,
  createRequestsDeps,
  decideRequest,
  submitRequest,
  updateDraft,
} from '@/modules/requests';
import {
  cancelRequestContract,
  correctLineContract,
  createDraftContract,
  decideRequestContract,
  submitRequestContract,
  updateDraftContract,
} from '@/modules/requests/contracts';
import { getLogger } from '@/shared/adapters/pino-logger';

import { action } from '../../_lib/action';
import { catalogExtras } from '../../_lib/catalog';
import { requestsExtras } from '../../_lib/requests';

export const createDraftAction = action(
  createDraftContract,
  'requests.create',
  ({ ctx, input, tx, shared }) =>
    createDraft(ctx, input, createRequestsDeps(tx, requestsExtras(shared, tx))),
  { name: 'requests.createDraft' },
);

export const updateDraftAction = action(
  updateDraftContract,
  'requests.create',
  ({ ctx, input, tx, shared }) =>
    updateDraft(ctx, input, createRequestsDeps(tx, requestsExtras(shared, tx))),
  { name: 'requests.updateDraft' },
);

export const submitRequestAction = action(
  submitRequestContract,
  'requests.create',
  ({ ctx, input, tx, shared }) =>
    submitRequest(ctx, input, createRequestsDeps(tx, requestsExtras(shared, tx))),
  { name: 'requests.submitRequest' },
);

// Anular: el caso de uso revisa `requests.create` o `requests.cancel_any` (la acción no exige uno
// solo) y que el usuario pueda ver y anular ese documento.
export const cancelRequestAction = action(
  cancelRequestContract,
  null,
  ({ ctx, input, tx, shared }) =>
    cancelRequest(ctx, input, createRequestsDeps(tx, requestsExtras(shared, tx))),
  { name: 'requests.cancelRequest' },
);

// Decidir (aprobar, pedir cambios o rechazar): el permiso `approvals.decide` lo revisan la acción y el
// caso de uso; además el caso de uso exige que el paso sea del usuario y no sea su propia solicitud.
export const decideRequestAction = action(
  decideRequestContract,
  'approvals.decide',
  ({ ctx, input, tx, shared }) =>
    decideRequest(ctx, input, createRequestsDeps(tx, requestsExtras(shared, tx))),
  { name: 'requests.decideRequest' },
);

// Corregir una línea sin reiniciar la aprobación (E4-H4): el permiso `requests.correct_line` lo revisan
// la acción y el caso de uso, que además revisa versión, estado y visibilidad. Escribe: no corre en
// solo lectura.
export const correctLineAction = action(
  correctLineContract,
  'requests.correct_line',
  ({ ctx, input, tx, shared }) =>
    correctLine(ctx, input, createRequestsDeps(tx, requestsExtras(shared, tx))),
  { name: 'requests.correctLine' },
);

// El buscador solo lee: sigue disponible en solo lectura (ADR-006). Lo usan quien crea SOF y quien
// corrige líneas (E4-H4): la acción solo exige sesión y el caso de uso revisa que tenga
// `catalog.manage`, `requests.create` o `requests.correct_line`.
export const searchCatalogAction = action(
  searchProductsContract,
  null,
  ({ ctx, input, tx, shared }) =>
    searchProducts(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.searchProducts', access: 'read' },
);

// La ruta se recalcula con el total en vivo; solo lee, así que también corre en solo lectura.
export const previewRouteAction = action(
  previewRouteContract,
  'requests.create',
  ({ ctx, input, tx }) => previewRoute(ctx, input, createPreviewRouteDeps(tx, getLogger())),
  { name: 'approvals.previewRoute', access: 'read' },
);
