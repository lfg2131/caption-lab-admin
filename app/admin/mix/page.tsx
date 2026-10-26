import {requireAdmin} from "@/lib/auth";
import {MixForm,type MixRow} from "./mix-form";
export default async function MixPage() {
 const { db } = await requireAdmin();
 const {data,error}=await db.from("caption_lab_mix").select("chain_id,enabled,weight,caption_lab_chains(name,application,enabled)").order("chain_id");
 if(error)throw new Error("Could not load mixture.");
 return <div className="space-y-5"><h1 className="text-3xl font-bold">Prompt chain mix</h1><p className="text-muted">Application-owned interpretation: weighted random choice among enabled chains for the requesting application. Weights are relative, not percentages, and normalize within each application. Each application currently has its one existing Week 6 chain, so its share is 100%. Student/Professor perspective and tone remain explicit user choices.</p><MixForm key={JSON.stringify(data)} rows={(data??[]) as unknown as MixRow[]}/></div>;
}
