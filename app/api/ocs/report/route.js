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

function get(obj, path, dflt=null){
  try { return path.split(".").reduce((o,k)=> (o && k in o ? o[k] : null), obj) ?? dflt; }
  catch { return dflt; }
}

function buildWeeks(startStr, endStr){
  const start = new Date(startStr+"T00:00:00Z");
  const end = endStr ? new Date(endStr+"T00:00:00Z") : new Date();
  const weeks = [];
  let cur = start;
  while (cur <= end){
    const e = new Date(cur); e.setUTCDate(e.getUTCDate()+6);
    const ee = e > end ? end : e;
    weeks.push([cur.toISOString().slice(0,10), ee.toISOString().slice(0,10)]);
    const n = new Date(cur); n.setUTCDate(n.getUTCDate()+7); cur = n;
  }
  return weeks;
}

async function poolAll(items, limit, fn){
  const ret=[], running=new Set();
  for (const it of items){
    const p = Promise.resolve().then(()=>fn(it));
    ret.push(p); running.add(p);
    const done = ()=>running.delete(p);
    p.then(done).catch(done);
    if (running.size >= limit) await Promise.race(running);
  }
  return Promise.all(ret);
}

async function makeReport({ accountId, startDate, endDate }){
  const acct = Number(accountId)||3771;
  const start = startDate || "2025-06-01";
  const end   = endDate   || new Date().toISOString().slice(0,10);
  const weeks = buildWeeks(start, end);

  const list = await callOCS({ listSubscriber: { accountId: acct } });
  const subs = get(list, "listSubscriber.subscriberList", []);
  if (!Array.isArray(subs)) return { rows:[], columns:[], note:list };

  const rows=[];
  await poolAll(subs, 4, async (s)=>{
    const subId = s?.subscriberId;
    const iccid = Array.isArray(s?.imsiList) ? (s.imsiList[0]?.iccid || "") : "";

    // packages
    let pkgs=[];
    try {
      const r = await callOCS({ listSubscriberPrepaidPackages: { subscriberId: subId }});
      pkgs = get(r, "listSubscriberPrepaidPackages.packages", []);
    } catch {}

    // last usage by ICCID
    let lastUsageDate = "";
    if (iccid){
      try {
        const r = await callOCS({ getSingleSubscriber: { iccid }});
        lastUsageDate = get(r, "getSingleSubscriber.lastUsageDate", "") || "";
      } catch {}
    }

    // weekly usage & costs
    const weekly = {};
    for (const [ws,we] of weeks){
      const kU = `usedData_${ws}_to_${we}`;
      const kR = `resellerCost_${ws}_to_${we}`;
      const kS = `subscriberCost_${ws}_to_${we}`;
      try{
        const r = await callOCS({
          subscriberUsageOverPeriod: { subscriber:{ subscriberId: subId }, period:{ start: ws, end: we } }
        });
        const u = r?.subscriberUsageOverPeriod || {};
        const total = u?.total || {};
        const recs  = u?.usages || u?.usage || [];
        let used=0;
        if (Array.isArray(recs)){
          for (const x of recs){
            const v = x?.quantity ?? x?.usedDataByte ?? x?.useddatabyte ?? 0;
            used += (typeof v === "number") ? v : Number(v||0);
          }
        }
        weekly[kU] = used;
        weekly[kR] = total?.resellerCost ?? 0;
        weekly[kS] = total?.subscriberCost ?? 0;
      } catch {
        weekly[kU] = ""; weekly[kR] = ""; weekly[kS] = "";
      }
    }

    if (!Array.isArray(pkgs) || pkgs.length===0){
      rows.push({
        subscriberId: subId, iccid, lastUsageDate,
        subscriberPrepaidPackageId: "", prepaidPackageTemplateId: "", templateName: "",
        subscriberCost: "", resellerCost: "", usedDataByte: "", pckDataByte: "",
        activationDate: "", expiryDate: "", ...weekly
      });
    } else {
      for (const p of pkgs){
        const tpl = p?.packageTemplate || {};
        rows.push({
          subscriberId: subId, iccid, lastUsageDate,
          subscriberPrepaidPackageId: p?.subscriberprepaidpackageid ?? p?.subscriberPrepaidPackageId ?? "",
          prepaidPackageTemplateId: tpl?.prepaidpackagetemplateid ?? "",
          templateName: tpl?.prepaidpackagetemplatename ?? "",
          subscriberCost: p?.cost ?? "",
          resellerCost: p?.resellercost ?? p?.resellerCost ?? "",
          usedDataByte: p?.useddatabyte ?? "",
          pckDataByte: p?.pckdatabyte ?? "",
          activationDate: p?.tstartactivationutc ?? "",
          expiryDate: p?.tsexpirationutc ?? "",
          ...weekly
        });
      }
    }
  });

  const base = [
    "subscriberId","iccid","lastUsageDate",
    "subscriberPrepaidPackageId","prepaidPackageTemplateId","templateName",
    "subscriberCost","resellerCost","usedDataByte","pckDataByte",
    "activationDate","expiryDate"
  ];
  const keys = Array.from(rows.reduce((set,r)=>{ Object.keys(r).forEach(k=>set.add(k)); return set; }, new Set()));
  const weekly = keys.filter(k=>k.startsWith("usedData_")||k.startsWith("resellerCost_")||k.startsWith("subscriberCost_")).sort();
  const others = keys.filter(k=>!base.includes(k) && !weekly.includes(k));
  const columns = [...base, ...others, ...weekly];

  return { rows, columns, count: rows.length, weeks, accountId: acct };
}

// POST (normal path)
export async function POST(req){
  try {
    const body = await req.json().catch(()=> ({}));
    const data = await makeReport(body || {});
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET (fallback, so 405 never happens)
export async function GET(req){
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
