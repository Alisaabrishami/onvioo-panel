import type { Metadata } from "next";
import { Badge, PageHeader } from "@/components/ui";
import { aiConfigured } from "@/lib/ai";
import { suggestionsFor } from "@/lib/assistant";
import { requireTeam } from "@/lib/auth/dal";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "دستیار" };

export default async function AssistantPage() {
  const user = await requireTeam();
  const ready = aiConfigured();
  return (
    <>
      <PageHeader
        title="دستیار پنل"
        description="درباره کارها، محتوا، مشتری‌ها، سایت‌ها و فروش بپرسید؛ دستیار از داده‌های همین پنل جواب می‌دهد و چیزی را تغییر نمی‌دهد."
        actions={!ready && <Badge tone="warning">کلید API هوش مصنوعی تنظیم نشده</Badge>}
      />
      <Chat suggestions={suggestionsFor(user.role)} name={user.name.split(" ")[0]} disabled={!ready} />
    </>
  );
}
