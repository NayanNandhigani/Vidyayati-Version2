"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "./sidebar-config";
import { IconSchool, IconLogOut, IconLock } from "./icons";

type Props = {
  role: "SCHOOL_ADMIN" | "STAFF" | "PARENT";
  visibleModules: Set<string> | null; // null = no per-staff module gating (Admin sees everything)
  disabledSchoolModules: Set<string>; // school-wide off switch — hides the item for every role, Admin included
  schoolName: string;
  userName: string;
  onSignOut: () => void;
};

export default function Sidebar({ role, visibleModules, disabledSchoolModules, schoolName, userName, onSignOut }: Props) {
  const pathname = usePathname();
  // Small screens: the sidebar is a slide-in menu (see .app-sidebar in
  // globals.css). It closes whenever the page changes.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
    <div className="app-topbar print-hide">
      <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer", padding: 4 }}>
        ☰
      </button>
      <div className="disp" style={{ fontSize: 15 }}>
        Vidya Yati
      </div>
      <div style={{ fontSize: 11, color: "#aeb8d6", marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "45vw" }}>{schoolName}</div>
    </div>
    <div className={`app-backdrop${open ? " is-open" : ""}`} onClick={() => setOpen(false)} />
    <aside
      className={`print-hide app-sidebar${open ? " is-open" : ""}`}
      style={{
        width: 236,
        flex: "none",
        background: "var(--sidebar)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        position: "sticky",
        top: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "20px 16px 14px" }}>
        <IconSchool style={{ width: 20, height: 20, color: "var(--marigold)" }} />
        <div>
          <div className="disp" style={{ fontSize: 15.5, lineHeight: 1.1 }}>
            Vidya Yati
          </div>
          <div style={{ fontSize: 10.5, color: "#7f8bb0", marginTop: 2 }}>{schoolName}</div>
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => {
            if (item.roles && !item.roles.includes(role)) return false;
            if (item.module && disabledSchoolModules.has(item.module)) return false;
            if (role === "STAFF" && item.module && visibleModules && !visibleModules.has(item.module)) return false;
            return true;
          });
          if (items.length === 0) return null;

          return (
            <div key={group.label}>
              <div className="navgroup">{group.label}</div>
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`navitem${active ? " active" : ""}`} style={{ margin: "0 8px" }}>
                    <Icon className="icon" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "var(--marigold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flex: "none",
          }}
        >
          {userName
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName}</div>
          <div style={{ fontSize: 10.5, color: "#7f8bb0", textTransform: "capitalize" }}>{role.replace("_", " ").toLowerCase()}</div>
        </div>
        <Link href="/app/change-password" title="Change password" style={{ color: "#aeb8d6", padding: 4, display: "flex" }}>
          <IconLock style={{ width: 16, height: 16 }} />
        </Link>
        <button
          onClick={onSignOut}
          title="Sign out"
          style={{ background: "none", border: "none", color: "#aeb8d6", cursor: "pointer", padding: 4, display: "flex" }}
        >
          <IconLogOut style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </aside>
    </>
  );
}
