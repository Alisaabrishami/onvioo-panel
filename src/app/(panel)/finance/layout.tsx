import { FinanceTabs } from "./tabs";

export default function FinanceLayout({ children }: LayoutProps<"/finance">) {
  return (
    <>
      <FinanceTabs />
      {children}
    </>
  );
}
