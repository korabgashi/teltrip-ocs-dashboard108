import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = "https://ocs-api.esimvault.cloud/v1?token=HgljQn4Uhe6Ny07qTzYqPLjJ";

async function callOCS(body) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return json;
}

function get(obj, path, dflt = null) {
  try { return path.split(".").reduce((o, k) => (o && k in o ? o[k] : null), obj) ?? dflt; }
  catch { return dflt; }
}

function buildWeeks(startStr, endStr) {
  const start = new Date(startStr + "T00:00:00Z");
  const end = endStr ? new Date(endStr + "T00:00:00Z") : new Date();
  const weeks = [];
  let cur = start;
  while (cur <= end) {
    const e = new Date(cur); e.setUTCDate(e.getUTCDate() + 6);
    const ee = e > end ? end : e;
    weeks.push([cur.toISOString().slice(0, 10), ee.toISOString().slice(0, 10)]);
    const n = new Date(cur); n.setUTCDate(n.getUTCDate() + 7); cur = n;
  }
  return weeks;
}

async function poolAll(items, limit, fn) {
  const ret = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    ret.push(p); executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(ret);
}

async function makeReport({ accountId, startDate, endDate }) {
  const acct = Number(accountId) || 3771;
  const start = startDate || "2025-06-01";
  const end = endDate || new Date().toISOString().slice(0, 10);
  const weeks = buildWeeks(start, end);

  // 1) list subscribers
  const listResp = await callOCS({ listSubscriber: { accountId: acct } });
  const subscribers = get(listResp, "listSubscriber.subscriberList", []);
  if (!Array.isArray(subscribers)) return { rows: [], columns: [], note: listResp };

  // 2) enrich
  const rows = [];
  await poolAll(subscribers, 4, async (sub) => {
    const subId = sub?.subscriberId;
    const iccid = Array.isArray(sub?.imsiList) ? (sub.imsiList[0]?.iccid || "") : "";

    let packages = [];
    try {
      const pkgJson = await callOCS({ listSubscriberPrepaidPackages: { subscriberId: subId } });
      packages = get(pkgJson, "listSubscriberPrepaidPackages.packages", []);
    } catch {}

    let lastUsageDate = "";
    if (iccid) {
      try {
        const lastJson = await callOCS({ getSingleSubscriber: { iccid } });
        lastUsageDate = get(lastJson, "getSingleSubscriber.lastUsageDate", "") || "";
      } catch {}
    }

    const weekly = {};
    for (const [ws, we] of weeks) {
      const kU = `usedData_${ws}_to_${we}`;
      const kR = `resellerCost_${ws}_to_${we}`;
      const kS = `subscriberCost_${ws}_to_${we}`;
      try {
        const uJson = await callOCS({
          subscriberUsageOverPeriod: { subscriber: { subscriberId: subId }, period: { start: ws, end: we } }
        });
        const u = uJson?.subscriberUsageOverPeriod || {};
        const total = u?.total || {};
        const records = u?.usages || u?.usage || [];
        let used = 0;
        if (Array.isArray(records)) {
          for (const r of records) {
            const v = r?.quantity ?? r?.usedDataByte ?? r?.useddatabyte ?? 0;
            used += typeof v === "number" ? v : Number(v || 0);
          }
        }
        weekly[kU] = used;
        weekly[kR] = total?.resellerCost ?? 0;
        weekly[kS] = total?.subscriberCost ?? 0;
      } catch {
        weekly[kU] = ""; weekly[kR] = ""; weekly[kS] = "";
      }
    }

    if (!Array.isArray(packages) || packages.length === 0) {
      rows.push({
        subscriberId: subId, iccid, lastUsageDate,
        subscriberPrepaidPackageId: "", prepaidPackageTemplateId: "", templateName: "",
        subscriberCost: "", resellerCost: "", usedDataByte: "", pckDataByte: "",
        activationDate: "", expiryDate: "", ...weekly
      });
    } else {
      for (const pkg of packages) {
        const tpl = pkg?.packageTemplate || {};
        rows.push({
          subscriberId: subId, iccid, lastUsageDate,
          subscriberPrepaidPackageId: pkg?.subscriberprepaidpackageid ?? pkg?.subscriberPrepaidPackageId ?? "",
          prepaidPackageTemplateId: tpl?.prepaidpackagetemplateid ?? "",
          templateName: tpl?.prepaidpackagetemplatename ?? "",
          subscriberCost: pkg?.cost ?? "",
          resellerCost: pkg?.resellercost ?? pkg?.resellerCost ?? "",
          usedDataByte: pkg?.useddatabyte ?? "",
          pckDataByte: pkg?.pckdatabyte ?? "",
          activationDate: pkg?.tstartactivationutc ?? "",
          expiryDate: pkg?.tsexpirationutc ?? "",
          ...weekly
        });
      }
    }
  });

  const baseOrder = [
    "subscriberId","iccid","lastUsageDate",
    "subscriberPrepaidPackageId","prepaidPackageTemplateId","templateName",
    "subscriberCost","resellerCost","usedDataByte","pckDataByte",
    "activationDate","expiryDate"
  ];
  const allKeys = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set()));
  const weeklyKeys = allKeys.filter(k => k.startsWith("usedData_") || k.startsWith("resellerCost_") || k.startsWith("subscriberCost_")).sort();
  const otherKeys  = allKeys.filter(k => !baseOrder.includes(k) && !weeklyKeys.includes(k));
  const columns = [...baseOrder, ...otherKeys, ...weeklyKeys];

  return { rows, columns, count: rows.length, weeks, accountId: acct };
}

// POST handler
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await makeReport(body || {});
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET handler (fallback)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") || "3771";
  const startDate = searchParams.get("startDate") || "2025-06-01";
  const endDate   = searchParams.get("endDate")   || "";
  try {
    const data = await makeReport({ accountId, startDate, endDate });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
