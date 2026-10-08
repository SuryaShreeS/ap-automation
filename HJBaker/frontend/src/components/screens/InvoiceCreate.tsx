"use client";

import { useState } from "react";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

const MONO = "'JetBrains Mono', monospace";
const SANS = "'Manrope', sans-serif";

type Field = { label: string; ph?: string; span?: number; mono?: boolean; bind?: string };

const GROUPS: { title: string; fields: Field[] }[] = [
  { title: "Identification", fields: [
    { label: "Company", ph: "e.g. 405 · Alferix Sulphur", bind: "company" },
    { label: "Sales Channel", ph: "LIQUID / ACID / SOLIDS", mono: true },
    { label: "Route Type", ph: "ADHOC or HIERARCHY", mono: true },
  ]},
  { title: "Vendor · resolved live from Sage", fields: [
    { label: "Vendor Code", ph: "BP-…", mono: true },
    { label: "Vendor Name", ph: "search Sage BP…", span: 2, bind: "vendorName" },
    { label: "Vendor Address ID", ph: "MAIN", mono: true },
    { label: "Vendor Location Code", mono: true },
    { label: "Vendor Pay Method", ph: "ACH / CHK / WIRE", mono: true },
  ]},
  { title: "Invoice", fields: [
    { label: "Invoice Number", mono: true, bind: "invoiceNumber" },
    { label: "Invoice Date", ph: "mm/dd/yy", mono: true },
    { label: "Term Days", mono: true },
    { label: "Due Date", ph: "mm/dd/yy", mono: true },
    { label: "PO Number", ph: "blank → attach at PO-decision gate", mono: true },
    { label: "Currency", ph: "USD / CAD", mono: true },
  ]},
  { title: "Totals · net + taxes + freight must equal gross", fields: [
    { label: "Net Total", ph: "0.00", mono: true, bind: "net" },
    { label: "GST Tax", ph: "0.00", mono: true }, { label: "HST Tax", ph: "0.00", mono: true },
    { label: "PST Tax", ph: "0.00", mono: true }, { label: "USA Tax", ph: "0.00", mono: true },
    { label: "VAT Tax", ph: "0.00", mono: true }, { label: "Freight Total", ph: "0.00", mono: true },
    { label: "Gross Total", ph: "0.00", mono: true, bind: "gross" },
  ]},
  { title: "Transport", fields: [
    { label: "Vehicle ID", ph: "letters+numbers = rail", mono: true },
    { label: "BOL Number", ph: "numeric = truck", mono: true },
  ]},
];

export default function InvoiceCreate() {
  const { set, toast } = useApp();
  const [form, setForm] = useState<Record<string, string>>({});

  const save = async () => {
    try {
      const r = await api.post<{ message: string }>("/invoices", {
        vendorName: form.vendorName || "New Vendor",
        invoiceNumber: form.invoiceNumber || "INV-NEW",
        company: form.company?.split(" ")[0] || "100",
        net: parseFloat(form.net || "0") || 0,
        gross: parseFloat(form.gross || form.net || "0") || 0,
      });
      toast(r.message);
      set({ screen: "home" });
    } catch (e: any) {
      toast("Duplicate detected — " + e.message);
    }
  };

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 12px; max-width: 1100px;")}>
      <Box style="border: 2px dashed #C3CADD; background: #fff; border-radius: 12px; padding: 22px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;" hoverStyle="border-color: #2E3391">
        <span style={css("font-size: 18px; color: #2E3391;")}>⤒</span>
        <span style={css("font-size: 12.5px; font-weight: 700; color: #2E3391;")}>Drop the PDF here or click to attach</span>
        <span style={css("font-size: 11px; color: #5B6788;")}>multi-page up to ~100 pages (FR-10)</span>
      </Box>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 14px; padding: 4px 0 14px;")}>
        {GROUPS.map((g, gi) => (
          <div key={gi} style={css("padding: 13px 18px 3px;")}>
            <div style={css("font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #5B6788; margin-bottom: 7px;")}>{g.title}</div>
            <div style={css("display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;")}>
              {g.fields.map((f, fi) => (
                <div key={fi} style={css(`grid-column: span ${f.span || 1}; border: 1px solid #DEE2EE; background: #fff; border-radius: 9px; padding: 6px 10px;`)}>
                  <div style={css("font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5571; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;")}>{f.label}</div>
                  <input
                    placeholder={f.ph || ""}
                    value={f.bind ? form[f.bind] || "" : undefined}
                    onChange={f.bind ? (e) => setForm({ ...form, [f.bind!]: e.target.value }) : undefined}
                    style={css(`width: 100%; border: none; outline: none; background: transparent; font-family: ${f.mono ? MONO : SANS}; font-size: 12px; font-weight: 600; color: #14163C; padding: 0; margin-top: 1px;`)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={css("display: flex; gap: 10px; justify-content: flex-end;")}>
        <Box onClick={() => set({ screen: "home" })} style="font-size: 12.5px; font-weight: 700; color: #4C5571; border: 1px solid #DEE2EE; padding: 8px 18px; border-radius: 9px; cursor: pointer;" hoverStyle="background: #F6F7FB">Cancel</Box>
        <Box onClick={save} style="font-size: 12.5px; font-weight: 700; color: #fff; background: #2E3391; padding: 8px 22px; border-radius: 9px; cursor: pointer;" hoverStyle="background: #262A78">Save Record</Box>
      </div>
    </div>
  );
}
