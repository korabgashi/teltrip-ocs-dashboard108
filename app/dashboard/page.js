
"use client";
import { useEffect, useMemo, useState } from "react";

async function postJSON(path, body) {
  // Try POST first
  let res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // If the platform returns 405 (Method Not Allowed), retry as GET
  if (res.status === 405) {
    const q = new URLSearchParams(Object.entries(body || {}));
    res = await fetch(`${path}?${q.toString()}`, { method: "GET" });
  }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json?.error || text || `HTTP ${res.status}`);
  return json;
}
const s = (v) => (v===null||v===undefined) ? "" : String(v);

export default function Dashboard(){
  const [accountId, setAccountId] = useState(3771);
  const [listData, setListData] = useState([]);
  const [report, setReport] = useState({ rows:[], columns:[] });
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");

  const loadList = async () => {
    setLoading(true); setError("");
    try {
      const json = await postJSON("/api/ocs/list-subscribers", { accountId });
      const list = json?.listSubscriber?.subscriberList;
      setListData(Array.isArray(list) ? list : []);
    } catch (e) { setError(String(e)); setListData([]); }
    finally { setLoading(false); }
  };

  const loadReport = async () => {
    setLoadingReport(true); setError("");
    try {
      const json = await postJSON("/api/ocs/report", { accountId, startDate:"2025-06-01" });
      setReport({ rows: json.rows || [], columns: json.columns || [] });
    } catch (e) { setError(String(e)); setReport({ rows:[], columns:[] }); }
    finally { setLoadingReport(false); }
  };

  useEffect(()=> { loadList(); }, []);

  const kpis = useMemo(()=> {
    const total = listData.length;
    const active = listData.filter((r)=> Array.isArray(r?.status) && r.status.some(x => String(x?.status).toUpperCase()==="ACTIVE")).length;
    return { total, active, inactive: total - active };
  }, [listData]);

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <h1 style={{ fontSize:24, fontWeight:700 }}>OCS Dashboard</h1>
        <div style={{ display:'flex', gap:8 }}>
          <input type="number" value={accountId} onChange={(e)=>setAccountId(Number(e.target.value))}
            style={{ width:160, padding:8, borderRadius:10, border:'1px solid #2a3356', background:'#0f1428', color:'#e9ecf1' }} />
          <button onClick={loadList} style={{ padding:'8px 14px', borderRadius:10, border:0, background:'#4b74ff', color:'#fff', fontWeight:600 }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button onClick={loadReport} style={{ padding:'8px 14px', borderRadius:10, border:0, background:'#22c55e', color:'#0b1020', fontWeight:700 }}>
            {loadingReport ? "Building report…" : "Build Excel-like report"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop:16, padding:12, borderRadius:12, background:'#3a2030', color:'#ffd4d4', whiteSpace:'pre-wrap' }}>
          <strong>API error:</strong> {error}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginTop:16 }}>
        <div style={{ background:'#151a2e', padding:16, borderRadius:16 }}>
          <div style={{ opacity:0.7 }}>Total Subscribers</div>
          <div style={{ fontSize:28, fontWeight:700 }}>{kpis.total}</div>
        </div>
        <div style={{ background:'#151a2e', padding:16, borderRadius:16 }}>
          <div style={{ opacity:0.7 }}>Active</div>
          <div style={{ fontSize:28, fontWeight:700 }}>{kpis.active}</div>
        </div>
        <div style={{ background:'#151a2e', padding:16, borderRadius:16 }}>
          <div style={{ opacity:0.7 }}>Inactive</div>
          <div style={{ fontSize:28, fontWeight:700 }}>{kpis.inactive}</div>
        </div>
      </div>

      <div style={{ marginTop:24, background:'#151a2e', borderRadius:16, overflow:'auto' }}>
        <div style={{ minWidth: 1200 }}>
          {report.columns.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${report.columns.length}, minmax(160px,1fr))`, padding:12, borderBottom:'1px solid #2a3356', fontWeight:600 }}>
              {report.columns.map((c) => <div key={c}>{c}</div>)}
            </div>
          )}
          {report.rows.map((row, idx) => (
            <div key={idx} style={{ display:'grid', gridTemplateColumns:`repeat(${report.columns.length}, minmax(160px,1fr))`, padding:12, borderBottom:'1px solid #2a3356' }}>
              {report.columns.map((c) => <div key={c}>{s(row?.[c])}</div>)}
            </div>
          ))}
          {report.rows.length === 0 && !loadingReport && (
            <div style={{ padding:16, opacity:0.8 }}>Click <em>Build Excel-like report</em> to fetch packages & weekly usage.</div>
          )}
          {loadingReport && <div style={{ padding:16 }}>Working…</div>}
        </div>
      </div>
    </div>
  );
}
