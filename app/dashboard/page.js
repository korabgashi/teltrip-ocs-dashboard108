"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Subscriber {
  subscriberId: string;
  iccid: string;
  lastUsage: string;
  templateName: string;
  tsactivationutc: string;
  tsexpirationutc: string;
  usedDataByte: number;
  pckDataByte: number;
  subscriberCost: number;
  resellerCost: number;
}

export default function DashboardPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [accountId, setAccountId] = useState("3771");
  const [totals, setTotals] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    totalProfit: 0,
  });

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/ocs-data?accountId=${accountId}`);
      const data = await res.json();

      const processed = data.map((s: Subscriber) => {
        const usedGB = (s.usedDataByte / (1024 ** 3)).toFixed(2);
        const totalGB = (s.pckDataByte / (1024 ** 3)).toFixed(2);

        const profit = s.subscriberCost - s.resellerCost;
        const margin =
          s.resellerCost > 0 ? ((profit / s.resellerCost) * 100).toFixed(1) : "0";

        return {
          ...s,
          usedGB,
          totalGB,
          profit: profit.toFixed(2),
          margin,
        };
      });

      const totalProfit = processed.reduce(
        (sum: number, s: any) => sum + parseFloat(s.profit),
        0
      );

      setSubscribers(processed);
      setTotals({
        total: processed.length,
        active: processed.filter(
          (s: any) => new Date(s.tsexpirationutc) > new Date()
        ).length,
        inactive: processed.filter(
          (s: any) => new Date(s.tsexpirationutc) <= new Date()
        ).length,
        totalProfit,
      });
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">OCS Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Subscribers</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{totals.total}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{totals.active}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inactive</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{totals.inactive}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Profit/Loss</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">
            ${totals.totalProfit.toFixed(2)}
          </CardContent>
        </Card>
      </div>

      <div className="flex space-x-2">
        <Input
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-40"
        />
        <Button onClick={fetchData}>Refresh</Button>
        <Button className="bg-green-600 hover:bg-green-700">
          Build Excel-like report
        </Button>
      </div>

      <Table>
        <TableCaption>Subscribers & Packages</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Subscriber ID</TableHead>
            <TableHead>ICCID</TableHead>
            <TableHead>Last Usage</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Activated</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Used (GB)</TableHead>
            <TableHead>Package Size (GB)</TableHead>
            <TableHead>Subscriber Cost ($)</TableHead>
            <TableHead>Reseller Cost ($)</TableHead>
            <TableHead>Profit/Loss ($)</TableHead>
            <TableHead>Margin (%)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscribers.map((s) => (
            <TableRow key={s.subscriberId}>
              <TableCell className="text-sm">{s.subscriberId}</TableCell>
              <TableCell className="text-xs">{s.iccid}</TableCell>
              <TableCell className="text-sm">{s.lastUsage}</TableCell>
              <TableCell className="text-sm">{s.templateName}</TableCell>
              <TableCell className="text-sm">{s.tsactivationutc}</TableCell>
              <TableCell className="text-sm">{s.tsexpirationutc}</TableCell>
              <TableCell className="text-sm">{s.usedGB} GB</TableCell>
              <TableCell className="text-sm">{s.totalGB} GB</TableCell>
              <TableCell className="text-sm">${s.subscriberCost}</TableCell>
              <TableCell className="text-sm">${s.resellerCost}</TableCell>
              <TableCell
                className={`text-sm font-semibold ${
                  parseFloat(s.profit) >= 0
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                ${s.profit}
              </TableCell>
              <TableCell
                className={`text-sm font-semibold ${
                  parseFloat(s.margin) >= 0
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                {s.margin}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
