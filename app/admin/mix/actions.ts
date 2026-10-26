"use server";
import { revalidatePath } from "next/cache";
import { assertAdmin, AdminAccessError } from "@/lib/auth";
import type { CatalogState } from "../catalog-actions";
export async function saveMix(_state: CatalogState, form: FormData): Promise<CatalogState> {
 let admin; try { admin=await assertAdmin(); } catch(error) { return {status:"error",message:error instanceof AdminAccessError?error.message:"Access could not be verified."}; }
 const {data,error}=await admin.db.from("caption_lab_mix").select("chain_id").order("chain_id");
 if(error||!data?.length)return {status:"error",message:"Could not load the current mixture."};
 const rows=data.map(row=>({chain_id:row.chain_id,enabled:form.get(`enabled:${row.chain_id}`)==="on",weight:Number(form.get(`weight:${row.chain_id}`))}));
 if(rows.some(row=>!Number.isInteger(row.weight)||row.weight<1||row.weight>100))return {status:"error",message:"Each weight must be a whole number from 1 to 100."};
 const result=await admin.db.rpc("caption_lab_save_mix",{p_rows:rows});
 if(result.error)return {status:"error",message:"Mixture rejected. Keep an enabled chain per application, with active models/providers and weights from 1 to 100. Refresh if configuration changed."};
 revalidatePath("/admin/mix"); return {status:"ok",message:"Mixture saved atomically. New generations use these weights."};
}
