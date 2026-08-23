import { redirect } from "next/navigation";

export default function TeamRedirect() {
  redirect("/dashboard/access-control?tab=roles");
}
