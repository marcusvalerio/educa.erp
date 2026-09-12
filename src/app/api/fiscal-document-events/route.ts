import { listFiscalDocumentEvents, registerFiscalDocumentEvent } from "@/lib/api/fiscal-handlers";

export const GET = listFiscalDocumentEvents;
export const POST = registerFiscalDocumentEvent;
