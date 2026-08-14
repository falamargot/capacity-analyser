import type { RevisitResultSheetModel } from '../analysis/resultSheet';
import { toPdfSafeText } from '../../../utils/pdfSafeText';

function safeFilename(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'target';
}

export async function downloadRevisitResultSheet(model: RevisitResultSheetModel): Promise<void> {
    const { default: JsPDF } = await import('jspdf');
    const pdf = new JsPDF('p', 'mm', 'a4');
    const margin = 16;
    const width = 210 - margin * 2;
    let y = 18;

    pdf.setFillColor(8, 15, 28);
    pdf.rect(0, 0, 210, 297, 'F');
    pdf.setTextColor(245, 158, 11);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(toPdfSafeText(model.title), margin, y);
    y += 8;
    pdf.setTextColor(203, 213, 225);
    pdf.setFontSize(9);
    pdf.text(toPdfSafeText(`${model.target} · requirement ${model.requirement}`), margin, y);
    y += 9;

    const verdictMeets = model.verdict.startsWith('MEETS') || model.verdict.includes(' MEETS ');
    const verdictWidth = model.verdict.startsWith('AREA') ? 55 : 42;
    pdf.setFillColor(...(verdictMeets ? [22, 101, 52] : [127, 29, 29]) as [number, number, number]);
    pdf.roundedRect(margin, y, verdictWidth, 8, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.text(toPdfSafeText(model.verdict), margin + 3, y + 5.3);
    y += 16;

    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(8);
    for (let index = 0; index < model.metrics.length; index += 1) {
        const metric = model.metrics[index];
        const x = margin + index * (width / model.metrics.length);
        pdf.text(toPdfSafeText(metric.label.toUpperCase()), x, y);
        pdf.setTextColor(index === 0 ? 252 : 226, index === 0 ? 211 : 232, index === 0 ? 77 : 240);
        pdf.setFontSize(index === 0 ? 15 : 11);
        pdf.text(toPdfSafeText(metric.value), x, y + 7);
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(8);
    }
    y += 22;

    const section = (title: string) => {
        pdf.setDrawColor(51, 65, 85);
        pdf.line(margin, y, margin + width, y);
        y += 6;
        pdf.setTextColor(245, 158, 11);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(title.toUpperCase(), margin, y);
        y += 6;
    };

    section('Scenario assumptions');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(203, 213, 225);
    for (const row of model.assumptions) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(toPdfSafeText(`${row.label}:`), margin, y);
        pdf.setFont('helvetica', 'normal');
        pdf.text(toPdfSafeText(row.value), margin + 40, y);
        y += 6;
    }

    if (model.comparisons.length > 0) {
        y += 2;
        section('Three-target comparison');
        pdf.setTextColor(148, 163, 184);
        pdf.text('Target', margin, y);
        pdf.text('Worst case', margin + 62, y);
        pdf.text('Mean', margin + 105, y);
        pdf.text('Target verdict', margin + 140, y);
        y += 5;
        for (const row of model.comparisons) {
            pdf.setTextColor(226, 232, 240);
            pdf.text(toPdfSafeText(row.target), margin, y);
            pdf.text(toPdfSafeText(row.worstCase), margin + 62, y);
            pdf.text(toPdfSafeText(row.mean), margin + 105, y);
            pdf.text(toPdfSafeText(row.verdict), margin + 140, y);
            y += 6;
        }
    }

    y += 3;
    section('Qualification and caveats');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(7.5);
    for (const caveat of model.caveats) {
        const lines = pdf.splitTextToSize(toPdfSafeText(`• ${caveat}`), width);
        pdf.text(lines, margin, y);
        y += lines.length * 4 + 1;
    }

    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(7);
    pdf.text(toPdfSafeText(`Generated ${model.generatedAtIso} · Capacity Analyzer REVISIT`), margin, 288);
    pdf.save(`revisit-result-${safeFilename(model.target)}.pdf`);
}
