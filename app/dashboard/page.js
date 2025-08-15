"use client";
import { useEffect, useMemo, useState } from "react";

/* ---------- helpers ---------- */
async function postJSON(path, body) {
  let res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 405) {
    const q = new URLSearchParams(Object.entries(body || {}));
    res = await fetch(`${path}?${q.toString()}`, { method: "GET" });
  }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json?.error || text || `HTTP ${res.status}`);
  return json;
}
const s = (v) => (v === null || v === undefined ? "" : String(v));
const n = (v) => (typeof v === "number" ? v : Number(v || 0));
const money = (v) => isFinite(n(v)) ? n(v).toFixed(2) : s(v);

function bytesToGB(val) {
  const num = n(val);
  if (!isFinite(num) || num === 0) return "0.00 GB";
  return (num / (1024 ** 3)).toFixed(2) + " GB";
}

/* ---------- page ---------- */
export default function Dashboard() {
  const [accountId, setAccountId] = useState(3771);
  const [listData, setListData] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");

  // simple list for KPIs
  const loadList = async () => {
    setLoading(true); setError("");
    try {
      const json = await postJSON("/api/ocs/list-subscribers", { accountId });
      const list = json?.listSubscriber?.subscriberList;
      setListData(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e)); setListData([]);
    } finally { setLoading(false); }
  };

  // report for table (no weekly columns shown; only totals)
  const loadReport = async () => {
    setLoadingReport(true); setError("");
    try {
      const json = await postJSON("/api/ocs/report", { accountId, startDate: "2025-06-01" });
      const incomingCols = json.columns || [];
      const rawRows = Array.isArray(json.rows) ? json.rows : [];

      const weeklyResCols  = incomingCols.filter((c) => c.startsWith("resellerCost_"));
      const weeklyUsedCols = incomingCols.filter((c) => c.startsWith("usedData_"));

      const enhanced = rawRows.map((r) => {
        const resellerWeeklyTotal = weeklyResCols.reduce((acc, k) => acc + (Number(r[k] ?? 0) || 0), 0);
        const usedWeeklyTotalBytes = weeklyUsedCols.reduce((acc, k) => acc + (Number(r[k] ?? 0) || 0), 0);

        return {
          subscriberId: s(r.subscriberId),
          iccid: s(r.iccid),
          lastUsageDate: s(r.lastUsageDate || ""),

          templateName: s(r.templateName || ""),
          activationDate: s(r.activationDate || r.tstartactivationutc || ""),
          expiryDate: s(r.expiryDate || r.tsexpirationutc || ""),

          // bytes -> GB (will also be formatted in render, but pre-calc keeps it clean)
          usedDataByte: n(r.usedDataByte || 0),
          pckDataByte: n(r.pckDataByte || 0),
          usedDataWeeklyTotalBytes: usedWeeklyTotalBytes,

          // money
          subscriberCost: r.subscriberCost === "" ? "" : n(r.subscriberCost || 0),
          resellerCost:   r.resellerCost   === "" ? "" : n(r.resellerCost   || 0),
          resellerCostWeeklyTotal: resellerWeeklyTotal,
        };
      });

      setRows(enhanced);
    } catch (e) {
      setError(String(e)); setRows([]);
    } finally { setLoadingReport(false); }
  };

  useEffect(() => { loadList(); }, []);

  const kpis = useMemo(() => {
    const total = listData.length;
    const active = listData.filter(
      (r) => Array.isArray(r?.status) && r.status.some((x) => String(x?.status).toUpperCase() === "ACTIVE")
    ).length;
    return { total, active, inactive: total - active };
  }, [listData]);

  /* ----- table layout (groups & columns) ----- */
  const GROUPS = [
    {
      title: "Subscriber",
      cols: [
        { key: "subscriberId", label: "Subscriber ID", align: "left" },
        { key: "iccid",        label: "ICCID",         align: "left", mono: true },
        { key: "lastUsageDate",label: "Last Usage",    align: "left" },
      ],
    },
    {
      title: "Package",
      cols: [
        { key: "templateName",  label: "Template Name", align: "left" },
        { key: "activationDate",label: "Activated",     align: "left" },
        { key: "expiryDate",    label: "Expires",       align: "left" },
      ],
    },
    {
      title: "Usage",
      cols: [
        { key: "usedDataByte",            label: "Used (Package)",   align: "right", fmt: (v)=>bytesToGB(v) },
        { key: "pckDataByte",             label: "Package Size",     align: "right", fmt: (v)=>bytesToGB(v) },
        { key: "usedDataWeeklyTotalBytes",label: "Used (Weekly Tot)",align: "right", fmt: (v)=>bytesToGB(v) },
      ],
    },
    {
      title: "Costs",
      cols: [
        { key: "subscriberCost",         label: "Subscriber Cost",     align: "right", fmt: (v)=>v===""?"":money(v) },
        { key: "resellerCost",           label: "Reseller Cost",       align: "right", fmt: (v)=>v===""?"":money(v) },
        { key: "resellerCostWeeklyTotal",label: "Reseller Cost (Weekly)", align: "right", fmt: money },
      ],
    },
  ];

  const flatCols = GROUPS.flatMap(g => g.cols);
  const gridTemplate = `repeat(${flatCols.length}, minmax(140px, 1fr))`;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>OCS Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={accountId}
            onChange={(e) => setAccountId(Number(e.target.value))}
            style={{ width: 160, padding: 8, borderRadius: 10, border: "1px solid #2a3356", background: "#0f1428", color: "#e9ecf1" }}
          />
          <button
            onClick={loadList}
            style={{ padding: "8px 14px", borderRadius: 10, border: 0, background: "#4b74ff", color: "#fff", fontWeight: 600 }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={loadReport}
            style={{ padding: "8px 14px", borderRadius: 10, border: 0, background: "#22c55e", color: "#0b1020", fontWeight: 700 }}
          >
            {loadingReport ? "Building…" : "Build Excel-like report"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "#3a2030", color: "#ffd4d4", whiteSpace: "pre-wrap" }}>
          <strong>API error:</strong> {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 16 }}>
        <div style={{ background: "#151a2e", padding: 16, borderRadius: 16 }}>
          <div style={{ opacity: 0.7 }}>Total Subscribers</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{kpis.total}</div>
        </div>
        <div style={{ background: "#151a2e", padding: 16, borderRadius: 16 }}>
          <div style={{ opacity: 0.7 }}>Active</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{kpis.active}</div>
        </div>
        <div style={{ background: "#151a2e", padding: 16, borderRadius: 16 }}>
          <div style={{ opacity: 0.7 }}>Inactive</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{kpis.inactive}</div>
        </div>
      </div>

      {/* Grouped table */}
      <div style={{ marginTop: 24, background: "#151a2e", borderRadius: 16, overflow: "auto" }}>
        <div style={{ minWidth: 1200 }}>
          {/* Header row 1: group labels */}
          <div
            style={{
              position: "sticky", top: 0, zIndex: 2, display: "grid",
              gridTemplateColumns: gridTemplate, background: "#12172a", borderBottom: "1px solid #2a3356", padding: "10px 12px", fontWeight: 700,
            }}
          >
            {GROUPS.map((g, i) => (
              <div
                key={i}
                style={{
                  gridColumn: `span ${g.cols.length}`,
                  textAlign: "left",
                  opacity: 0.85,
                }}
              >
                {g.title}
              </div>
            ))}
          </div>

          {/* Header row 2: column labels */}
          <div
            style={{
              position: "sticky", top: 38, zIndex: 2, display: "grid",
              gridTemplateColumns: gridTemplate, background: "#12172a", borderBottom: "1px solid #2a3356", padding: "10px 12px", fontWeight: 700,
            }}
          >
            {flatCols.map((c) => (
              <div key={c.key} style={{ whiteSpace: "nowrap" }}>{c.label}</div>
            ))}
          </div>

          {/* Data rows */}
          {rows.map((r, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                padding: "12px",
                borderBottom: "1px solid #2a3356",
                background: idx % 2 ? "#141a30" : "transparent",
              }}
            >
              {flatCols.map((c) => {
                const raw = r[c.key];
                const value = c.fmt ? c.fmt(raw) : s(raw);
                return (
                  <div
                    key={c.key}
                    title={s(raw)}
                    style={{
                      whiteSpace: "nowrap",
                      textAlign: c.align || "left",
                      fontFamily: c.mono ? "ui-monospace,SFMono-Regular,Menlo,Monaco" : undefined,
                    }}
                  >
                    {value}
                  </div>
                );
              })}
            </div>
          ))}

          {rows.length === 0 && !loadingReport && (
            <div style={{ padding: 16, opacity: 0.8 }}>
              Click <em>Build Excel-like report</em> to fetch packages & weekly usage.
            </div>
          )}
          {loadingReport && <div style={{ padding: 16 }}>Working…</div>}
        </div>
      </div>
    </div>
  );
}
