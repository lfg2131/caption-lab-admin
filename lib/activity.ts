import type { PrivilegedClient } from "./supabase/privileged";
export type ActivityDay={day:string;captions:number;votes:number};
export function validateDays(value:unknown):number {
 if(typeof value!=="number"||!Number.isInteger(value)||value<7||value>90)throw new Error("Choose a whole number of days from 7 to 90.");
 return value;
}
export async function loadActivity(db:PrivilegedClient,days:number):Promise<ActivityDay[]> {
 validateDays(days);
 const {data,error}=await db.rpc("caption_lab_activity",{p_days:days});
 if(error||data?.length!==days)throw new Error("Daily activity could not be loaded.");
 return (data as {day:string;captions:number|string;votes:number|string}[]).map(row=>({day:row.day,captions:Number(row.captions),votes:Number(row.votes)}));
}
