import { redirect } from "next/navigation";

// The dashboard sends clients on to their portal
export default function Home() {
  redirect("/dashboard");
}
