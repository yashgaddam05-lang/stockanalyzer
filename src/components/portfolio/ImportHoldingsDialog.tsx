import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { CheckCircle2, FileUp, Loader2, Plus } from 'lucide-react';
import { addStock, createPortfolio, importPositions } from '@/lib/api';
import { parseHoldings } from '@/lib/portfolio-import/parse';
import type { ParseResult } from '@/lib/portfolio-import/parse';
import { useStocks } from '@/components/data/StocksProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PortfolioDisclaimer } from '@/components/portfolio/PortfolioDisclaimer';
import { MAX_PORTFOLIOS, type PortfolioWithPositions } from '@/components/portfolio/portfolio-format';

const MAX_ROWS = 100;
const MAX_NEW_STOCKS = 10; // matches /api/stock-add's daily limit
const NEW = '__new__';

interface Row {
  key: string;
  ticker: string;
  shares: number;
  cost: string;
  opened_at: string | null;
  include: boolean;
}

type Done = { portfolioId: string; imported: number; skipped: { ticker: string; reason: string }[] };

export interface ImportHoldingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolios: PortfolioWithPositions[];
  defaultPortfolioId: string | null;
  onImported: (portfolioId: string) => void;
}

export function ImportHoldingsDialog({ open, onOpenChange, portfolios, defaultPortfolioId, onImported }: ImportHoldingsDialogProps) {
  const { getStock } = useStocks();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [target, setTarget] = useState<string>(defaultPortfolioId ?? NEW);
  const [newName, setNewName] = useState('Imported holdings');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const reset = () => {
    setText('');
    setFileName(null);
    setParsed(null);
    setRows([]);
    setBusy(null);
    setError(null);
    setDone(null);
    setTarget(defaultPortfolioId ?? NEW);
  };

  const read = (source: string) => {
    setError(null);
    const result = parseHoldings(source);
    if (result.holdings.length === 0) {
      setError('No holdings found. Upload a positions or Robinhood activity CSV, or paste lines like “AAPL 10 150”.');
      return;
    }
    setParsed(result);
    setRows(
      result.holdings.map((h, i) => ({
        key: `${h.line}-${i}`,
        ticker: h.ticker,
        shares: h.shares,
        cost: h.cost_basis === null ? '' : String(h.cost_basis),
        opened_at: h.opened_at,
        include: i < MAX_ROWS,
      }))
    );
    if (result.source !== 'Pasted list') setNewName(`Imported from ${fileName ?? result.source}`.slice(0, 60));
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('That file is over 2 MB. Export only your positions, then try again.');
      return;
    }
    setFileName(file.name);
    const content = await file.text();
    setText(content);
    read(content);
  };

  const chosen = rows.filter((r) => r.include);
  const untracked = useMemo(() => [...new Set(chosen.filter((r) => !getStock(r.ticker)).map((r) => r.ticker))], [chosen, getStock]);
  const missingCost = chosen.filter((r) => !(Number(r.cost) >= 0) || r.cost.trim() === '');

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const runImport = async () => {
    setError(null);
    if (chosen.length === 0) return setError('Choose at least one holding to import.');
    if (chosen.length > MAX_ROWS) return setError(`Import at most ${MAX_ROWS} holdings at a time.`);
    if (missingCost.length > 0) return setError(`Add the cost per share for ${missingCost.map((r) => r.ticker).join(', ')}.`);
    if (target === NEW && !newName.trim()) return setError('Name the new portfolio.');
    if (target === NEW && portfolios.length >= MAX_PORTFOLIOS) return setError(`You can have up to ${MAX_PORTFOLIOS} portfolios.`);

    const skipped: { ticker: string; reason: string }[] = [];
    try {
      // Start tracking tickers 3x Hunter doesn't follow yet (same daily limit as search).
      const failed = new Set<string>();
      for (const [i, ticker] of untracked.entries()) {
        if (i >= MAX_NEW_STOCKS) {
          failed.add(ticker);
          skipped.push({ ticker, reason: `Only ${MAX_NEW_STOCKS} new stocks can be added per day.` });
          continue;
        }
        setBusy(`Adding ${ticker} to tracking (${i + 1} of ${Math.min(untracked.length, MAX_NEW_STOCKS)})`);
        try {
          await addStock(ticker);
        } catch (err) {
          failed.add(ticker);
          skipped.push({ ticker, reason: err instanceof Error ? err.message : 'Could not start tracking it.' });
        }
      }

      let portfolioId = target;
      if (target === NEW) {
        setBusy('Creating portfolio');
        portfolioId = (await createPortfolio(newName.trim().slice(0, 60))).id;
      }

      const payload = chosen
        .filter((r) => !failed.has(r.ticker))
        .map((r) => ({ ticker: r.ticker, shares: r.shares, cost_basis: Number(r.cost), ...(r.opened_at ? { opened_at: r.opened_at } : {}) }));
      let imported = 0;
      if (payload.length > 0) {
        setBusy(`Importing ${payload.length} ${payload.length === 1 ? 'holding' : 'holdings'}`);
        const res = await importPositions(portfolioId, payload);
        imported = res.imported;
        skipped.push(...res.skipped.map((s) => ({ ticker: s.ticker, reason: s.reason })));
      }
      setDone({ portfolioId, imported, skipped });
      onImported(portfolioId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed. Nothing else was changed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import holdings</DialogTitle>
          <DialogDescription>
            Bring in positions from another brokerage. Your file is read in this browser; only the holdings you confirm are
            saved, as simulated positions.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
          {done ? (
            <div className="space-y-3" role="status">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Imported {done.imported} {done.imported === 1 ? 'holding' : 'holdings'}.
              </p>
              {done.skipped.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
                  <p className="font-medium">Skipped {done.skipped.length}:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {done.skipped.map((s, i) => (
                      <li key={`${s.ticker}-${i}`}>
                        <span className="font-medium">{s.ticker}</span>: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : !parsed ? (
            <>
              <PortfolioDisclaimer compact />
              <div className="space-y-2 text-[13px] text-neutral-700">
                <p className="font-medium text-neutral-900">Where to get the file</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Fidelity, Schwab, Vanguard, E*TRADE, Webull: Positions page, then Download or Export (CSV).</li>
                  <li>Robinhood: Account, Reports and statements, Reports, then download account activity (CSV).</li>
                  <li>Anything else: paste one holding per line, like “AAPL 10 150” (ticker, shares, cost per share).</li>
                </ul>
              </div>
              <label
                htmlFor="import-file"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-700 hover:border-neutral-500 focus-within:ring-2 focus-within:ring-ring"
              >
                <FileUp className="h-6 w-6 text-neutral-400" aria-hidden="true" />
                <span className="font-medium">{fileName ?? 'Choose a CSV file'}</span>
                <span className="text-[12px] text-muted-foreground">.csv or .txt, up to 2 MB</span>
                <input id="import-file" type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e)} />
              </label>
              <div className="space-y-1">
                <label htmlFor="import-paste" className="text-[13px] font-medium text-neutral-800">
                  Or paste
                </label>
                <textarea
                  id="import-paste"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  placeholder={'AAPL 10 150\nNVDA 5 120.50'}
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">
                Read <span className="font-medium text-neutral-900">{parsed.holdings.length}</span> holdings from{' '}
                {fileName ?? parsed.source.toLowerCase()}
                {parsed.format === 'robinhood-activity' && ', rebuilt from your buys and sells at average cost'}.
                {parsed.skipped.length > 0 && ` ${parsed.skipped.length} lines skipped (cash, totals, options).`}
              </p>
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-[12px] text-muted-foreground">
                      <th scope="col" className="px-3 py-2">
                        <span className="sr-only">Include</span>
                      </th>
                      <th scope="col" className="px-3 py-2">Ticker</th>
                      <th scope="col" className="px-3 py-2 text-right">Shares</th>
                      <th scope="col" className="px-3 py-2">Cost per share</th>
                      <th scope="col" className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const tracked = Boolean(getStock(r.ticker));
                      return (
                        <tr key={r.key} className="border-b border-neutral-100 last:border-0">
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              aria-label={`Include ${r.ticker}`}
                              checked={r.include}
                              onChange={(e) => update(r.key, { include: e.target.checked })}
                            />
                          </td>
                          <td className="px-3 py-1.5 font-medium text-neutral-900">{r.ticker}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.shares.toLocaleString()}</td>
                          <td className="px-3 py-1.5">
                            <Input
                              aria-label={`Cost per share for ${r.ticker}`}
                              inputMode="decimal"
                              value={r.cost}
                              placeholder="Required"
                              onChange={(e) => update(r.key, { cost: e.target.value.replace(/[^0-9.]/g, '') })}
                              className="h-8 w-28"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-[12px]">
                            {tracked ? (
                              <span className="text-emerald-700">Tracked</span>
                            ) : (
                              <span className="text-amber-700">Will start tracking</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {untracked.length > MAX_NEW_STOCKS && (
                <p className="text-[12px] text-amber-800">
                  {untracked.length} tickers aren’t tracked yet. Up to {MAX_NEW_STOCKS} new stocks can be added per day; the rest
                  will be skipped.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[13px] font-medium text-neutral-800" id="import-target-label">
                    Import into
                  </label>
                  <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger aria-labelledby="import-target-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW}>
                        <span className="inline-flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          New portfolio
                        </span>
                      </SelectItem>
                      {portfolios.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {target === NEW && (
                  <div className="space-y-1">
                    <label htmlFor="import-new-name" className="text-[13px] font-medium text-neutral-800">
                      Portfolio name
                    </label>
                    <Input id="import-new-name" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
                  </div>
                )}
              </div>
            </>
          )}
          {busy && (
            <p role="status" className="flex items-center gap-2 text-[13px] text-neutral-700">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {busy}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-red-700">
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter className="gap-2">
          {done ? (
            <DialogClose asChild>
              <Button type="button">View portfolio</Button>
            </DialogClose>
          ) : parsed ? (
            <>
              <Button type="button" variant="outline" onClick={reset} disabled={Boolean(busy)}>
                Start over
              </Button>
              <Button type="button" onClick={() => void runImport()} disabled={Boolean(busy) || chosen.length === 0}>
                Import {chosen.length} {chosen.length === 1 ? 'holding' : 'holdings'}
              </Button>
            </>
          ) : (
            <>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" onClick={() => read(text)} disabled={!text.trim()}>
                Read holdings
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
