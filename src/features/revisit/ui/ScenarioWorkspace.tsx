import React, { useRef, useState } from 'react';
import type { RevisitSessionSnapshotV1 } from '../state/revisitSessionSnapshot';
import {
    deleteSavedRevisitScenario, importSavedRevisitScenario, listSavedRevisitScenarios,
    saveRevisitScenario, serializeSavedRevisitScenario, type SavedRevisitScenario,
} from '../state/revisitSavedScenarios';
import { downloadText } from './downloadCsv';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

/**
 * ScenarioWorkspace — the salesperson's own workspace (Programme 7E).
 *
 * Ordered around the opportunity rather than around the file format: who this
 * is for, what it is called, save, load, export. JSON share and import are real
 * and stay, but under `Technical sharing` — that is how an engineer moves a
 * scenario between machines, not a step in a customer conversation.
 *
 * `Duplicate` exists because the failure it prevents is specific and expensive:
 * loading the reference scenario, editing it live during a call, and
 * overwriting the one everyone else uses.
 */
interface ScenarioWorkspaceProps {
    snapshot: RevisitSessionSnapshotV1;
    onLoad: (saved: SavedRevisitScenario) => void;
    onExportResult: () => void;
    canExportResult: boolean;
    analysisContext: 'POINTS' | 'AREA';
    onExportAccessCsv: () => void;
    canExportAccessCsv: boolean;
    onExportSweepCsv: () => void;
    canExportSweepCsv: boolean;
    onExportAreaCsv: () => void;
    canExportAreaCsv: boolean;
    /** Customer or opportunity this scenario belongs to. */
    opportunity: string;
    onOpportunityChange: (value: string) => void;
    /**
     * Reset the whole scenario. It lives here rather than in the stage toolbar,
     * where it stood one pixel from the drawer opener in identical styling —
     * a destructive action indistinguishable from a navigation one, in front of
     * a customer. It is a scenario operation; this is where scenario operations
     * are.
     */
    onResetScenario: () => void;
}

