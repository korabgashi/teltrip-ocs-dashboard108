
import { NextResponse } from "next/server";
const API_URL = "https://ocs-api.esimvault.cloud/v1?token=HgljQn4Uhe6Ny07qTzYqPLjJ";

async function callOCS(body) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return json;
}

function get(obj, path, dflt=null){
  try{
    return path.split('.').reduce((o,k)=> (o && (k in o)) ? o[k] : null, obj) ?? dflt;
  }catch{ return dflt; }
}

function buildWeeks(startStr, endStr){
  const start = new Date(startStr+"T00:00:00Z");
  const end = endStr ? new Date(endStr+"T00:00:00Z") : new Date();
  const weeks = [];
  let cur = start;
  while (cur <= end){
    const e = new Date(cur); e.setUTCDate(e.getUTCDate()+6);
    const ee = e > end ? end : e;
    const sISO = cur.toISOString().slice(0,10);
    const eISO = ee.toISOString().slice(0,10);
    weeks.push([sISO, eISO]);
    const n = new Date(cur); n.setUTCDate(n.getUTCDate()+7); cur = n;
  }
  return weeks;
}

async function poolAll(items, limit, fn){
  const ret = [];
  const executing = new Set();
  for (const item of items){
    const p = Promise.resolve().then(()=>fn(item));
    ret.push(p);
    executing.add(p);
    const clean = ()=>executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= limit){
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

export async function POST(req){
  try{
    const { accountId, startDate, endDate } = await req.json() || {};
    const acct = Number(accountId) || 3771;
    const start = startDate || "2025-06-01";
    const end = endDate || new Date().toISOString().slice(0,10);
    const weeks = buildWeeks(start, end);

    // 1) subscribers
    const listResp = await callOCS({ listSubscriber: { accountId: acct } });
    const subscribers = get(listResp, "listSubscriber.subscriberList", []);
    if (!Array.isArray(subscribers)) return NextResponse.json({ rows:[], columns:[], note:listResp });

    // 2) per-subscriber enrichment
    const rows = [];
    await poolAll(subscribers, 4, async (sub) => {
      const subId = sub?.subscriberId;
      const iccid = Array.isArray(sub?.imsiList) ? (sub.imsiList[0]?.iccid || "") : "";
      let packages = [];
      try{
        const pkgJson = await callOCS({ listSubscriberPrepaidPackages: { subscriberId: subId } });
        packages = get(pkgJson, "listSubscriberPrepaidPackages.packages", []);
      }catch{}

      let lastUsageDate = "";
      if (iccid){
        try{
          const lastJson = await callOCS({ getSingleSubscriber: { iccid } });
          lastUsageDate = get(lastJson, "getSingleSubscriber.lastUsageDate", "") || "";
        }catch{}
      }

      const weekly = {};
      for (const [ws, we] of weeks){
        const keyUsed = `usedData_${ws}_to_${we}`;
        const keyReseller = `resellerCost_${ws}_to_${we}`;
        const keySub = `subscriberCost_${ws}_to_${we}`;
        try{
          const usageJson = await callOCS({ subscriberUsageOverPeriod: { subscriber:{ subscriberId: subId }, period:{ start:ws, end:we }}});
          const u = usageJson?.subscriberUsageOverPeriod || {};
          const total = u?.total || {};
          const records = u?.usages || u?.usage || [];
          let used = 0;
          if (Array.isArray(records)){
            for (const r of records){
              const v = r?.quantity ?? r?.usedDataByte ?? r?.useddatabyte ?? 0;
              used += (typeof v === "number") ? v : Number(v||0);
            }
          }
          weekly[keyUsed] = used;
          weekly[keyReseller] = total?.resellerCost ?? 0;
          weekly[keySub] = total?.subscriberCost ?? 0;
        }catch(e){
          weekly[keyUsed] = "";
          weekly[keyReseller] = "";
          weekly[keySub] = "";
        }
      }

      if (!Array.isArray(packages) || packages.length===0){
        rows.push({
          subscriberId: subId,
          iccid,
          lastUsageDate,
          subscriberPrepaidPackageId: "",
          prepaidPackageTemplateId: "",
          templateName: "",
          subscriberCost: "",
          resellerCost: "",
          usedDataByte: "",
          pckDataByte: "",
          activationDate: "",
          expiryDate: "",
          ...weekly
        });
      } else {
        for (const pkg of packages){
          const tpl = pkg?.packageTemplate || {};
          rows.push({
            subscriberId: subId,
            iccid,
            lastUsageDate,
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
    const allKeys = Array.from(rows.reduce((set, r)=>{ Object.keys(r).forEach(k=>set.add(k)); return set; }, new Set()));
    const weeklyKeys = allKeys.filter(k=>k.startsWith("usedData_")||k.startsWith("resellerCost_")||k.startsWith("subscriberCost_")).sort();
    const otherKeys = allKeys.filter(k=>!baseOrder.includes(k) && !weeklyKeys.includes(k));
    const columns = [...baseOrder, ...otherKeys, ...weeklyKeys];

    return NextResponse.json({ rows, columns, count: rows.length, weeks, accountId: acct });
  }catch(e){
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
