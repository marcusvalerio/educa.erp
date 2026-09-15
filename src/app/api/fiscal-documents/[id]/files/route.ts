import { listFiscalDocumentFiles, registerFiscalDocumentFile } from "@/lib/api/fiscal-operations-handlers";

export const GET = listFiscalDocumentFiles;
export const POST = registerFiscalDocumentFile;
