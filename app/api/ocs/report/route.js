"use client";
import { useEffect, useMemo, useState } from "react";

/* ---------------- utils ---------------- */
async function postJSON(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(json?.error || text || `HTTP ${res.status}`);
  return json;
}
const s = (v) => (v === null || v === undefined ? "" : String(v));
const n = (v) => (typeof v === "number" ? v : Number(v || 0));

/* bytes -> GB with 2 decimals */
function bytesToGB(val) {
  const num = n(val);
  if (!isFinite(num) || num === 0) return "0 GB";
  return (num / (1024 ** 3)).toFixed(2) + " GB";
}

/* smart cell formatter by column name */
function formatCell(col, val) {
  if (col.toLowerCase().includes("useddata")) return bytesToGB(val);
  if (col.toLowerCase().includes("byte")) return bytesToGB(val);
  if (col.toLowerCase().includes("cost"))
    return isFinite(n(val)) ? n(val).toFixed(2) : s(val);
  return s(val);
}

/* ---------------- page ---------------- */
export default function Dashboard() {
  const [accountId, setAccountId] = useState(3771);
  const [listData, setListData] = useState([]);
  const [report, setReport] = useState({ rows: [], columns: [] });
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");

  // Quick list for KPIs
  const loadList = async () => {
    setLoading(true);
    setError("");
    try {
      const json = await postJSON("/api/ocs/list-subscribers", { accountId });
      const list = json?.listSubscriber?.subscriberList;
      setListData(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e));
      setListData([]);
    } finally {
      setLoading(false);
    }
  };

  // Full excel-like report
  const loadReport = async () => {
    setLoadingReport(true);
    setError("");
    try {
      const json = await postJSON("/api/ocs/report", {
        accountId,
        startDate: "2025-06-01",
      });

      const incomingCols = json.columns || [];
      const rows = Array.isArray(json.rows) ? json.rows : [];

      // Identify weekly columns
      const weeklyResCols = incomingCols.filter((c) =>
        c.startsWith("resellerCost_")
      );
      const weeklySubCols = incomingCols.filter((c) =>
        c.startsWith("subscriberCost_")
      );
      const weeklyUsedCols = incomingCols.filter((c) =>
        c.startsWith("usedData_")
      );

      // Derive totals and convert bytes to GB later in formatter
      const enhancedRows = rows.map((r) => {
        const resellerTotal = weeklyResCols.reduce(
          (acc, k) => acc + n(r[k]),
          0
        );
        const subscriberTotal = weeklySubCols.reduce(
          (acc, k) => acc + n(r[k]),
          0
        );
        const usedBytesTotal = weeklyUsedCols.reduce(
          (acc, k) => acc + n(r[k]),
          0
        );

        return {
          ...r,
          _resellerCostTotal: resellerTotal,
          _subscriberCostTotal: subscriberTotal,
          _usedDataTotalBytes: usedBytesTotal,
        };
      });

      // Base columns you care about (tweak order freely)
      const base = [
        "subscriberId",
        "iccid",
        "templateName",
        "activationDate",
        "expiryDate",
        "subscriberCost",
        "resellerCost",
        "usedDataByte",
        "_subscriberCostTotal",
        "_resellerCostTotal",
        "_usedDataTotalBytes",
      ];

      // Keep any other non-weekly columns that might appear
      const nonWeeklyExtra = incomingCols.filter(
        (c) =>
          !base.includes(c) &&
          !weeklyResCols.includes(c) &&
          !weeklySubCols.includes(c) &&
          !weeklyUsedCols.includes(c)
      );

      // Final columns: weekly columns are *not* shown; totals are shown instead
      const finalColumns = [
        ...base,
        ...nonWeeklyExtra.filter((c) => !c.startsWith("_")),
      ];

      setReport({ rows: enhancedRows, columns: finalColumns });
    } catch (e) {
      setError(String(e));
      setReport({ rows: [], columns: [] });
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const kpis = useMemo(() => {
    const total = listData.length;
    const active = listData.filter(
      (r) =>
        Array.isArray(r?.status) &&
        r.status.some((x) => String(x?.status).toUpperCase() === "ACTIVE")
    ).length;
    return { total, active, inactive: total - active };
  }, [listData]);

  return (
    <div>
      {/* Header / Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>OCS Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={accountId}
            onChange={(e) => setAccountId(Number(e.target.value))}
            style={{
              width: 160,
              padding: 8,
              borderRadius: 10,
              border: "1px solid #2a3356",
              background: "#0f1428",
              color: "#e9ecf1",
            }}
          />
          <button
            onClick={loadList}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: 0,
              background: "#4b74ff",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={loadReport}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: 0,
              background: "#22c55e",
              color: "#0b1020",
              fontWeight: 700,
            }}
          >
            {loadingReport ? "Building…" : "Build Excel-like report"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "#3a2030",
            color: "#ffd4d4",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>API error:</strong> {error}
        </div>
      )}

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 16,
          marginTop: 16,
        }}
      >
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

      {/* Big table */}
      <div
        style={{
          marginTop: 24,
          background: "#151a2e",
          borderRadius: 16,
          overflow: "auto",
        }}
      >
        <div style={{ minWidth: 1200 }}>
          {/* Sticky header */}
          {report.columns.length > 0 && (
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                display: "grid",
                gridTemplateColumns: `repeat(${report.columns.length}, minmax(140px, 1fr))`,
                padding: 12,
                borderBottom: "1px solid #2a3356",
                fontWeight: 700,
                background: "#12172a",
              }}
            >
              {report.columns.map((c) => (
                <div key={c} style={{ whiteSpace: "nowrap" }}>
                  {c
                    .replace(/^_/, "")
                    .replace(/([A-Z])/g, " $1")
                    .replace(/_/g, " ")
                    .trim()}
                </div>
              ))}
            </div>
          )}

          {/* Rows */}
          {report.rows.map((row, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${report.columns.length}, minmax(140px, 1fr))`,
                padding: 12,
                borderBottom: "1px solid #2a3356",
                background: idx % 2 ? "#141a30" : "transparent",
              }}
            >
              {report.columns.map((c) => (
                <div
                  key={c}
                  style={{
                    whiteSpace: "nowrap",
                    fontFamily: c.toLowerCase().includes("iccid")
                      ? "ui-monospace,SFMono-Regular,Menlo,Monaco"
                      : undefined,
                    textAlign:
                      c.toLowerCase().includes("cost") ||
                      c.toLowerCase().includes("byte")
                        ? "right"
                        : "left",
                  }}
                  title={s(row?.[c])}
                >
                  {c === "_usedDataTotalBytes"
                    ? bytesToGB(row?.[c])
                    : formatCell(c, row?.[c])}
                </div>
              ))}
            </div>
          ))}

          {report.rows.length === 0 && !loadingReport && (
            <div style={{ padding: 16, opacity: 0.8 }}>
              Click <em>Build Excel-like report</em> to fetch packages & weekly
              usage.
            </div>
          )}
          {loadingReport && <div style={{ padding: 16 }}>Working…</div>}
        </div>
      </div>
    </div>
  );
}
