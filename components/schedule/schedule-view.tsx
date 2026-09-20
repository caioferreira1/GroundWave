"use client";

import { useMemo, useState } from "react";
import { formatWeekRangeLabel } from "@/lib/schedule/iso-week";
import { EditScheduledPostDrawer } from "./edit-scheduled-post-drawer";
import { ScheduleWeekGroup } from "./schedule-week-group";
import type { AccountOption, CompanyOption, FormatTagOption, ScheduledPost } from "./types";

/** Groups posts by ISO week and renders one collapsible ScheduleWeekGroup per week, all sharing a single edit drawer instance. */
export function ScheduleView({
  posts,
  companyNameById,
  accountNameById,
  formatTagLabelById,
  companies,
  accounts,
  formatTags,
  showCompany,
  updateAction,
  markPostedAction,
  unmarkPostedAction,
  createFormatTagAction,
}: {
  posts: ScheduledPost[];
  companyNameById: Record<string, string>;
  accountNameById: Record<string, string>;
  formatTagLabelById: Record<string, string>;
  companies: CompanyOption[];
  accounts: AccountOption[];
  formatTags: FormatTagOption[];
  showCompany: boolean;
  updateAction: (postId: string, formData: FormData) => Promise<void>;
  markPostedAction: (postId: string, formData: FormData) => Promise<void>;
  unmarkPostedAction: (postId: string) => Promise<void>;
  createFormatTagAction: (formData: FormData) => Promise<FormatTagOption>;
}) {
  const [editing, setEditing] = useState<ScheduledPost | null>(null);

  const byWeek = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const post of posts) {
      const key = `${post.iso_year}-${String(post.iso_week).padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [posts]);
  const weekKeys = useMemo(() => [...byWeek.keys()].sort(), [byWeek]);

  return (
    <div className="space-y-8">
      {weekKeys.map((key) => {
        const [isoYearStr, isoWeekStr] = key.split("-");
        const isoYear = Number(isoYearStr);
        const isoWeek = Number(isoWeekStr);
        return (
          <ScheduleWeekGroup
            key={key}
            heading={`Week ${isoWeek}, ${isoYear}`}
            rangeLabel={formatWeekRangeLabel(isoYear, isoWeek)}
            posts={byWeek.get(key)!}
            companyNameById={companyNameById}
            accountNameById={accountNameById}
            formatTagLabelById={formatTagLabelById}
            showCompany={showCompany}
            onSelectPost={setEditing}
          />
        );
      })}

      <EditScheduledPostDrawer
        editing={editing}
        onClose={() => setEditing(null)}
        companies={companies}
        accounts={accounts}
        formatTags={formatTags}
        updateAction={updateAction}
        markPostedAction={markPostedAction}
        unmarkPostedAction={unmarkPostedAction}
        createFormatTagAction={createFormatTagAction}
      />
    </div>
  );
}
