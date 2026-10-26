"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
const groups=[
 {label:"Activity",items:[["/admin","Overview"],["/admin/users","Users / profiles"],["/admin/media","AI media"],["/admin/images","Images"],["/admin/votes","Ratings"]]},
 {label:"Generation",items:[["/admin/chains","Prompt chains"],["/admin/steps","Chain steps"],["/admin/mix","Chain mix"],["/admin/terms","Terms"],["/admin/examples","Generation examples"],["/admin/requests","Requests"],["/admin/responses","LLM responses"]]},
 {label:"Settings",items:[["/admin/models","LLM models"],["/admin/providers","LLM providers"],["/admin/signup-domains","Signup domains"],["/admin/whitelist","E-mail whitelist"]]},
];
export function AdminNav(){const pathname=usePathname();return <nav aria-label="Admin" className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">{groups.map(group=><section key={group.label}><h2 className="mb-2 px-3 text-xs font-semibold tracking-wider text-muted uppercase">{group.label}</h2><ul className="grid grid-cols-2 gap-1 sm:grid-cols-1">{group.items.map(([href,label])=>{const active=href==="/admin"?pathname===href:pathname===href||pathname.startsWith(`${href}/`);return <li key={href}><Link href={href} aria-current={active?"page":undefined} className={`flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-semibold ${active?"bg-white text-zinc-950":"text-muted hover:bg-white/5 hover:text-foreground"}`}>{label}</Link></li>;})}</ul></section>)}</nav>;}