export const ScenarioWorkspace: React.FC<ScenarioWorkspaceProps> = ({
    snapshot, onLoad, onExportResult, canExportResult, analysisContext,
    opportunity, onOpportunityChange, onResetScenario,
    onExportAccessCsv, canExportAccessCsv, onExportSweepCsv, canExportSweepCsv,
    onExportAreaCsv, canExportAreaCsv,
}) => {
    const [items, setItems] = useState(() => listSavedRevisitScenarios());
    const [name, setName] = useState('');
    const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
    const [message, setMessage] = useState<string | null>(null);
    /**
     * Two-step, because the stage toolbar used to make this a one-click slip.
     *
     * Deliberately NOT disarmed on blur: an armed control that silently
     * disarms when you glance away is both unpredictable for the user and
     * nondeterministic for a test — it made the reset spec flaky. It stays
     * armed until it is pressed again or the drawer closes.
     */
    const [confirmingReset, setConfirmingReset] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const selected = items.find((item) => item.id === selectedId) ?? null;

    const refresh = (preferredId?: string) => {
        const next = listSavedRevisitScenarios();
        setItems(next);
        setSelectedId(preferredId ?? next[0]?.id ?? '');
    };

    const handleSave = () => {
        try {
            const saved = saveRevisitScenario(name, snapshot);
            refresh(saved.id);
            setName('');
            setMessage(`Saved “${saved.name}” locally`);
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : String(cause));
        }
    };

    /**
     * Save a copy of the SELECTED scenario, not of the current session: the
     * point is to branch from a reference before touching it, so the reference
     * has to be preserved exactly as it was stored.
     */
    const handleDuplicate = () => {
        if (!selected) return;
        try {
            const copy = saveRevisitScenario(`${selected.name} (copy)`, selected.snapshot);
            refresh(copy.id);
            setMessage(`Duplicated as “${copy.name}” — edit this one`);
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : String(cause));
        }
    };

    const handleImport = async (file: File | undefined) => {
        if (!file) return;
        try {
            const saved = importSavedRevisitScenario(await file.text());
            refresh(saved.id);
            setMessage(`Imported “${saved.name}”`);
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : String(cause));
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <section className={`${REVISIT_PANEL} px-3 py-3`} aria-label="Saved scenario workspace">
            <label className="block">
                <span className={REVISIT_LABEL}>Customer / opportunity</span>
                <input
                    aria-label="Customer or opportunity"
                    value={opportunity}
                    maxLength={120}
                    onChange={(event) => onOpportunityChange(event.target.value)}
                    placeholder="Who is this scenario for?"
                    className="mt-1 min-h-11 w-full rounded border border-slate-700 bg-slate-950/70 px-2 text-[12px] text-slate-200 outline-none focus:border-amber-400/60 md:min-h-9"
                />
            </label>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-700/60 pt-3">
                <div>
                    <span className={REVISIT_LABEL}>Current scenario</span>
                    <p className="mt-1 text-[12px] font-bold text-slate-200">
                        {analysisContext === 'AREA' ? 'Area results' : 'Point results'}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-3 text-[#94a3b8]">
                        Saves the target set, selected result, constellation, payload, requirement and display options.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onExportResult}
                    disabled={!canExportResult}
                    className="min-h-11 md:min-h-9 rounded border border-amber-400/40 px-2 text-[11px] font-black uppercase tracking-wide text-amber-200 disabled:opacity-40"
                >
                    Export customer summary
                </button>
            </div>

            <div className="mt-2 flex gap-1.5">
                <input
                    aria-label="Scenario name"
                    value={name}
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleSave(); }}
                    placeholder="Name this scenario"
                    className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950/70 px-2 text-[12px] text-slate-200 outline-none focus:border-sky-400/60"
                />
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim()}
                    className="min-h-11 md:min-h-9 rounded bg-sky-500/15 px-2 text-[11px] font-black uppercase tracking-wide text-sky-200 disabled:opacity-40"
                >Save</button>
            </div>

            <div className="mt-4 border-t border-slate-700/60 pt-3">
                <span className={REVISIT_LABEL}>Saved scenarios</span>
                <p className="mt-0.5 text-[11px] text-slate-500">Up to 12 browser-local scenarios · JSON sharing</p>
            </div>

            <div className="mt-1.5 flex gap-1.5">
                <select
                    aria-label="Saved scenarios"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950/70 px-1.5 text-[12px] text-slate-300"
                >
                    {items.length === 0 && <option value="">No saved scenario</option>}
                    {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <button type="button" disabled={!selected} onClick={() => selected && onLoad(selected)} className="min-h-11 md:min-h-9 rounded px-2 text-[11px] font-black uppercase text-slate-300 disabled:opacity-30">Load</button>
                <button
                    type="button"
                    disabled={!selected}
                    onClick={handleDuplicate}
                    title="Branch from this scenario before editing, so the original survives the call."
                    className="min-h-11 md:min-h-9 rounded px-2 text-[11px] font-black uppercase text-slate-300 disabled:opacity-30"
                >Duplicate</button>
                <button
                    type="button"
                    disabled={!selected}
                    onClick={() => {
                        if (!selected) return;
                        deleteSavedRevisitScenario(selected.id);
                        refresh();
                        setMessage(`Deleted “${selected.name}”`);
                    }}
                    className="min-h-11 md:min-h-9 rounded px-2 text-[11px] font-black uppercase text-red-300 disabled:opacity-30"
                >Delete</button>
            </div>

            <details className="mt-3 border-t border-slate-700/60 pt-2">
                <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 hover:text-sky-200 md:min-h-0">
                    Technical exports
                </summary>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Raw analysis data for engineering review and downstream processing.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                    {analysisContext === 'AREA' ? (
                        <button type="button" onClick={onExportAreaCsv} disabled={!canExportAreaCsv}
                            className="min-h-11 rounded border border-slate-700 px-2 text-[11px] font-black uppercase text-slate-300 disabled:opacity-30 md:min-h-9">
                            Area grid CSV
                        </button>
                    ) : <>
                        <button type="button" onClick={onExportAccessCsv} disabled={!canExportAccessCsv}
                            className="min-h-11 rounded border border-slate-700 px-2 text-[11px] font-black uppercase text-slate-300 disabled:opacity-30 md:min-h-9">
                            Accesses CSV
                        </button>
                        <button type="button" onClick={onExportSweepCsv} disabled={!canExportSweepCsv}
                            className="min-h-11 rounded border border-slate-700 px-2 text-[11px] font-black uppercase text-slate-300 disabled:opacity-30 md:min-h-9">
                            Sweep CSV
                        </button>
                    </>}
                </div>
            </details>

            {/* Destructive, so last, quiet, and confirmed. */}
            <div className="mt-3 border-t border-slate-700/60 pt-2">
                <button
                    type="button"
                    onClick={() => {
                        if (confirmingReset) {
                            setConfirmingReset(false);
                            onResetScenario();
                            return;
                        }
                        setConfirmingReset(true);
                    }}
                    className={`revisit-reset-scenario min-h-11 rounded px-2 text-[11px] font-black uppercase tracking-wide transition-colors md:min-h-9 ${confirmingReset
                        ? 'border border-rose-400/60 text-rose-200'
                        : 'text-slate-400 hover:text-rose-300'}`}
                >
                    {confirmingReset ? 'Confirm reset — everything is discarded' : 'Reset scenario'}
                </button>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    Returns targets, constellation, payload and requirement to the
                    opening state. Saved scenarios are untouched.
                </p>
            </div>

            {/* Real, and not part of a customer conversation. */}
            <details className="revisit-technical-sharing mt-3 border-t border-slate-700/60 pt-2">
                <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 hover:text-sky-200 md:min-h-0">
                    Technical sharing
                </summary>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Versioned JSON, for moving a scenario between machines or
                    handing it to engineering.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!selected}
                        onClick={() => selected && downloadText(
                            `revisit-${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
                            serializeSavedRevisitScenario(selected), 'application/json',
                        )}
                        className="min-h-11 md:min-h-9 rounded border border-slate-700 px-2 text-[11px] font-black uppercase text-slate-300 disabled:opacity-30"
                    >Export JSON</button>
                    <input
                        ref={fileRef}
                        className="sr-only"
                        type="file"
                        accept="application/json,.json"
                        aria-label="Import REVISIT scenario file"
                        onChange={(event) => void handleImport(event.target.files?.[0])}
                    />
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="min-h-11 md:min-h-9 rounded border border-slate-700 px-2 text-[11px] font-black uppercase text-slate-300"
                    >Import JSON…</button>
                </div>
            </details>
            {message && <p role="status" className="mt-1 text-[11px] text-slate-400">{message}</p>}
        </section>
    );
};
