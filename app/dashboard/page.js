import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import teltripLogo from "./Asset4.png"; // <-- place your logo in the src/assets or public folder

export default function Dashboard() {
  const [subscribers, setSubscribers] = useState([]);
  const [accountId, setAccountId] = useState("3771");

  const fetchData = async () => {
    try {
      const response = await fetch("/api/ocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await response.json();

      // Convert bytes to GB and calculate profit/loss
      const formatted = data.map((item) => ({
        ...item,
        usedGB: (item.usedDataByte / (1024 ** 3)).toFixed(2) + " GB",
        packageGB: (item.pckDataByte / (1024 ** 3)).toFixed(2) + " GB",
        profitLoss: (parseFloat(item.subscriberCost) - parseFloat(item.resellerCost)).toFixed(2),
      }));

      setSubscribers(formatted);
    } catch (err) {
      console.error("Fetch failed:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalSubscribers = subscribers.length;
  const active = subscribers.filter((s) => new Date(s.expiryDate) > new Date()).length;
  const inactive = totalSubscribers - active;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6">
      {/* Logo */}
      <div className="flex justify-start mb-6">
        <img src={teltripLogo} alt="Teltrip Logo" className="h-12" />
      </div>

      {/* Header */}
      <h1 className="text-3xl font-bold mb-6">OCS Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-800 p-4 rounded-lg">
          <p>Total Subscribers</p>
          <h2 className="text-2xl font-bold">{totalSubscribers}</h2>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <p>Active</p>
          <h2 className="text-2xl font-bold">{active}</h2>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <p>Inactive</p>
          <h2 className="text-2xl font-bold">{inactive}</h2>
        </div>
      </div>

      {/* Input + Buttons */}
      <div className="flex gap-2 mb-6">
        <input
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="px-3 py-2 rounded bg-gray-700 text-white"
        />
        <Button onClick={fetchData} className="bg-blue-600">Refresh</Button>
        <Button className="bg-green-600">Build Excel-like report</Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table-auto w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-900 text-left">
              <th className="p-3">Subscriber ID</th>
              <th className="p-3">ICCID</th>
              <th className="p-3">Last Usage</th>
              <th className="p-3">Template Name</th>
              <th className="p-3">Activated</th>
              <th className="p-3">Expires</th>
              <th className="p-3">Used (GB)</th>
              <th className="p-3">Package Size</th>
              <th className="p-3">Subscriber Cost ($)</th>
              <th className="p-3">Reseller Cost ($)</th>
              <th className="p-3">Profit/Loss ($)</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s, idx) => (
              <tr key={idx} className="border-t border-gray-700">
                <td className="p-3">{s.subscriberId}</td>
                <td className="p-3 font-mono">{s.iccid}</td>
                <td className="p-3">{s.lastUsage || "-"}</td>
                <td className="p-3">{s.templateName}</td>
                <td className="p-3">{s.activationDate}</td>
                <td className="p-3">{s.expiryDate}</td>
                <td className="p-3">{s.usedGB}</td>
                <td className="p-3">{s.packageGB}</td>
                <td className="p-3">{s.subscriberCost}</td>
                <td className="p-3">{s.resellerCost}</td>
                <td className="p-3">{s.profitLoss}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
