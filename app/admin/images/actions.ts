"use server";
import {revalidatePath} from "next/cache";
import {assertAdmin,AdminAccessError} from "@/lib/auth";
import {MAX_IMAGE_BYTES,MEDIA_BUCKET,isOwnedImagePath,isUuid,sniffImageType,extensionMimeType} from "@/lib/captions/validation";
import type {CatalogState} from "../catalog-actions";
const failed=(error:unknown):CatalogState=>({status:"error",message:error instanceof AdminAccessError?error.message:"Could not verify access."});
function metadata(form:FormData) {
 const title=form.get("title"),alt=form.get("alt_text");
 if(typeof title!=="string"||typeof alt!=="string"||title.trim().length>100||alt.trim().length>300||title.includes("\0")||alt.includes("\0"))return null;
 return {title:title.trim(),alt_text:alt.trim()};
}
export async function registerImage(input:unknown):Promise<CatalogState> {
 let admin;try{admin=await assertAdmin();}catch(error){return failed(error);}
 const {path,title,alt_text}=(input??{}) as Record<string,unknown>;
 if(!isOwnedImagePath(path,admin.user.id)||typeof title!=="string"||typeof alt_text!=="string"||title.trim().length>100||alt_text.trim().length>300)return {status:"error",message:"Invalid image metadata."};
 const {data:blob,error}=await admin.db.storage.from(MEDIA_BUCKET).download(path);
 if(error||!blob)return {status:"error",message:"The uploaded file could not be read. Retry registering the same upload."};
 const bytes=new Uint8Array(await blob.arrayBuffer());const mime=sniffImageType(bytes);
 if(!mime||mime!==extensionMimeType(path)||!bytes.length||bytes.length>MAX_IMAGE_BYTES){
  const removed=await admin.db.storage.from(MEDIA_BUCKET).remove([path]);
  return {status:"error",message:removed.error?"Unsupported file. Storage cleanup failed; contact the administrator.":"Use a real JPEG, PNG or WebP under 5 MB. Invalid upload removed."};
 }
 const {error:saveError}=await admin.db.from("caption_lab_images").insert({storage_path:path,owner_id:admin.user.id,title:title.trim(),alt_text:alt_text.trim(),mime_type:mime,size_bytes:bytes.length});
 if(saveError)return {status:"error",message:saveError.code==="23505"?"This upload is already registered. Refresh Images.":"The file uploaded, but metadata did not save. Retry registering this same upload."};
 revalidatePath("/admin/images");return {status:"ok",message:"Image uploaded and registered privately."};
}
export async function updateImage(_state:CatalogState,form:FormData):Promise<CatalogState> {
 let admin;try{admin=await assertAdmin();}catch(error){return failed(error);}
 const id=form.get("id"),values=metadata(form);
 if(!isUuid(id)||!values)return {status:"error",message:"Title must be at most 100 characters and alt text at most 300."};
 const {data,error}=await admin.db.from("caption_lab_images").update(values).eq("id",id).eq("state","available").select("id").maybeSingle();
 if(error||!data)return {status:"error",message:"Metadata could not be saved. The image may be unavailable."};
 revalidatePath("/admin/images","layout");return {status:"ok",message:"Metadata saved."};
}
export async function deleteImage(_state:CatalogState,form:FormData):Promise<CatalogState> {
 let admin;try{admin=await assertAdmin();}catch(error){return failed(error);}
 const id=form.get("id");if(!isUuid(id)||form.get("confirm")!=="on")return {status:"error",message:"Confirm deletion first."};
 const {data:path,error}=await admin.db.rpc("caption_lab_reserve_image_delete",{p_id:id});
 if(error||typeof path!=="string")return {status:"error",message:"Image deletion refused. Captions or generation requests still reference it, or it no longer exists."};
 const {error:storageError}=await admin.db.storage.from(MEDIA_BUCKET).remove([path]);
 if(storageError){await admin.db.from("caption_lab_images").update({state:"available"}).eq("id",id);return {status:"error",message:"Storage deletion failed. The registry was kept; retry later."};}
 const {error:registryError}=await admin.db.from("caption_lab_images").delete().eq("id",id);
 if(registryError)return {status:"error",message:"The file was removed, but its deleting registry entry remains. Retry deletion to finish cleanup."};
 revalidatePath("/admin/images","layout");return {status:"ok",message:"Unused image and metadata deleted."};
}
