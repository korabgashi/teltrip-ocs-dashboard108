"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import teltripLogo from "./Asset4.png"; // put Asset4.png in app/dashboard/ or public/

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fake-data"); // replace with your API route
      const json = await res.json();

      const rows = json.map((r) => {
        const n = (v) => (v ? Number(v) : 0);

        // weekly reseller cost
        const weeklyCols = Object.keys(r).filter((k) =>
          k.toLowerCase().includes("resellercost")
        );
        const resellerWeeklyTotal = weeklyCols.reduce(
          (acc, k) => acc + n(r[k]),
          0
        );

        const subscriberCost = n(r.subscriberCost);
        const profit = subscriberCost - resellerWeeklyTotal;
        const margin =
          subscriberCost > 0 ? (profit / subscriberCost) * 100 : 0;

        return {
          subscriberId: r.subscriberId,
          iccid: r.iccid,
          templateName: r.templateName,
          activationDate: r.activationDate,
          expiryDate: r.expiryDate,
          subscriberCost,
          resellerCostWeeklyTotal: resellerWeeklyTotal,
          profit,
          margin,
        };
      });

      setData(rows);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const money = (v) => v.toFixed(2);

  return (
    <div className="p-6 text-white bg-[#0a0d1a] min-h-screen">
      {/* Logo */}
      <div className="flex items-center mb-6">
        <Image src={teltripLogo} alt="Teltrip Logo" width={160} height={60} />
        <h1 className="text-2xl font-bold ml-4">Dashboard</h1>
      </div>

      <div className="flex justify-between items-center mb-4">
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg shadow-lg border border-gray-700">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-800 text-gray-200 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Subscriber ID</th>
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Activated</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3 text-right">Subscriber Cost</th>
              <th className="px-4 py-3 text-right">
                Reseller Cost (Weekly)
              </th>
              <th className="px-4 py-3 text-right">Profit/Loss ($)</th>
              <th className="px-4 py-3 text-right">Margin (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-800/40">
                <td className="px-4 py-3">{row.subscriberId}</td>
                <td className="px-4 py-3">{row.iccid}</td>
                <td className="px-4 py-3">{row.templateName}</td>
                <td className="px-4 py-3">{row.activationDate}</td>
                <td className="px-4 py-3">{row.expiryDate}</td>
                <td className="px-4 py-3 text-right">
                  ${money(row.subscriberCost)}
                </td>
                <td className="px-4 py-3 text-right">
                  ${money(row.resellerCostWeeklyTotal)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    row.profit < 0 ? "text-red-500" : "text-green-400"
                  }`}
                >
                  ${money(row.profit)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    row.margin < 0 ? "text-red-500" : "text-green-400"
                  }`}
                >
                  {money(row.margin)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
