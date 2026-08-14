import React, { useRef, useState } from 'react';
import type { RevisitSessionSnapshotV1 } from '../state/revisitSessionSnapshot';
import {
    deleteSavedRevisitScenario, importSavedRevisitScenario, listSavedRevisitScenarios,
    saveRevisitScenario, serializeSavedRevisitScenario, type SavedRevisitScenario,
} from '../state/revisitSavedScenarios';
import { downloadText } from './downloadCsv';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface ScenarioWorkspaceProps {
    snapshot: RevisitSessionSnapshotV1;
    onLoad: (saved: SavedRevisitScenario) => void;
    onExportResult: () => void;
    canExportResult: boolean;
    analysisContext: 'POINTS' | 'AREA';
}

export const ScenarioWorkspace: React.FC<ScenarioWorkspaceProps> = ({
    snapshot, onLoad, onExportResult, canExportResult, analysisContext,
}) => {
    const [items, setItems] = useState(() => listSavedRevisitScenarios());
    const [name, setName] = useState('');
    const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
    const [message, setMessage] = useState<string | null>(null);
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
            <div className="flex items-center justify-between gap-2">
                <div>
                    <span className={REVISIT_LABEL}>Current scenario</span>
                    <p className="mt-1 text-[10px] font-bold text-slate-200">
                        {analysisContext === 'AREA' ? 'Area results' : 'Point results'}
                    </p>
                    <p className="mt-0.5 text-[9px] leading-3 text-slate-500">
                        Saves targets, area, active context, constellation, payload, requirement and display options.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onExportResult}
                    disabled={!canExportResult}
                    className="min-h-9 rounded border border-amber-400/40 px-2 text-[9px] font-black uppercase tracking-wide text-amber-200 disabled:opacity-40"
                >
                    {analysisContext === 'AREA' ? 'Area PDF' : 'Point PDF'}
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
                    className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950/70 px-2 text-[10px] text-slate-200 outline-none focus:border-sky-400/60"
                />
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim()}
                    className="min-h-9 rounded bg-sky-500/15 px-2 text-[9px] font-black uppercase tracking-wide text-sky-200 disabled:opacity-40"
                >Save</button>
            </div>

            <div className="mt-4 border-t border-slate-700/60 pt-3">
                <span className={REVISIT_LABEL}>Saved scenarios</span>
                <p className="mt-0.5 text-[9px] text-slate-500">Up to 12 browser-local scenarios · JSON sharing</p>
            </div>

            <div className="mt-1.5 flex gap-1.5">
                <select
                    aria-label="Saved scenarios"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950/70 px-1.5 text-[10px] text-slate-300"
                >
                    {items.length === 0 && <option value="">No saved scenario</option>}
                    {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <button type="button" disabled={!selected} onClick={() => selected && onLoad(selected)} className="min-h-9 rounded px-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-30">Load</button>
                <button
                    type="button"
                    disabled={!selected}
                    onClick={() => selected && downloadText(
                        `revisit-${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
                        serializeSavedRevisitScenario(selected), 'application/json',
                    )}
                    className="min-h-9 rounded px-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-30"
                >Share</button>
                <button
                    type="button"
                    disabled={!selected}
                    onClick={() => {
                        if (!selected) return;
                        deleteSavedRevisitScenario(selected.id);
                        refresh();
                        setMessage(`Deleted “${selected.name}”`);
                    }}
                    className="min-h-9 rounded px-2 text-[9px] font-black uppercase text-red-300 disabled:opacity-30"
                >Delete</button>
            </div>

            <input
                ref={fileRef}
                className="sr-only"
                type="file"
                accept="application/json,.json"
                aria-label="Import REVISIT scenario file"
                onChange={(event) => void handleImport(event.target.files?.[0])}
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-1.5 text-[9px] font-bold text-sky-300 hover:text-sky-200">
                Import shared scenario…
            </button>
            {message && <p role="status" className="mt-1 text-[9px] text-slate-400">{message}</p>}
        </section>
    );
};
