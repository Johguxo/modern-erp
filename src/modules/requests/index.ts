// API pública del módulo requests: SOF (luego PR/PD).
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export {
  createGetRequestDeps,
  createPlatformSequenceDeps,
  createRequestsDeps,
  createSequenceDeps,
  type RequestsExtras,
} from './infrastructure/deps';
export {
  documentSequenceSetupStep,
  type DocumentSequenceConfig,
} from './infrastructure/document-sequence-step';
export { noopApprovalStarter } from './infrastructure/noop-approval-starter';
export type {
  ApprovalStarter,
  GetRequestDeps,
  PlatformSequenceDeps,
  RequestsDeps,
  SequenceDeps,
} from './application/ports';
export type { RequestLineView, RequestView, SequenceView } from './application/views';
export { createDraft, type CreateDraftInput } from './application/create-draft';
export { updateDraft, type UpdateDraftInput } from './application/update-draft';
export { submitRequest, type SubmitRequestInput } from './application/submit-request';
export { getRequest } from './application/get-request';
export { getEditableDraft } from './application/get-editable-draft';
export { getDocumentSequence } from './application/get-document-sequence';
export { updateDocumentSequence } from './application/update-document-sequence';
export { platformGetDocumentSequence } from './application/platform-get-document-sequence';
export { platformUpdateDocumentSequence } from './application/platform-update-document-sequence';
export {
  REQUEST_EVENTS,
  REQUEST_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  isTerminal,
  nextStatus,
  type RequestEvent,
  type RequestStatus,
} from './domain/request-state-machine';
export {
  DEFAULT_SOF_SEQUENCE,
  PREFIX_PATTERN,
  formatDocumentNumber,
  normalizePrefix,
} from './domain/numbering';
