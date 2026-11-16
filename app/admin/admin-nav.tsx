"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

export type NavItem = readonly [href: string, label: string];
export type NavGroup = { label: string; items: readonly NavItem[]; collapsible: boolean };

// Activity stays open; Generation and Settings are disclosure groups (closed by default).
export const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Activity", collapsible: false, items: [["/admin", "Overview"], ["/admin/users", "Users / profiles"], ["/admin/media", "AI media"], ["/admin/images", "Images"], ["/admin/votes", "Ratings"]] },
  { label: "Generation", collapsible: true, items: [["/admin/chains", "Prompt chains"], ["/admin/steps", "Chain steps"], ["/admin/mix", "Chain mix"], ["/admin/terms", "Terms"], ["/admin/examples", "Generation examples"], ["/admin/requests", "Requests"], ["/admin/responses", "LLM responses"]] },
  { label: "Settings", collapsible: true, items: [["/admin/models", "LLM models"], ["/admin/providers", "LLM providers"], ["/admin/signup-domains", "Signup domains"], ["/admin/whitelist", "E-mail whitelist"]] },
];

export function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
export function groupIsActive(group: NavGroup, pathname: string) {
  return group.items.some(([href]) => isActive(pathname, href));
}
/** Collapsible groups start closed unless they contain the current page. */
export function initialOpen(pathname: string): Record<string, boolean> {
  return Object.fromEntries(NAV_GROUPS.filter((g) => g.collapsible).map((g) => [g.label, groupIsActive(g, pathname)]));
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 4 6 6-6 6" />
    </svg>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const id = useId();
  const [open, setOpen] = useState(() => initialOpen(pathname));
  const [seenPath, setSeenPath] = useState(pathname);
  // Navigating (even via a link elsewhere) reveals the group that holds the current page.
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    const reveal = initialOpen(pathname);
    setOpen((previous) => ({ ...previous, ...Object.fromEntries(Object.entries(reveal).filter(([, on]) => on)) }));
  }

  return (
    <nav aria-label="Admin" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
      {NAV_GROUPS.map((group) => {
        const listId = `${id}-${group.label.toLowerCase()}`;
        const expanded = !group.collapsible || open[group.label];
        const links = (
          <ul id={listId} hidden={!expanded} className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-1">
            {group.items.map(([href, label]) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? "bg-white text-zinc-950" : "text-muted hover:bg-white/5 hover:text-foreground"}`}>{label}</Link>
                </li>
              );
            })}
          </ul>
        );
        return (
          <section key={group.label}>
            {group.collapsible ? (
              <h2>
                <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setOpen((previous) => ({ ...previous, [group.label]: !previous[group.label] }))}
                  className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold tracking-wider text-muted uppercase transition hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <span>{group.label}{!expanded && groupIsActive(group, pathname) ? " •" : ""}</span>
                  <Chevron open={expanded} />
                </button>
              </h2>
            ) : (
              <h2 className="flex min-h-10 items-center px-3 text-xs font-semibold tracking-wider text-muted uppercase">{group.label}</h2>
            )}
            {links}
          </section>
        );
      })}
    </nav>
  );
}
