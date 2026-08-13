"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, MessagesSquare, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import { buttonClass } from "./button";
import { SegmentedControl, SegmentedControlLink } from "./segmented-control";

const tabs: { label: string; icon: LucideIcon; suffix: string }[] = [
  { label: "Overview", icon: Gauge, suffix: "" },
  { label: "Posts", icon: MessagesSquare, suffix: "/posts" },
  { label: "Post Generator", icon: Sparkles, suffix: "/post-generator" },
  { label: "Accounts", icon: Users, suffix: "/accounts" },
];

export function CompanyTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const settingsHref = `/companies/${companyId}/settings`;
  const settingsActive = pathname.startsWith(settingsHref);

  return (
    <div className="flex items-center justify-between gap-2">
      <SegmentedControl className="flex-wrap">
        {tabs.map((tab) => {
          const href = `/companies/${companyId}${tab.suffix}`;
          const active = tab.suffix === "" ? pathname === href : pathname.startsWith(href);
          return (
            <SegmentedControlLink key={tab.label} href={href} active={active} className="flex items-center gap-1.5">
              <tab.icon className="h-3.5 w-3.5" strokeWidth={2} />
              {tab.label}
            </SegmentedControlLink>
          );
        })}
      </SegmentedControl>

      <Link
        href={settingsHref}
        aria-label="Settings"
        title="Settings"
        className={cx(
          buttonClass("ghost", "icon"),
          settingsActive && "bg-accent text-accent-foreground",
        )}
      >
        <Settings className="h-4 w-4" strokeWidth={2} />
      </Link>
    </div>
  );
}
