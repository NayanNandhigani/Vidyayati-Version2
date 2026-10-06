"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "./sidebar-config";
import { IconSchool, IconLogOut, IconLock } from "./icons";

export type ShellSchool = { name: string; subtitle: string; logoUrl: string | null; initials: string };

type Props = {
  role: "SCHOOL_ADMIN" | "STAFF" | "PARENT";
  roleLabel: string;
  visibleModules: Set<string> | null; // null = no per-staff module gating (Admin sees everything)
  disabledSchoolModules: Set<string>; // school-wide off switch — hides the item for every role, Admin included
  school: ShellSchool;
  userName: string;
  onSignOut: () => void;
  children: React.ReactNode;
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

// The school portal frame for School Admins, staff and parents: a header
// with the school's own logo and name (the school's portal, not Vidya
// Yati's), the signed-in person on the right, the menu on the left with
// "Powered by Vidya Yati" at its foot, and the page below. The Super
// Admin portal has its own layout and is unchanged.
export default function AppShell({ role, roleLabel, visibleModules, disabledSchoolModules, school, userName, onSignOut, children }: Props) {
  const pathname = usePathname();
  // Small screens: the menu is a slide-in panel (see .app-sidebar in
  // globals.css). It closes whenever the page changes.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="app-shell">
      <header className="app-header print-hide">
        <button type="button" className="app-menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          ☰
        </button>
        <div className="app-school-logo">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a school's uploaded logo, served by app/api/school-logo
            <img src={school.logoUrl} alt={`${school.name} logo`} />
          ) : (
            <span className="app-school-initials" aria-hidden="true">
              {school.initials}
            </span>
          )}
        </div>
        <div className="app-school-text">
          <div className="app-school-name" title={school.name}>
            {school.name}
          </div>
          {school.subtitle && <div className="app-school-sub">{school.subtitle}</div>}
        </div>

        <div className="app-user">
          <div className="app-user-text">
            <div className="app-user-name">{userName}</div>
            <div className="app-user-role">{roleLabel}</div>
          </div>
          <div className="app-user-avatar" aria-hidden="true">
            {initialsOf(userName)}
          </div>
          <div className="app-user-actions">
            <Link href="/app/change-password" title="Change password" aria-label="Change password">
              <IconLock style={{ width: 16, height: 16 }} />
            </Link>
            <button type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              <IconLogOut style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        <div className={`app-backdrop${open ? " is-open" : ""}`} onClick={() => setOpen(false)} />
        <aside className={`print-hide app-sidebar${open ? " is-open" : ""}`}>
          <nav style={{ flex: 1, overflowY: "auto", padding: "10px 0 8px" }}>
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

          {/* On phones the header only has room for the avatar, so the account links live in the menu. */}
          <div className="app-sidebar-account">
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{userName}</div>
            <div style={{ fontSize: 10.5, color: "#7f8bb0", marginBottom: 8 }}>{roleLabel}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <Link href="/app/change-password" style={{ color: "#aeb8d6", display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                <IconLock style={{ width: 14, height: 14 }} /> Change password
              </Link>
              <button type="button" onClick={onSignOut} style={{ background: "none", border: "none", color: "#aeb8d6", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0, fontSize: 12.5 }}>
                <IconLogOut style={{ width: 14, height: 14 }} /> Sign out
              </button>
            </div>
          </div>

          <div className="app-powered">
            <IconSchool style={{ width: 16, height: 16, color: "var(--marigold)" }} />
            <span>Powered by</span>
            <span className="disp app-powered-name">Vidya Yati</span>
          </div>
        </aside>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
