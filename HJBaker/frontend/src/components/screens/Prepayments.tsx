"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

type Pp = {
  vendor: string; period: string; po: string; cadence: string; total: string; consumed: string;
  pct: string; barColor: string; pins: number; latest: string;
  alert: string | null; alertFg: string | null; alertBg: string | null;
};

/** Prepayment positions (FR-50–53) — embedded in the Prepayments processing queue. */
export default function Prepayments({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [period, setPeriod] = useState("Q3 2026");
  const [amount, setAmount] = useState("");
  const { data } = useQuery({ queryKey: ["prepayments"], queryFn: () => api.get<{ rows: Pp[] }>("/prepayments") });
  const rows = data?.rows || [];

  const register = async () => {
    try {
      const r = await api.post<{ message: string }>("/prepayments/register", {
        vendor, period, amount: parseFloat(amount.replace(/[$,]/g, "")) || 0,
      });
      toast(r.message);
      setFormOpen(false);
      setVendor(""); setAmount("");
      qc.invalidateQueries({ queryKey: ["prepayments"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <div style={css(`${embedded ? "" : "padding: 18px 22px;"} display: flex; flex-direction: column; gap: 12px;`)}>
      <div style={css("display: flex; align-items: center;")}>
        <div style={css("font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; flex: 1;")}>Prepayment positions</div>
        <Box onClick={() => setFormOpen(!formOpen)} style="font-size: 12px; font-weight: 700; color: #fff; background: #2E3391; padding: 7px 15px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #262A78">{formOpen ? "Close" : "Register prepayment"}</Box>
      </div>

      {formOpen && (
        <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; padding: 14px 18px; display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;")}>
          <div style={css("flex: 1.4; min-width: 180px;")}>
            <div style={css("font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #5B6788; margin-bottom: 4px;")}>Vendor</div>
            <Box as="input" value={vendor} onChange={(e: any) => setVendor(e.target.value)} placeholder="e.g. Koch Sulfur Products" style="width: 100%; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 10px; outline: none;" focusStyle="border-color: #2E3391" />
          </div>
          <div style={css("flex: 1; min-width: 120px;")}>
            <div style={css("font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #5B6788; margin-bottom: 4px;")}>Period</div>
            <Box as="input" value={period} onChange={(e: any) => setPeriod(e.target.value)} style="width: 100%; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 10px; outline: none;" focusStyle="border-color: #2E3391" />
          </div>
          <div style={css("flex: 1; min-width: 130px;")}>
            <div style={css("font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #5B6788; margin-bottom: 4px;")}>Agreed amount</div>
            <Box as="input" value={amount} onChange={(e: any) => setAmount(e.target.value)} placeholder="e.g. 250000" style="width: 100%; font-size: 12px; font-family: 'JetBrains Mono', monospace; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 10px; outline: none;" focusStyle="border-color: #2E3391" />
          </div>
          <Box onClick={register} style="font-size: 12px; font-weight: 700; color: #fff; background: #198459; padding: 8px 18px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #17805A">Register (FR-50)</Box>
        </div>
      )}
      {rows.map((pp, i) => (
        <div key={i} style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px;")}>
          <div style={css("display: flex; align-items: center; gap: 10px;")}>
            <span style={css("font-size: 13.5px; font-weight: 800; font-family: 'Sora', sans-serif;")}>{pp.vendor}</span>
            <span style={css("font-size: 11px; color: #4C5571;")}>{pp.period} · PO <span style={css("font-family: 'JetBrains Mono', monospace; color: #2E3391;")}>{pp.po}</span> · {pp.cadence}</span>
            <div style={css("flex: 1;")} />
            {pp.alert && <span style={css(`font-size: 10px; font-weight: 700; color: ${pp.alertFg}; background: ${pp.alertBg}; padding: 3px 9px; border-radius: 999px;`)}>{pp.alert}</span>}
          </div>
          <div style={css("display: flex; align-items: center; gap: 14px;")}>
            <div style={css("flex: 1; height: 9px; background: #EDEFF6; border-radius: 999px; overflow: hidden;")}>
              <div style={css(`height: 100%; width: ${pp.pct}; background: ${pp.barColor}; border-radius: 999px; transition: width 420ms cubic-bezier(0.16,1,0.3,1);`)} />
            </div>
            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; white-space: nowrap;")}>{pp.consumed} / {pp.total}</span>
          </div>
          <div style={css("font-size: 11px; color: #4C5571;")}>{pp.pins} PINs auto-associated · latest {pp.latest}</div>
        </div>
      ))}
    </div>
  );
}
