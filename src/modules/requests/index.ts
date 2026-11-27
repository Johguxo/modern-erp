// API pública del módulo requests: SOF (luego PR/PD).
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export {
  createGetRequestDeps,
  createGetRequestDetailDeps,
  createListRequestsDeps,
  createPlatformSequenceDeps,
  createRequestsDeps,
  createSequenceDeps,
  type RequestsExtras,
} from './infrastructure/deps';
export {
  documentSequenceSetupStep,
  type DocumentSequenceConfig,
} from './infrastructure/document-sequence-step';
export { noopApprovalAssignments } from './infrastructure/noop-approval-assignments';
export { noopApprovalCanceller } from './infrastructure/noop-approval-canceller';
export { noopApprovalTimeline } from './infrastructure/noop-approval-timeline';
export { noopApprovalStarter } from './infrastructure/noop-approval-starter';
export type {
  ApprovalAssignments,
  ApprovalCanceller,
  ApprovalCorrector,
  ApprovalDecider,
  ApprovalTimeline,
  DecideDeps,
  ApprovalStarter,
  CancelDeps,
  CorrectDeps,
  LineCorrectionRecord,
  GetRequestDeps,
  GetRequestDetailDeps,
  ListRequestsDeps,
  RequestLabels,
  PlatformSequenceDeps,
  RequestsDeps,
  SequenceDeps,
} from './application/ports';
export type {
  RequestDetail,
  RequestDetailLine,
  RequestLineView,
  RequestView,
  SequenceView,
  TimelineItemView,
} from './application/views';
export { createDraft, type CreateDraftInput } from './application/create-draft';
export { updateDraft, type UpdateDraftInput } from './application/update-draft';
export { submitRequest, type SubmitRequestInput } from './application/submit-request';
export { cancelRequest, type CancelRequestInput } from './application/cancel-request';
export {
  decideRequest,
  type DecideRequestInput,
  type DecideRequestOutput,
} from './application/decide-request';
export {
  correctLine,
  type CorrectLineInput,
  type CorrectLineOutput,
} from './application/correct-line';
export type { LineChangeInput } from './application/resolve-line-change';
export { getRequest } from './application/get-request';
export { getRequestDetail } from './application/get-request-detail';
export {
  listRequests,
  type InboxItem,
  type ListRequestsInput,
  type ListRequestsOutput,
} from './application/list-requests';
export { getEditableDraft } from './application/get-editable-draft';
export { getDocumentSequence } from './application/get-document-sequence';
export { updateDocumentSequence } from './application/update-document-sequence';
export { platformGetDocumentSequence } from './application/platform-get-document-sequence';
export { platformUpdateDocumentSequence } from './application/platform-update-document-sequence';
export { REAPPROVAL_BRANCHES, reapprovalBranch, type ReapprovalBranch } from './domain/reapproval';
export { INBOX_TABS, type DisplayStatus, type InboxTab } from './domain/inbox';
export { REQUEST_ACTIONS, availableActions, type RequestAction } from './domain/request-actions';
export {
  TIMELINE_KINDS,
  TIMELINE_STATES,
  buildTimeline,
  deriveTimeline,
  type ApprovalTimelineEntry,
  type TimelineKind,
  type TimelineState,
} from './domain/request-timeline';
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
