import { redirect } from "next/navigation";

export default function TeamsRedirect() {
  redirect("/dashboard/access-control?tab=teams");
}
