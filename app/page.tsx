import { redirect } from "next/navigation";

// The proxy normally redirects first; /admin re-checks access itself.
export default function Home() {
  redirect("/admin");
}
