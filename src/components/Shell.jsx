import React from "react";
import { NavLink, Link, Outlet } from "react-router-dom";
import { useStorm } from "../state";
import { Clock } from "./ui";
export const NAV = [
  { to: "/", end: true, label: "Overview" },
  { to: "/imagery", label: "Satellite imagery" },
  { to: "/prediction", label: "Prediction" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/warnings", label: "Early warning" },
];
export const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="#4a73f0" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M16 3.5a12.5 12.5 0 1 1-12.5 12.5" /><path d="M16 9.5a6.5 6.5 0 1 1-6.5 6.5" /><circle cx="16" cy="16" r="1.6" fill="#4a73f0" stroke="none" />
  </svg>
);

export default function Shell() {
  const { unread } = useStorm();
  const link = ({ isActive }) => `relative whitespace-nowrap py-5 text-[14px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${isActive ? "text-white after:absolute after:inset-x-0 after:bottom-3 after:h-px after:bg-brand" : "text-slate-300 hover:text-white"}`;
  return (
    <div className="flex h-full flex-col">
      <header className="z-20 flex items-center gap-8 border-b border-line bg-ink-950/80 px-5 backdrop-blur sm:px-10">
        <Link to="/" className="flex items-center gap-3 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"><Logo /><span className="font-display text-[15px] font-bold tracking-[0.18em] text-white">CYCLONEX</span></Link>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-8 lg:flex">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}>{n.label}</NavLink>)}</nav>
        <div className="ml-auto flex items-center gap-4 lg:ml-0">
          <Clock className="hidden text-[13px] text-slate-400 lg:block" />
          <Link to="/warnings" className="inline-flex items-center gap-2 border border-brand/70 px-4 py-1.5 text-[13px] text-white hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">Alerts{unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold">{unread}</span>}</Link>
        </div>
      </header>
      <nav aria-label="Pages" className="flex gap-6 overflow-x-auto border-b border-line bg-ink-950/80 px-5 lg:hidden">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}>{n.label}</NavLink>)}</nav>
      <main className="min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  );
}
