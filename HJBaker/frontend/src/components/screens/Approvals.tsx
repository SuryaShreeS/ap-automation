"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "../Box";
import { api } from "@/lib/api";
import { css } from "@/lib/css";
import { useApp } from "@/lib/state";

type ApRow = {
  inv: string; vendor: string; co: string; amount: string; type: string; route: string;
  overLimit: boolean; decided: boolean; state: string | null; decidedMsg: string;
  approveLabel: string; comment: string; queue: string;
};

/** Approval cards — rendered inside a processing queue's "Awaiting Approval"
 * sub-queue (FR-40–43). `queue` scopes the list to that queue's documents. */
export default function ApprovalCards({ queue }: { queue: string }) {
  const { set, toast } = useApp();
  const qc = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [emailApproved, setEmailApproved] = useState(false);
  const { data } = useQuery({ queryKey: ["approvals"], queryFn: () => api.get<{ rows: ApRow[] }>("/approvals") });
  const rows = (data?.rows || []).filter((r) => r.queue === queue);

  const act = async (inv: string, action: "approve" | "reject") => {
    try {
      const r = await api.post<{ flowSummary?: string[] }>(`/approvals/${encodeURIComponent(inv)}/action`, { action, comment: comments[inv] || "" });
      // The engine auto-continues after approval — show what it did and refresh
      // every surface it may have touched (statuses, PINs, prepayments, queues…).
      for (const key of ["approvals", "flow", "detail", "ap-review", "prepayments", "credits",
                         "overview-matrix", "overview", "home", "audit", "queues-v2", "inflow", "search", "nav"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      (r.flowSummary || []).forEach((m) => toast("⚙ " + m));
    } catch (e: any) {
      toast(e.message);
    }
  };
  const emailApprove = async () => {
    const r = await api.post<{ message: string }>("/approvals/email-action");
    setEmailApproved(true);
    toast(r.message);
    qc.invalidateQueries({ queryKey: ["approvals"] });
  };

  return (
    <div style={css("display: flex; flex-direction: column; gap: 12px;")}>
      <div style={css("font-size: 12.5px; color: #4C5571;")}>
        Signed in as <strong style={css("color: #14163C;")}>Karl Weber</strong> · approval limit <span style={css("font-family: 'JetBrains Mono', monospace; color: #2E3391; font-weight: 600;")}>$50,000</span> · over-limit escalates to Amara Gill (CFO) · admins fixed at $0 (FR-42)
      </div>

      {rows.length === 0 && (
        <div style={css("background: #fff; border: 1px dashed #DEE2EE; border-radius: 13px; padding: 18px; text-align: center; font-size: 12px; color: #5B6788;")}>
          Nothing awaiting approval in this queue.
        </div>
      )}
      {rows.map((ap) => (
        <div key={ap.inv} style={css(`background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; padding: 15px 20px; display: flex; flex-direction: column; gap: 10px; opacity: ${ap.decided ? "0.6" : "1"};`)}>
          <div style={css("display: flex; align-items: center; gap: 10px;")}>
            <Box onClick={() => set({ screen: "detail", detailId: ap.inv, detailTab: "lines" })} style="font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; color: #2E3391; cursor: pointer;" hoverStyle="text-decoration: underline">{ap.inv}</Box>
            <span style={css("font-size: 13px; font-weight: 700;")}>{ap.vendor}</span>
            <span style={css("font-size: 10.5px; color: #4C5571;")}>Co. {ap.co} · {ap.type}</span>
            <div style={css("flex: 1;")} />
            <span style={css("font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 800;")}>{ap.amount}</span>
          </div>
          <div style={css("display: flex; align-items: center; gap: 8px; font-size: 11px; color: #4C5571;")}>
            <span>Route: {ap.route}</span>
            {ap.overLimit && <span style={css("font-weight: 700; color: #B23413; background: #FDEDE7; padding: 2px 8px; border-radius: 999px;")}>Over your limit → escalates</span>}
          </div>
          {ap.decided ? (
            <div style={css(`font-size: 12px; font-weight: 700; color: ${ap.state === "approved" ? "#177C53" : "#B23413"};`)}>{ap.decidedMsg}</div>
          ) : (
            <div style={css("display: flex; gap: 8px; align-items: center;")}>
              <Box as="input" value={comments[ap.inv] || ""} onChange={(e: any) => setComments({ ...comments, [ap.inv]: e.target.value })} placeholder="Comment (required on reject)" style="flex: 1; font-size: 12px; border: 1px solid #DEE2EE; border-radius: 8px; padding: 7px 11px; outline: none;" focusStyle="border-color: #2E3391" />
              <Box onClick={() => act(ap.inv, "approve")} style="font-size: 12px; font-weight: 700; color: #fff; background: #198459; padding: 7px 16px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #17805A">{ap.approveLabel}</Box>
              <Box onClick={() => act(ap.inv, "reject")} style="font-size: 12px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 7px 16px; border-radius: 8px; cursor: pointer;" hoverStyle="background: #FBD8CC">Reject</Box>
            </div>
          )}
        </div>
      ))}

      {queue === "PO" && (
        <div style={css("margin-top: 6px;")}>
          <div style={css("font-family: 'Sora', sans-serif; font-size: 12.5px; font-weight: 700; color: #4C5571; margin-bottom: 8px;")}>FR-43 · Secure one-click actions from email (traveling approvers) — approver list is admin-maintained</div>
          <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden; max-width: 540px; box-shadow: 0 8px 24px rgba(20,22,60,0.09);")}>
            <div style={css("padding: 10px 16px; border-bottom: 1px solid #EDEFF6; font-size: 11.5px; color: #4C5571;")}>
              <div><strong style={css("color: #14163C;")}>From:</strong> ap-platform@alferix.com</div>
              <div><strong style={css("color: #14163C;")}>Subject:</strong> Approval needed · INV-88412 · Phillips 66 · $18,240.00</div>
            </div>
            <div style={css("padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;")}>
              <div style={css("font-size: 12.5px; line-height: 1.55; color: #353D57;")}>Invoice <span style={css("font-family: 'JetBrains Mono', monospace; color: #2E3391;")}>INV-88412</span> from <strong>Phillips 66</strong> (Co. 405) awaits your approval. Auto-matched 3-way to PO <span style={css("font-family: 'JetBrains Mono', monospace;")}>P26-1162</span>.</div>
              <div style={css("display: flex; gap: 8px;")}>
                <div onClick={emailApprove} style={css(`font-size: 12px; font-weight: 700; color: #fff; background: ${emailApproved ? "#17805A" : "#198459"}; padding: 8px 18px; border-radius: 8px; cursor: pointer;`)}>{emailApproved ? "✓ Approved" : "Approve"}</div>
                <div style={css("font-size: 12px; font-weight: 700; color: #B23413; background: #FDEDE7; padding: 8px 18px; border-radius: 8px; cursor: pointer;")}>Reject</div>
                <div style={css("font-size: 12px; font-weight: 700; color: #2E3391; padding: 8px 10px; cursor: pointer;")}>Open in platform ›</div>
              </div>
              <div style={css("font-size: 10px; color: #5B6788;")}>Signed token · expires in 72h · every action logged (NFR-3, FR-46)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
