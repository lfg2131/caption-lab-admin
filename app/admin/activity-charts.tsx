"use client";
import {useEffect,useRef,useState,useTransition} from "react";
import type {ActivityDay} from "@/lib/activity";
import {getActivity} from "./activity-actions";
import {DailyBarChart} from "./bar-chart";
export function ActivityCharts({initial}:{initial:ActivityDay[]}) {
 const [selected,setSelected]=useState(14);const [days,setDays]=useState(14);const [activity,setActivity]=useState(initial);const [error,setError]=useState("");const [pending,startTransition]=useTransition();const version=useRef(0);
 useEffect(()=>{
  if(selected===days)return;
  const request=++version.current;let cancelled=false;
  const timer=setTimeout(()=>startTransition(async()=>{
   setError("");try{const result=await getActivity(selected);if(cancelled||request!==version.current)return;if(result.status==="ok"){setActivity(result.activity);setDays(result.days);}else setError(result.message);}catch{if(!cancelled&&request===version.current)setError("Could not load activity. Try again.");}
  }),300);
  return()=>{clearTimeout(timer);cancelled=true;};
 },[selected,days]);
 return <section className="space-y-3" aria-busy={pending} aria-label="Daily activity"><div className="card flex flex-wrap items-center gap-4 p-4"><label htmlFor="activity-range" className="font-semibold">Last {selected} days</label><input id="activity-range" type="range" min="7" max="90" step="1" value={selected} onChange={event=>setSelected(Number(event.target.value))} className="min-h-11 w-52 max-w-full" aria-valuetext={`Last ${selected} days`}/><p role="status" className="text-xs text-muted">{pending||(selected!==days&&!error)?"Loading selected range…":`Showing ${days} New York calendar days`}</p></div><p className="text-xs text-muted">Captions: saved caption rows by creation day. Votes: currently saved votes by original insertion day; changes keep that day, undo removes the vote. No historical vote event log.</p>{error&&<p role="alert" className="alert-error">{error}</p>}<div className="grid gap-4 md:grid-cols-2"><DailyBarChart title="Captions generated per day" unit="captions" points={activity.map(day=>({day:day.day,value:day.captions}))}/><DailyBarChart title="Votes cast per day" unit="votes" points={activity.map(day=>({day:day.day,value:day.votes}))}/></div></section>;
}
