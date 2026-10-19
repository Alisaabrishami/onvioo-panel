import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { clientOptions, isUuid } from "@/lib/data";
import { createContract } from "../actions";
import { ContractForm } from "../contract-form";

export const metadata: Metadata = { title: "قرارداد جدید" };

export default async function NewContractPage(props: PageProps<"/contracts/new">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const clients = await clientOptions();
  return (
    <>
      <PageHeader title="قرارداد جدید" description="پیش‌نویس را بنویسید، بعد برای امضای پیامکی مشتری بفرستید" />
      <Card className="max-w-4xl">
        <ContractForm action={createContract} clients={clients} initial={{ clientId: isUuid(sp.client) ? sp.client : "" }} submitLabel="ذخیره پیش‌نویس" />
      </Card>
    </>
  );
}
