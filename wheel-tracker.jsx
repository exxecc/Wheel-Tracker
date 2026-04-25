import { useState, useMemo, useEffect, useCallback } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";

const SEED_TRADES = [
  { id: 1, ticker: "TSLA", type: "CSP", strike: 220, expiry: "2026-01-17", premium: 4.20, contracts: 2, openDate: "2025-12-20", status: "closed", closeDate: "2025-12-31", closeOutcome: "expired", closePnl: 840, sharesAdded: 0, note: "Expired worthless" },
  { id: 2, ticker: "AAPL", type: "CSP", strike: 190, expiry: "2026-02-07", premium: 2.85, contracts: 3, openDate: "2026-01-10", status: "closed", closeDate: "2026-02-07", closeOutcome: "assigned", closePnl: 855, sharesAdded: 300, costBasis: 190, note: "Assigned — bought 300 shares at $190" },
  { id: 3, ticker: "TSLA", type: "CC", strike: 235, expiry: "2026-02-21", premium: 3.60, contracts: 2, openDate: "2026-01-20", status: "closed", closeDate: "2026-02-10", closeOutcome: "bought_back", closePnl: -180, sharesAdded: 0, note: "Bought back early" },
  { id: 4, ticker: "NVDA", type: "CSP", strike: 115, expiry: "2026-03-07", premium: 3.10, contracts: 5, openDate: "2026-02-05", status: "closed", closeDate: "2026-03-07", closeOutcome: "expired", closePnl: 1550, sharesAdded: 0, note: "Expired worthless" },
  { id: 5, ticker: "AAPL", type: "CC", strike: 200, expiry: "2026-03-21", premium: 2.20, contracts: 3, openDate: "2026-02-14", status: "closed", closeDate: "2026-03-15", closeOutcome: "called_away", closePnl: 420, sharesAdded: -300, note: "Shares called away at $200" },
  { id: 6, ticker: "NVDA", type: "CSP", strike: 108, expiry: "2026-04-04", premium: 2.75, contracts: 5, openDate: "2026-03-10", status: "open", closeDate: null, closeOutcome: null, closePnl: null, sharesAdded: 0, note: "In progress" },
  { id: 7, ticker: "TSLA", type: "CC", strike: 250, expiry: "2026-04-17", premium: 5.40, contracts: 2, openDate: "2026-03-22", status: "open", closeDate: null, closeOutcome: null, closePnl: null, sharesAdded: 0, note: "" },
];

const SEED_SHARES = [
  { id: 10, ticker: "TSLA", shares: 200, costBasis: 218.50, acquiredDate: "2025-12-15", acquiredVia: "purchase", note: "Initial position" },
];

const STARTING_CAPITAL = 50000;
const TICKER_COLORS = { AAPL: "#60a5fa", TSLA: "#f472b6", NVDA: "#a78bfa", SPY: "#34d399", MSFT: "#fb923c", AMZN: "#fbbf24" };
const tc = (ticker) => TICKER_COLORS[ticker] || "#94a3b8";

const CLOSE_OUTCOMES = {
  expired:    { label: "Expired Worthless",        color: "#10b981", icon: "✓" },
  bought_back:{ label: "Bought Back",              color: "#f59e0b", icon: "↩" },
  assigned:   { label: "Assigned (shares in)",     color: "#60a5fa", icon: "📥" },
  called_away:{ label: "Called Away (shares out)", color: "#f472b6", icon: "📤" },
};

