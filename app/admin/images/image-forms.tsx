"use client";
import {useActionState,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {MEDIA_BUCKET,validateImageFile} from "@/lib/captions/validation";
import {prepareAdminUpload} from "../media/actions";
import {registerImage,updateImage,deleteImage} from "./actions";
export function ImageUpload(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(false);const uploaded=useRef<string|null>(null);const router=useRouter();
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const element=event.currentTarget;const form=new FormData(element);const file=form.get("photo");
  if(!(file instanceof File)||!file.size){setError(true);setMessage("Choose a photo.");return;}
  const invalid=validateImageFile(file);if(invalid){setError(true);setMessage(invalid);return;}
  setBusy(true);setError(false);setMessage("Uploading…");
  try{
   if(!uploaded.current){
    const prepared=await prepareAdminUpload({type:file.type,size:file.size,name:file.name});if(prepared.status!=="ok"||!prepared.path)throw new Error(prepared.message);
    const {error}=await createClient().storage.from(MEDIA_BUCKET).upload(prepared.path,file,{contentType:file.type,upsert:false});if(error)throw new Error("The photo did not upload.");uploaded.current=prepared.path;
   }
   const result=await registerImage({path:uploaded.current,title:form.get("title"),alt_text:form.get("alt_text")});setMessage(result.message);setError(result.status!=="ok");
   if(result.status==="ok"){uploaded.current=null;element.reset();router.refresh();}
  }catch(error){setError(true);setMessage(error instanceof Error?error.message:"Image upload failed.");}finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="card grid gap-4 p-5" aria-busy={busy}><h2 className="font-semibold">Upload a new image</h2><label className="grid gap-1 text-sm">JPEG, PNG or WebP · 5 MB maximum<input type="file" name="photo" required accept="image/jpeg,image/png,image/webp" className="field" disabled={busy} onChange={()=>{uploaded.current=null;}}/></label><label className="grid gap-1 text-sm">Title<input name="title" maxLength={100} className="field" disabled={busy}/></label><label className="grid gap-1 text-sm">Alt text<input name="alt_text" maxLength={300} className="field" disabled={busy}/></label><button className="btn-brand justify-self-start" disabled={busy}>{busy?"Working…":"Upload image"}</button><p role={error?"alert":"status"} className="text-sm">{message}</p></form>;
}
export function ImageEdit({id,title,alt}:{id:string;title:string;alt:string}){
 const [state,action,pending]=useActionState(updateImage,{status:"idle" as const,message:""});
 return <form action={action} className="card grid gap-4 p-5"><h2 className="font-semibold">Edit image metadata</h2><input type="hidden" name="id" value={id}/><label className="grid gap-1 text-sm">Title<input name="title" maxLength={100} defaultValue={title} className="field" disabled={pending}/></label><label className="grid gap-1 text-sm">Alt text<input name="alt_text" maxLength={300} defaultValue={alt} className="field" disabled={pending}/></label><button className="btn-brand justify-self-start" disabled={pending}>{pending?"Saving…":"Save metadata"}</button><p role={state.status==="error"?"alert":"status"}>{state.message}</p></form>;
}
export function ImageDelete({id,used}:{id:string;used:boolean}){
 const [state,action,pending]=useActionState(deleteImage,{status:"idle" as const,message:""});
 return <form action={action} className="card space-y-3 p-5"><input type="hidden" name="id" value={id}/><p className="text-sm text-muted">{used?"Referenced images cannot be deleted or replaced.":"Unused image: deletion removes its file and registry record."}</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" required disabled={used||pending}/>Permanently delete this image</label><button disabled={used||pending} className="btn-quiet">{pending?"Deleting…":"Delete unused image"}</button><p role={state.status==="error"?"alert":"status"}>{state.message}</p></form>;
}
