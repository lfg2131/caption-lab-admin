"use server";
import {assertAdmin} from "@/lib/auth";
import {loadActivity,validateDays} from "@/lib/activity";
export async function getActivity(days:unknown) {
 const {db}=await assertAdmin();
 try{return {status:"ok" as const,days:validateDays(days),activity:await loadActivity(db,validateDays(days))};}
 catch{return {status:"error" as const,message:"Could not load the selected range. Choose 7–90 days and retry."};}
}