const fmt$ = (v, sign = true) => {
  if (v === null || v === undefined) return "—";
  const s = sign && v > 0 ? "+" : "";
  return `${s}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";
const today = () => new Date().toISOString().slice(0, 10);

// ─── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEY = "wheeldesk-data";

async function loadFromStorage() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    if (result && result.value) {
      return JSON.parse(result.value);
    }
  } catch (_) {}
  return null;
}

async function saveToStorage(trades, shares) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify({ trades, shares }));
  } catch (_) {}
}

// ─── Close Modal ──────────────────────────────────────────────────────────────
const CloseModal = ({ trade, onClose, onSave }) => {
  const maxPrem = trade.premium * trade.contracts * 100;
  const [form, setForm] = useState({ closeDate: today(), closeOutcome: "expired", closePnl: maxPrem, buybackCost: "", assignedCostBasis: trade.strike, note: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleOutcomeChange = (outcome) => {
    set("closeOutcome", outcome);
    set("closePnl", outcome === "bought_back" ? "" : maxPrem);
  };

  const handleSave = () => {
    const outcome = form.closeOutcome;
    let sharesAdded = 0, costBasis = null;
    if (outcome === "assigned")    { sharesAdded = trade.contracts * 100; costBasis = +form.assignedCostBasis; }
    if (outcome === "called_away") { sharesAdded = -(trade.contracts * 100); }
    const finalPnl = outcome === "bought_back" ? maxPrem - (+form.buybackCost || 0) : +form.closePnl;
    onSave({ ...trade, status: "closed", closeDate: form.closeDate, closeOutcome: outcome, closePnl: finalPnl, sharesAdded, costBasis, note: form.note || trade.note });
  };

  const outcomes = trade.type === "CSP" ? ["expired", "bought_back", "assigned"] : ["expired", "bought_back", "called_away"];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Close — {trade.ticker} {trade.type} ${trade.strike}</span>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row"><label>Close Date</label><input type="date" value={form.closeDate} onChange={e => set("closeDate", e.target.value)} /></div>
          <div className="form-row">
            <label>What happened?</label>
            <div className="outcome-grid">
              {outcomes.map(o => {
                const oc = CLOSE_OUTCOMES[o];
                return (
                  <button key={o} className={`outcome-btn ${form.closeOutcome === o ? "selected" : ""}`}
                    onClick={() => handleOutcomeChange(o)}
                    style={form.closeOutcome === o ? { borderColor: oc.color, color: oc.color, background: oc.color + "18" } : {}}>
                    <span className="outcome-icon">{oc.icon}</span><span>{oc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {form.closeOutcome === "bought_back" && (
            <div className="form-row">
              <label>Buyback Cost (total $)</label>
              <input type="number" value={form.buybackCost} onChange={e => set("buybackCost", e.target.value)} placeholder={`Premium collected was $${maxPrem}`} />
              <div className="form-hint">P&L = ${maxPrem} collected − buyback cost</div>
            </div>
          )}
          {form.closeOutcome === "assigned" && (
            <div className="info-box blue">
              <strong>📥 Assignment</strong> — {trade.contracts * 100} shares of {trade.ticker} will be added to your holdings. Premium of <strong>${maxPrem}</strong> offsets your cost.
              <div className="form-row" style={{ marginTop: 10 }}><label>Cost Basis / share ($)</label><input type="number" value={form.assignedCostBasis} onChange={e => set("assignedCostBasis", e.target.value)} /></div>
            </div>
          )}
          {form.closeOutcome === "called_away" && <div className="info-box pink"><strong>📤 Called Away</strong> — {trade.contracts * 100} shares of {trade.ticker} will be removed from your holdings at ${trade.strike}/share.</div>}
          {form.closeOutcome === "expired" && <div className="info-box green"><strong>✓ Expired Worthless</strong> — Full premium of <strong>${maxPrem}</strong> is yours to keep.</div>}
          {(form.closeOutcome === "expired" || form.closeOutcome === "called_away" || form.closeOutcome === "assigned") && (
            <div className="form-row"><label>Realized P&L ($)</label><input type="number" value={form.closePnl} onChange={e => set("closePnl", e.target.value)} /></div>
          )}
          <div className="form-row"><label>Note (optional)</label><input value={form.note} onChange={e => set("note", e.target.value)} placeholder="Any notes..." /></div>
          <button className="save-btn" onClick={handleSave}>Confirm Close</button>
        </div>
      </div>
    </div>
  );
};

// ─── Trade Modal ──────────────────────────────────────────────────────────────
const TradeModal = ({ trade, onClose, onSave }) => {
  const [form, setForm] = useState(trade || { ticker: "", type: "CSP", strike: "", expiry: "", premium: "", contracts: 1, openDate: today(), status: "open", closeDate: "", closeOutcome: null, closePnl: "", sharesAdded: 0, note: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.ticker || !form.strike || !form.expiry || !form.premium) return;
    onSave({ ...form, id: form.id || Date.now(), strike: +form.strike, premium: +form.premium, contracts: +form.contracts, closePnl: form.closePnl === "" ? null : +form.closePnl, sharesAdded: +form.sharesAdded || 0 });
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span>{trade ? "Edit Trade" : "New Trade"}</span><button className="x-btn" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-row two-col">
            <div><label>Ticker</label><input value={form.ticker} onChange={e => set("ticker", e.target.value.toUpperCase())} placeholder="AAPL" /></div>
            <div><label>Type</label><select value={form.type} onChange={e => set("type", e.target.value)}><option value="CSP">CSP — Cash-Secured Put</option><option value="CC">CC — Covered Call</option></select></div>
          </div>
          <div className="form-row two-col">
            <div><label>Strike ($)</label><input type="number" value={form.strike} onChange={e => set("strike", e.target.value)} placeholder="190" /></div>
            <div><label>Contracts</label><input type="number" value={form.contracts} onChange={e => set("contracts", e.target.value)} min="1" /></div>
          </div>
          <div className="form-row two-col">
            <div><label>Premium / share ($)</label><input type="number" value={form.premium} onChange={e => set("premium", e.target.value)} placeholder="2.85" step="0.01" /></div>
            <div><label>Expiry</label><input type="date" value={form.expiry} onChange={e => set("expiry", e.target.value)} /></div>
          </div>
          <div className="form-row two-col">
            <div><label>Open Date</label><input type="date" value={form.openDate} onChange={e => set("openDate", e.target.value)} /></div>
            <div><label>Status</label><select value={form.status} onChange={e => set("status", e.target.value)}><option value="open">Open</option><option value="closed">Closed</option></select></div>
          </div>
          <div className="form-row"><label>Note</label><input value={form.note} onChange={e => set("note", e.target.value)} placeholder="Optional note..." /></div>
          <button className="save-btn" onClick={handleSave}>Save Trade</button>
        </div>
      </div>
    </div>
  );
};

// ─── Share Modal ──────────────────────────────────────────────────────────────
const ShareModal = ({ position, onClose, onSave, onDelete }) => {
  const [form, setForm] = useState(position || { ticker: "", shares: "", costBasis: "", acquiredDate: today(), acquiredVia: "purchase", note: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.ticker || !form.shares || !form.costBasis) return;
    onSave({ ...form, id: form.id || Date.now(), shares: +form.shares, costBasis: +form.costBasis });
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span>{position ? "Edit Position" : "Add Shares"}</span><button className="x-btn" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-row two-col">
            <div><label>Ticker</label><input value={form.ticker} onChange={e => set("ticker", e.target.value.toUpperCase())} placeholder="AAPL" /></div>
            <div><label>Shares</label><input type="number" value={form.shares} onChange={e => set("shares", e.target.value)} placeholder="100" /></div>
          </div>
          <div className="form-row two-col">
            <div><label>Cost Basis / share ($)</label><input type="number" value={form.costBasis} onChange={e => set("costBasis", e.target.value)} placeholder="185.00" step="0.01" /></div>
            <div><label>Date Acquired</label><input type="date" value={form.acquiredDate} onChange={e => set("acquiredDate", e.target.value)} /></div>
          </div>
          <div className="form-row"><label>Acquired Via</label>
            <select value={form.acquiredVia} onChange={e => set("acquiredVia", e.target.value)}>
              <option value="purchase">Direct Purchase</option><option value="assignment">CSP Assignment</option><option value="other">Other</option>
            </select>
          </div>
          <div className="form-row"><label>Note</label><input value={form.note} onChange={e => set("note", e.target.value)} placeholder="Optional note..." /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="save-btn" onClick={handleSave}>Save Position</button>
            {position && <button onClick={() => { if (window.confirm("Delete this position?")) onDelete(position.id); }} style={{ background: "rgba(239,68,68,.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 10, padding: "11px 18px", cursor: "pointer", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

const EquityTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return <div className="chart-tooltip"><div className="tt-date">{label}</div><div className="tt-val" style={{ color: val >= STARTING_CAPITAL ? "#10b981" : "#ef4444" }}>${val.toLocaleString()}</div></div>;
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [trades, setTrades] = useState([]);
  const [shares, setShares] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved" | "saving" | "error"

  // ── Load from storage on mount ──
  useEffect(() => {
    loadFromStorage().then(data => {
      if (data && data.trades) {
        setTrades(data.trades);
        setShares(data.shares || []);
      } else {
        // First time — load seed data
        setTrades(SEED_TRADES);
        setShares(SEED_SHARES);
      }
      setLoaded(true);
    });
  }, []);

  // ── Auto-save whenever trades or shares change (after initial load) ──
  useEffect(() => {
    if (!loaded) return;
    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      await saveToStorage(trades, shares);
      setSaveStatus("saved");
    }, 600);
    return () => clearTimeout(timer);
  }, [trades, shares, loaded]);

  // ── Derived ──
  const closedTrades = trades.filter(t => t.status === "closed" && t.closePnl !== null);
  const openTrades   = trades.filter(t => t.status === "open");
  const totalPnl     = closedTrades.reduce((s, t) => s + t.closePnl, 0);
  const wins         = closedTrades.filter(t => t.closePnl > 0);
  const winRate      = closedTrades.length ? Math.round(wins.length / closedTrades.length * 100) : 0;

  const equityCurve = useMemo(() => {
    const sorted = [...closedTrades].sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));
    let running = STARTING_CAPITAL;
    const pts = [{ date: "Start", value: STARTING_CAPITAL }];
    sorted.forEach(t => { running += t.closePnl; pts.push({ date: fmtDate(t.closeDate), value: running }); });
    return pts;
  }, [closedTrades]);

  const sharesByTicker = useMemo(() => {
    const map = {};
    shares.forEach(p => { map[p.ticker] = (map[p.ticker] || 0) + p.shares; });
    return map;
  }, [shares]);

  // ── Handlers ──
  const saveTrade = useCallback((t) => {
    setTrades(prev => prev.find(x => x.id === t.id) ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]);
    setModal(null);
  }, []);

  const closeTrade = useCallback((ct) => {
    setTrades(prev => prev.map(t => t.id === ct.id ? ct : t));
    if (ct.closeOutcome === "assigned") {
      setShares(prev => [...prev, { id: Date.now(), ticker: ct.ticker, shares: ct.sharesAdded, costBasis: ct.costBasis || ct.strike, acquiredDate: ct.closeDate, acquiredVia: "assignment", note: `Auto-added from CSP ${ct.ticker} $${ct.strike}` }]);
    } else if (ct.closeOutcome === "called_away") {
      let toRemove = Math.abs(ct.sharesAdded);
      setShares(prev => [...prev].sort((a, b) => new Date(a.acquiredDate) - new Date(b.acquiredDate)).reduce((acc, pos) => {
        if (pos.ticker !== ct.ticker || toRemove <= 0) { acc.push(pos); return acc; }
        if (pos.shares <= toRemove) { toRemove -= pos.shares; return acc; }
        acc.push({ ...pos, shares: pos.shares - toRemove }); toRemove = 0; return acc;
      }, []));
    }
    setModal(null);
  }, []);

  const saveShare = useCallback((p) => {
    setShares(prev => prev.find(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]);
    setModal(null);
  }, []);

  const deleteShare = useCallback((id) => { setShares(prev => prev.filter(p => p.id !== id)); setModal(null); }, []);
  const deleteTrade = useCallback((id) => { if (window.confirm("Delete this trade?")) setTrades(prev => prev.filter(t => t.id !== id)); }, []);

  const displayTrades = trades.filter(t => tradeFilter === "all" || t.status === tradeFilter).sort((a, b) => new Date(b.openDate) - new Date(a.openDate));

  if (!loaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#07090e", color: "#3d5470", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
      Loading your data…
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07090e; color: #e2e8f0; font-family: 'DM Mono', monospace; }
        :root { --bg:#07090e; --surf:#0d1420; --surf2:#111c2b; --border:#1b2a3b; --accent:#10b981; --muted:#3d5470; --text:#e2e8f0; }
        .app { max-width:1120px; margin:0 auto; padding:24px 16px 64px; }
        .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:12px; }
        .logo { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; letter-spacing:-0.5px; }
        .logo em { color:#10b981; font-style:normal; }
        .hdr-right { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .save-indicator { font-size:10px; color:var(--muted); letter-spacing:0.5px; display:flex; align-items:center; gap:5px; }
        .save-dot { width:6px; height:6px; border-radius:50%; background:var(--muted); flex-shrink:0; transition:background .3s; }
        .save-dot.saved  { background:#10b981; }
        .save-dot.saving { background:#f59e0b; }
        .save-dot.error  { background:#ef4444; }
        .hdr-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .btn-primary { background:#10b981; color:#07090e; border:none; padding:9px 18px; font-family:'Syne',sans-serif; font-weight:700; font-size:12px; border-radius:8px; cursor:pointer; letter-spacing:0.5px; transition:opacity .15s; }
        .btn-primary:hover { opacity:.85; }
        .btn-secondary { background:var(--surf2); color:var(--text); border:1px solid var(--border); padding:9px 18px; font-family:'Syne',sans-serif; font-weight:600; font-size:12px; border-radius:8px; cursor:pointer; transition:all .15s; }
        .btn-secondary:hover { border-color:#10b981; color:#10b981; }
        .tabs { display:flex; gap:2px; margin-bottom:24px; border-bottom:1px solid var(--border); overflow-x:auto; }
        .tab { background:none; border:none; color:var(--muted); font-family:'Syne',sans-serif; font-size:11px; font-weight:700; padding:10px 14px; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; transition:all .15s; letter-spacing:0.8px; text-transform:uppercase; white-space:nowrap; }
        .tab.active { color:#10b981; border-color:#10b981; }
        .tab:hover:not(.active) { color:var(--text); }
        .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
        .stat { background:var(--surf); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
        .stat-label { font-size:9px; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px; }
        .stat-val { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; line-height:1; }
        .stat-sub { font-size:10px; color:var(--muted); margin-top:5px; }
        .green { color:#10b981; } .red { color:#ef4444; } .amber { color:#f59e0b; } .blue-c { color:#60a5fa; }
        .card { background:var(--surf); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:16px; }
        .card-title { font-family:'Syne',sans-serif; font-size:10px; font-weight:700; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:16px; }
        .chart-tooltip { background:#131f30; border:1px solid var(--border); border-radius:8px; padding:10px 14px; }
        .tt-date { font-size:10px; color:var(--muted); margin-bottom:4px; }
        .tt-val { font-family:'Syne',sans-serif; font-size:18px; font-weight:800; }
        .sec-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .sec-title { font-family:'Syne',sans-serif; font-size:10px; font-weight:700; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; }
        .pills { display:flex; gap:6px; }
        .pill { background:none; border:1px solid var(--border); color:var(--muted); font-family:'DM Mono'; font-size:10px; padding:4px 12px; border-radius:20px; cursor:pointer; transition:all .15s; }
        .pill.active { border-color:#10b981; color:#10b981; }
        .tbl-wrap { background:var(--surf); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:16px; overflow-x:auto; }
        table { width:100%; border-collapse:collapse; font-size:12px; min-width:580px; }
        th { text-align:left; padding:8px 14px; color:var(--muted); font-size:9px; letter-spacing:1.2px; text-transform:uppercase; border-bottom:1px solid var(--border); font-weight:500; white-space:nowrap; }
        td { padding:11px 14px; border-bottom:1px solid #0f1a26; vertical-align:middle; }
        tr:last-child td { border-bottom:none; }
        tbody tr:hover td { background:rgba(16,185,129,.03); }
        .ticker { font-family:'Syne',sans-serif; font-weight:800; font-size:13px; }
        .badge { display:inline-flex; align-items:center; gap:4px; font-size:9px; font-weight:500; padding:2px 8px; border-radius:4px; letter-spacing:0.5px; }
        .badge-csp { background:rgba(16,185,129,.15); color:#10b981; }
        .badge-cc  { background:rgba(245,158,11,.15); color:#f59e0b; }
        .outcome-chip { font-size:9px; padding:2px 8px; border-radius:4px; }
        .dot { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:5px; }
        .dot-open { background:#f59e0b; box-shadow:0 0 5px #f59e0b80; }
        .dot-closed { background:var(--muted); }
        .act { display:flex; gap:6px; }
        .act-btn { background:none; border:1px solid var(--border); color:var(--muted); font-size:10px; padding:3px 9px; border-radius:5px; cursor:pointer; transition:all .15s; font-family:'DM Mono'; white-space:nowrap; }
        .act-btn:hover { border-color:#10b981; color:#10b981; }
        .act-btn.tbl-close:hover { border-color:#60a5fa; color:#60a5fa; }
        .act-btn.del:hover { border-color:#ef4444; color:#ef4444; }
        .open-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:12px; margin-bottom:20px; }
        .open-card { background:var(--surf); border:1px solid var(--border); border-radius:12px; padding:16px; position:relative; overflow:hidden; }
        .open-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; }
        .open-card.csp::before { background:#10b981; }
        .open-card.cc::before  { background:#f59e0b; }
        .oc-ticker { font-family:'Syne',sans-serif; font-weight:800; font-size:17px; }
        .oc-meta { font-size:10px; color:var(--muted); margin-top:3px; }
        .oc-prem { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:#10b981; margin-top:10px; }
        .oc-sub  { font-size:10px; color:var(--muted); }
        .share-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; margin-bottom:20px; }
        .share-card { background:var(--surf); border:1px solid var(--border); border-radius:12px; padding:16px; position:relative; overflow:hidden; }
        .share-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:#60a5fa; }
        .sc-ticker { font-family:'Syne',sans-serif; font-weight:800; font-size:17px; }
        .sc-meta { font-size:10px; color:var(--muted); margin-top:3px; }
        .sc-value { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:#60a5fa; margin-top:10px; }
        .sc-sub { font-size:10px; color:var(--muted); }
        .via-badge { font-size:9px; padding:2px 7px; border-radius:4px; background:rgba(96,165,250,.12); color:#60a5fa; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.78); display:flex; align-items:center; justify-content:center; z-index:100; backdrop-filter:blur(4px); padding:16px; }
        .modal { background:#0d1420; border:1px solid var(--border); border-radius:16px; width:100%; max-width:460px; max-height:90vh; overflow-y:auto; }
        .modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--border); font-family:'Syne',sans-serif; font-weight:700; font-size:14px; position:sticky; top:0; background:#0d1420; z-index:1; }
        .x-btn { background:none; border:none; color:var(--muted); font-size:16px; cursor:pointer; line-height:1; }
        .modal-body { padding:20px; display:flex; flex-direction:column; gap:13px; }
        .form-row { display:flex; flex-direction:column; gap:5px; }
        .form-row.two-col { flex-direction:row; gap:10px; }
        .form-row.two-col > div { flex:1; display:flex; flex-direction:column; gap:5px; }
        label { font-size:9px; color:var(--muted); letter-spacing:1.2px; text-transform:uppercase; }
        input, select { background:#07090e; border:1px solid var(--border); color:var(--text); font-family:'DM Mono'; font-size:12px; padding:8px 11px; border-radius:8px; outline:none; width:100%; transition:border-color .15s; }
        input:focus, select:focus { border-color:#10b981; }
        select option { background:#0d1420; }
        .save-btn { background:#10b981; color:#07090e; border:none; padding:11px; font-family:'Syne',sans-serif; font-weight:800; font-size:13px; border-radius:10px; cursor:pointer; width:100%; margin-top:4px; transition:opacity .15s; letter-spacing:0.5px; }
        .save-btn:hover { opacity:.85; }
        .form-hint { font-size:10px; color:var(--muted); font-style:italic; }
        .outcome-grid { display:flex; flex-direction:column; gap:7px; }
        .outcome-btn { background:#07090e; border:1px solid var(--border); color:var(--muted); font-family:'DM Mono'; font-size:11px; padding:10px 14px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:10px; text-align:left; transition:all .15s; width:100%; }
        .outcome-btn:hover { border-color:var(--muted); color:var(--text); }
        .outcome-icon { font-size:15px; width:20px; text-align:center; flex-shrink:0; }
        .info-box { border-radius:8px; padding:12px 14px; font-size:11px; line-height:1.6; }
        .info-box.green { background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.25); color:#10b981; }
        .info-box.blue  { background:rgba(96,165,250,.1); border:1px solid rgba(96,165,250,.25); color:#60a5fa; }
        .info-box.pink  { background:rgba(244,114,182,.1); border:1px solid rgba(244,114,182,.25); color:#f472b6; }
        .empty { text-align:center; color:var(--muted); padding:40px 20px; font-size:12px; }
        @media(max-width:680px) { .stats { grid-template-columns:repeat(2,1fr); } }
      `}</style>

      <div className="app">
        <div className="header">
          <div className="logo">WHEEL<em>.</em>DESK</div>
          <div className="hdr-right">
            <div className="save-indicator">
              <div className={`save-dot ${saveStatus}`}></div>
              {saveStatus === "saving" ? "saving…" : saveStatus === "error" ? "save failed" : "saved"}
            </div>
            <div className="hdr-actions">
              <button className="btn-secondary" onClick={() => setModal({ type: "newShare" })}>+ Add Shares</button>
              <button className="btn-primary"   onClick={() => setModal({ type: "newTrade" })}>+ New Trade</button>
            </div>
          </div>
        </div>

        <div className="tabs">
          {[["dashboard","Dashboard"],["open","Open Options"],["shares","Share Holdings"],["trades","Trade Log"]].map(([id,label]) => (
            <button key={id} className={`tab ${tab===id?"active":""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (<>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Realized P&L</div>
              <div className={`stat-val ${totalPnl >= 0 ? "green" : "red"}`}>{fmt$(totalPnl)}</div>
              <div className="stat-sub">{((totalPnl/STARTING_CAPITAL)*100).toFixed(1)}% on ${(STARTING_CAPITAL/1000).toFixed(0)}k capital</div>
            </div>
            <div className="stat">
              <div className="stat-label">Win Rate</div>
              <div className="stat-val amber">{winRate}%</div>
              <div className="stat-sub">{wins.length} / {closedTrades.length} closed</div>
            </div>
            <div className="stat">
              <div className="stat-label">Open Options</div>
              <div className="stat-val" style={{color:"#f59e0b"}}>{openTrades.length}</div>
              <div className="stat-sub">Max: {fmt$(openTrades.reduce((s,t)=>s+t.premium*t.contracts*100,0),false)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Shares Held</div>
              <div className="stat-val blue-c">{shares.reduce((s,p)=>s+p.shares,0)}</div>
              <div className="stat-sub">{[...new Set(shares.map(p=>p.ticker))].join(", ") || "none"}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Equity Curve — Realized Cash</div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={equityCurve} margin={{top:8,right:8,left:0,bottom:0}}>
                <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2a3b" vertical={false}/>
                <XAxis dataKey="date" tick={{fill:"#3d5470",fontSize:9,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#3d5470",fontSize:9,fontFamily:"DM Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/>
                <Tooltip content={<EquityTooltip/>}/>
                <ReferenceLine y={STARTING_CAPITAL} stroke="#1b2a3b" strokeDasharray="4 4"/>
                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#eg)" dot={{r:4,fill:"#10b981",strokeWidth:0}} activeDot={{r:6}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <div className="card-title">P&L per Closed Trade</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={[...closedTrades].sort((a,b)=>new Date(a.closeDate)-new Date(b.closeDate)).map(t=>({name:`${t.ticker} ${t.type}`,pnl:t.closePnl}))} margin={{top:8,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2a3b" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:"#3d5470",fontSize:8,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#3d5470",fontSize:9,fontFamily:"DM Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                <Tooltip formatter={v=>[`$${v}`,"P&L"]} contentStyle={{background:"#131f30",border:"1px solid #1b2a3b",borderRadius:8,fontFamily:"DM Mono",fontSize:11}}/>
                <ReferenceLine y={0} stroke="#1b2a3b"/>
                <Bar dataKey="pnl" radius={[4,4,0,0]}>
                  {closedTrades.map((_,i)=><Cell key={i} fill={closedTrades[i].closePnl>=0?"#10b981":"#ef4444"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>)}

        {/* ══ OPEN OPTIONS ══ */}
        {tab === "open" && (<>
          <div className="sec-hdr"><div className="sec-title">Open Options ({openTrades.length})</div></div>
          {openTrades.length === 0 && <div className="card empty">No open positions. Hit "+ New Trade" to add one.</div>}
          <div className="open-grid">
            {openTrades.map(t => {
              const dte = Math.ceil((new Date(t.expiry)-new Date())/86400000);
              const maxColl = t.premium*t.contracts*100;
              const dteColor = dte<=7?"#ef4444":dte<=14?"#f59e0b":"#3d5470";
              const sharesHeld = sharesByTicker[t.ticker] || 0;
              return (
                <div key={t.id} className={`open-card ${t.type.toLowerCase()}`}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div><div className="oc-ticker" style={{color:tc(t.ticker)}}>{t.ticker}</div><div className="oc-meta">{t.type} · ${t.strike} strike · {t.contracts}x</div></div>
                    <span className={`badge ${t.type==="CSP"?"badge-csp":"badge-cc"}`}>{t.type}</span>
                  </div>
                  <div className="oc-prem">{fmt$(maxColl,false)}</div>
                  <div className="oc-sub">max premium · ${t.premium}/share</div>
                  {t.type==="CC" && sharesHeld>0 && <div style={{marginTop:6,fontSize:10,color:"#60a5fa"}}>Covered by {sharesHeld} shares held</div>}
                  {t.type==="CSP" && <div style={{marginTop:6,fontSize:10,color:"#3d5470"}}>Cash secured: ${(t.strike*t.contracts*100).toLocaleString()}</div>}
                  <div style={{marginTop:12,display:"flex",justifyContent:"space-between",fontSize:10,color:"#3d5470"}}>
                    <span>Exp: {fmtDate(t.expiry)}</span><span style={{color:dteColor}}>{dte}d to exp</span>
                  </div>
                  {t.note && <div style={{marginTop:6,fontSize:10,color:"#3d5470",fontStyle:"italic"}}>{t.note}</div>}
                  <div style={{marginTop:12,display:"flex",gap:6}}>
                    <button className="act-btn" style={{flex:1}} onClick={()=>setModal({type:"editTrade",data:t})}>Edit</button>
                    <button className="act-btn tbl-close" style={{flex:1}} onClick={()=>setModal({type:"closeTrade",data:t})}>Close</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

        {/* ══ SHARE HOLDINGS ══ */}
        {tab === "shares" && (<>
          <div className="sec-hdr">
            <div className="sec-title">Share Holdings ({shares.reduce((s,p)=>s+p.shares,0)} shares)</div>
            <button className="btn-secondary" onClick={()=>setModal({type:"newShare"})}>+ Add</button>
          </div>
          {shares.length===0 && <div className="card empty">No share positions tracked. Close a CSP as "Assigned" to auto-add, or click "+ Add Shares".</div>}
          <div className="share-grid">
            {shares.map(p => {
              const openCCs = openTrades.filter(t=>t.type==="CC"&&t.ticker===p.ticker);
              return (
                <div key={p.id} className="share-card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div><div className="sc-ticker" style={{color:tc(p.ticker)}}>{p.ticker}</div><div className="sc-meta">{p.shares} shares · ${p.costBasis.toFixed(2)}/share</div></div>
                    <span className="via-badge">{p.acquiredVia}</span>
                  </div>
                  <div className="sc-value">{fmt$(p.shares*p.costBasis,false)}</div>
                  <div className="sc-sub">total cost basis · {fmtDate(p.acquiredDate)}</div>
                  {openCCs.length>0 && <div style={{marginTop:8,fontSize:10,color:"#f59e0b"}}>{openCCs.length} open CC{openCCs.length>1?"s":""} against this position</div>}
                  {p.note && <div style={{marginTop:6,fontSize:10,color:"#3d5470",fontStyle:"italic"}}>{p.note}</div>}
                  <div style={{marginTop:12}}><button className="act-btn" style={{width:"100%"}} onClick={()=>setModal({type:"editShare",data:p})}>Edit / Adjust</button></div>
                </div>
              );
            })}
          </div>
          {shares.length > 0 && (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Ticker</th><th>Shares</th><th>Cost/Share</th><th>Total Cost</th><th>Via</th><th>Acquired</th><th></th></tr></thead>
                <tbody>
                  {shares.map(p=>(
                    <tr key={p.id}>
                      <td><span className="ticker" style={{color:tc(p.ticker)}}>{p.ticker}</span></td>
                      <td>{p.shares.toLocaleString()}</td>
                      <td>${p.costBasis.toFixed(2)}</td>
                      <td className="blue-c">{fmt$(p.shares*p.costBasis,false)}</td>
                      <td><span className="via-badge">{p.acquiredVia}</span></td>
                      <td style={{color:"#3d5470"}}>{fmtDate(p.acquiredDate)}</td>
                      <td><div className="act">
                        <button className="act-btn" onClick={()=>setModal({type:"editShare",data:p})}>edit</button>
                        <button className="act-btn del" onClick={()=>deleteShare(p.id)}>del</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ══ TRADE LOG ══ */}
        {tab === "trades" && (<>
          <div className="sec-hdr">
            <div className="sec-title">Trade Log ({trades.length})</div>
            <div className="pills">{["all","open","closed"].map(f=><button key={f} className={`pill ${tradeFilter===f?"active":""}`} onClick={()=>setTradeFilter(f)}>{f}</button>)}</div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Ticker</th><th>Type</th><th>Strike</th><th>Expiry</th><th>Contracts</th><th>Premium</th><th>Outcome</th><th>P&L</th><th></th></tr></thead>
              <tbody>
                {displayTrades.map(t=>{
                  const oc = t.closeOutcome ? CLOSE_OUTCOMES[t.closeOutcome] : null;
                  return (
                    <tr key={t.id}>
                      <td><span className="ticker" style={{color:tc(t.ticker)}}>{t.ticker}</span></td>
                      <td><span className={`badge ${t.type==="CSP"?"badge-csp":"badge-cc"}`}>{t.type}</span></td>
                      <td>${t.strike}</td>
                      <td style={{color:"#3d5470"}}>{fmtDate(t.expiry)}</td>
                      <td>{t.contracts}</td>
                      <td>${t.premium} <span style={{color:"#3d5470",fontSize:9}}>({fmt$(t.premium*t.contracts*100,false)})</span></td>
                      <td>
                        {t.status==="open" ? <><span className="dot dot-open"/>open</>
                          : oc ? <span className="outcome-chip" style={{background:oc.color+"18",color:oc.color}}>{oc.icon} {oc.label}</span>
                          : <><span className="dot dot-closed"/>closed</>}
                      </td>
                      <td className={t.closePnl>0?"green":t.closePnl<0?"red":""}>{fmt$(t.closePnl)}</td>
                      <td><div className="act">
                        <button className="act-btn" onClick={()=>setModal({type:"editTrade",data:t})}>edit</button>
                        {t.status==="open" && <button className="act-btn tbl-close" onClick={()=>setModal({type:"closeTrade",data:t})}>close</button>}
                        <button className="act-btn del" onClick={()=>deleteTrade(t.id)}>del</button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}
      </div>

      {modal?.type === "newTrade"   && <TradeModal trade={null}          onClose={()=>setModal(null)} onSave={saveTrade}/>}
      {modal?.type === "editTrade"  && <TradeModal trade={modal.data}    onClose={()=>setModal(null)} onSave={saveTrade}/>}
      {modal?.type === "closeTrade" && <CloseModal trade={modal.data}    onClose={()=>setModal(null)} onSave={closeTrade}/>}
      {modal?.type === "newShare"   && <ShareModal position={null}        onClose={()=>setModal(null)} onSave={saveShare} onDelete={deleteShare}/>}
      {modal?.type === "editShare"  && <ShareModal position={modal.data}  onClose={()=>setModal(null)} onSave={saveShare} onDelete={deleteShare}/>}
    </>
  );
}
