/**
 * Plain-language guidance for the BE error codes listed in the backend
 * handoff (section 3.2). Shown beside the server's own message, never instead
 * of it; feature-specific help may add more.
 */
export const handoffErrorHelp: Record<string, string> = {
  QUARANTINE_RELEASE_REQUIRED:
    'The horse has not been released from quarantine yet. Ask the legal Specialist to clear the quarantine release phase before the final handover.',
  HANDOVER_TIME_BEFORE_DEPARTURE:
    "The handover time cannot be earlier than the leg's actual departure.",
  ORDER_NOT_DELIVERED: 'A request can be closed only after the horse has been delivered.',
  ORDER_VERSION_CONFLICT: 'This request was just updated by someone else. Reload it and try again.',
  CLOSURE_RETRY_CONFLICT: 'This closing action no longer matches the request. Refresh the page.',
  QUOTE_PRICING_PENDING:
    'Some prices are still pending. Check which input is missing: quarantine assessment (Specialist), itinerary and airfare (Coordinator) or tariffs (Manager).',
  TRANSIT_COUNTRIES_PENDING:
    "The route has transit airports without transit countries. Check the stops on the Coordinator's journey.",
  COMPLIANCE_SCHEMA_PENDING:
    'The database is missing migration 020. Ask the administrator to run it on the demo database.',
  INVALID_BASE64: 'The file could not be read. Choose a PDF, PNG or JPEG of at most 5 MB.',
  FILE_TOO_LARGE: 'The file is larger than 5 MB. Choose a PDF, PNG or JPEG of at most 5 MB.',
};
export const errorHelpFor = (code: string | undefined) =>
  code ? handoffErrorHelp[code] : undefined;
