/**
 * downloadCsv.ts — the only DOM-touching part of export.
 *
 * Kept apart from `analysis/csvExport.ts` so the string building stays pure,
 * testable and worker-safe. This file is the thin browser shim.
 */

/** Trigger a download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
    // A BOM so Excel opens UTF-8 correctly — without it the degree signs and
    // en-dashes in the provenance header render as mojibake, which makes the
    // assumptions block look broken exactly where it needs to be trusted.
    const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoking immediately can cancel the download in some browsers; one turn of
    // the event loop is enough for the navigation to have started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
