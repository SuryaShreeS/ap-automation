"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { css } from "@/lib/css";

type U = { name: string; initials: string; avBg: string; role: string; limit: string; limitFg: string; limitW: string; assign: string };

export default function UserAdministration() {
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ rows: U[] }>("/admin/users") });
  const rows = data?.rows || [];
  const grid = "grid-template-columns: 1.2fr 130px 105px 1fr 90px;";

  return (
    <div style={css("padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;")}>
      <div style={css("background: #fff; border: 1px solid #DEE2EE; border-radius: 13px; overflow: hidden;")}>
        <div style={css(`display: grid; ${grid} gap: 12px; padding: 9px 18px; background: #F6F7FB; border-bottom: 1px solid #DEE2EE; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #4C5571;`)}>
          <span>User</span><span>Role</span><span style={css("text-align: right;")}>Limit</span><span>Vendor / company assignment</span><span>Status</span>
        </div>
        {rows.map((u, i) => (
          <div key={i} style={css(`display: grid; ${grid} gap: 12px; padding: 11px 18px; border-bottom: 1px solid #EDEFF6; align-items: center;`)}>
            <div style={css("display: flex; align-items: center; gap: 9px;")}>
              <div style={css(`width: 27px; height: 27px; border-radius: 999px; background: ${u.avBg}; color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Sora', sans-serif; font-size: 10px; font-weight: 700;`)}>{u.initials}</div>
              <span style={css("font-size: 12.5px; font-weight: 700;")}>{u.name}</span>
            </div>
            <span style={css("font-size: 11.5px; color: #4C5571;")}>{u.role}</span>
            <span style={css(`font-family: 'JetBrains Mono', monospace; font-size: 11.5px; text-align: right; color: ${u.limitFg}; font-weight: ${u.limitW};`)}>{u.limit}</span>
            <span style={css("font-size: 11px; color: #4C5571;")}>{u.assign}</span>
            <span style={css("font-size: 10px; font-weight: 700; color: #177C53; background: #EAF7F1; padding: 3px 9px; border-radius: 999px; text-align: center;")}>Active</span>
          </div>
        ))}
      </div>
    </div>
  );
}
