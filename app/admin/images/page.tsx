import Image from "next/image";
import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {MEDIA_BUCKET} from "@/lib/captions/validation";
import {ImageUpload} from "./image-forms";
import {Pagination} from "../pagination";
export default async function ImagesPage({searchParams}:{searchParams:Promise<{page?:string}>}){
 const { db } = await requireAdmin();
 const query=await searchParams;const page=Math.max(1,Math.floor(Number(query.page)||1));
 const {data,error,count}=await db.from("caption_lab_images").select("id,title,alt_text,storage_path,mime_type,size_bytes,state,created_at",{count:"exact"}).order("created_at",{ascending:false}).order("id").range((page-1)*25,page*25-1);
 if(error)throw new Error("Could not load images.");
 const rows=data??[];const {data:signed}=rows.length?await db.storage.from(MEDIA_BUCKET).createSignedUrls(rows.map(row=>row.storage_path),1800):{data:[]};
 const urls=new Map((signed??[]).map(row=>[row.path,row.signedUrl]));
 return <div className="space-y-6"><header><h1 className="text-3xl font-bold">Images</h1><p className="mt-3 text-muted">Private week4-media files. Existing caption images are registered in place. Only images backing published captions have public read access.</p></header><ImageUpload/><ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map(row=><li key={row.id} className="card p-4"><Link href={`/admin/images/${row.id}`} className="grid gap-3">{urls.get(row.storage_path)?<Image src={urls.get(row.storage_path)!} alt={row.alt_text||"Uploaded photo"} width={320} height={200} unoptimized className="h-40 w-full rounded-xl object-contain"/>:<p className="text-sm text-muted">Preview unavailable</p>}<span className="break-words font-semibold text-brand-soft underline">{row.title||row.id}</span><span className="text-xs text-muted">{row.mime_type??"Legacy image"} · {row.size_bytes??"Unknown"} bytes · {row.state}</span></Link></li>)}</ul>{!rows.length&&<p>No images yet.</p>}<Pagination page={page} pages={Math.max(1,Math.ceil((count??0)/25))} total={count??0} label="images" params={{}} basePath="/admin/images"/></div>;
}
