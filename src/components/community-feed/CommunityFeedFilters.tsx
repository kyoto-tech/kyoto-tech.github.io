import { useState, useEffect, useCallback } from "react";
import type { TagId } from "../../types/community-feed";
import { TAG_LABELS, ALLOWED_TAGS } from "../../types/community-feed";

type Translations = {
  filterAll: string;
  filterBlog: string;
  filterVideo: string;
  filterProject: string;
  allMembers: string;
  allTime: string;
  lastWeek: string;
  lastMonth: string;
  last3Months: string;
  clearAll: string;
  emptyState: string;
  emptyCta: string;
  filterType: string;
  filterMember: string;
  filterTags: string;
  filterTime: string;
};

type MemberOption = {
  id: string;
  name: string;
};

type Props = {
  members: MemberOption[];
  lang: "en" | "ja";
  translations: Translations;
};

type TimeFilter = "all" | "week" | "month" | "3months";

export default function CommunityFeedFilters({
  members,
  lang,
  translations: t,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [tagFilters, setTagFilters] = useState<Set<TagId>>(new Set());
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);

  const isDefault =
    typeFilter === "all" &&
    memberFilter === "all" &&
    tagFilters.size === 0 &&
    timeFilter === "all";

  const clearAll = () => {
    setTypeFilter("all");
    setMemberFilter("all");
    setTagFilters(new Set());
    setTimeFilter("all");
  };

  const toggleTag = (tag: TagId) => {
    setTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const getTimeFilterDate = useCallback((filter: TimeFilter): string | null => {
    if (filter === "all") return null;
    const now = new Date();
    if (filter === "week") now.setDate(now.getDate() - 7);
    else if (filter === "month") now.setMonth(now.getMonth() - 1);
    else if (filter === "3months") now.setMonth(now.getMonth() - 3);
    return now.toISOString().split("T")[0];
  }, []);

  // Apply filters to card DOM elements
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(".cf-card");
    const minDate = getTimeFilterDate(timeFilter);
    let visibleCount = 0;

    cards.forEach((card) => {
      const cardType = card.dataset.type ?? "";
      const cardMember = card.dataset.member ?? "";
      const cardTags = (card.dataset.tags ?? "").split(",");
      const cardDate = card.dataset.date ?? "";

      const passesType = typeFilter === "all" || cardType === typeFilter;
      const passesMember =
        memberFilter === "all" || cardMember === memberFilter;
      const passesTags =
        tagFilters.size === 0 ||
        cardTags.some((t) => tagFilters.has(t as TagId));
      const passesTime = !minDate || cardDate >= minDate;

      const visible = passesType && passesMember && passesTags && passesTime;
      card.style.display = visible ? "" : "none";
      if (visible) visibleCount++;
    });

    // Toggle empty state
    const emptyEl = document.getElementById("cf-empty-state");
    if (emptyEl) {
      emptyEl.style.display = visibleCount === 0 ? "flex" : "none";
    }
  }, [typeFilter, memberFilter, tagFilters, timeFilter, getTimeFilterDate]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".cf-member-dropdown")) setMemberDropdownOpen(false);
      if (!target.closest(".cf-time-dropdown")) setTimeDropdownOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const typePills = [
    { value: "all", label: t.filterAll },
    { value: "blog", label: `\u{1F4DD} ${t.filterBlog}` },
    { value: "video", label: `\u{1F3AC} ${t.filterVideo}` },
    { value: "project", label: `\u{1F680} ${t.filterProject}` },
  ];

  const timeOptions = [
    { value: "all" as const, label: t.allTime },
    { value: "week" as const, label: t.lastWeek },
    { value: "month" as const, label: t.lastMonth },
    { value: "3months" as const, label: t.last3Months },
  ];

  const selectedMemberLabel =
    memberFilter === "all"
      ? t.allMembers
      : members.find((m) => m.id === memberFilter)?.name ?? t.allMembers;

  const selectedTimeLabel =
    timeOptions.find((o) => o.value === timeFilter)?.label ?? t.allTime;

  const pillBase =
    "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all duration-150 cursor-pointer";
  const pillInactive = `${pillBase} border-[#ddd] text-[#888] hover:border-[#bbb] hover:text-[#666]`;
  const pillActive = `${pillBase} border-[#1a1a1a] bg-[#1a1a1a] text-white`;

  return (
    <div className="mb-8 border-t border-b border-[#e8e4df] py-5">
      <div className="flex flex-wrap items-start gap-6">
        {/* Type filter */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#aaa]">
            {t.filterType}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {typePills.map((pill) => (
              <button
                key={pill.value}
                className={
                  typeFilter === pill.value ? pillActive : pillInactive
                }
                onClick={() => setTypeFilter(pill.value)}
                aria-pressed={typeFilter === pill.value}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="hidden h-12 w-px self-center bg-[#e8e4df] md:block" />

        {/* Member dropdown */}
        <div className="cf-member-dropdown relative flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#aaa]">
            {t.filterMember}
          </span>
          <button
            className={
              memberFilter !== "all" ? pillActive : pillInactive
            }
            onClick={() => setMemberDropdownOpen((prev) => !prev)}
          >
            {selectedMemberLabel} &#9662;
          </button>
          {memberDropdownOpen && (
            <div className="absolute top-full left-0 z-20 mt-1 min-w-[180px] rounded-xl border border-[#e8e4df] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.1)]">
              <button
                className={`block w-full px-4 py-2 text-left text-[13px] transition-colors hover:bg-slate-50 ${memberFilter === "all" ? "bg-slate-50 font-medium" : ""}`}
                onClick={() => {
                  setMemberFilter("all");
                  setMemberDropdownOpen(false);
                }}
              >
                {t.allMembers}
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  className={`block w-full px-4 py-2 text-left text-[13px] transition-colors hover:bg-slate-50 ${memberFilter === m.id ? "bg-slate-50 font-medium" : ""}`}
                  onClick={() => {
                    setMemberFilter(m.id);
                    setMemberDropdownOpen(false);
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden h-12 w-px self-center bg-[#e8e4df] md:block" />

        {/* Tag pills */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#aaa]">
            {t.filterTags}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ALLOWED_TAGS.map((tag) => (
              <button
                key={tag}
                className={tagFilters.has(tag) ? pillActive : pillInactive}
                onClick={() => toggleTag(tag)}
                aria-pressed={tagFilters.has(tag)}
              >
                {TAG_LABELS[tag][lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="hidden h-12 w-px self-center bg-[#e8e4df] md:block" />

        {/* Time dropdown */}
        <div className="cf-time-dropdown relative flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#aaa]">
            {t.filterTime}
          </span>
          <button
            className={
              timeFilter !== "all" ? pillActive : pillInactive
            }
            onClick={() => setTimeDropdownOpen((prev) => !prev)}
          >
            {selectedTimeLabel} &#9662;
          </button>
          {timeDropdownOpen && (
            <div className="absolute top-full left-0 z-20 mt-1 min-w-[160px] rounded-xl border border-[#e8e4df] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.1)]">
              {timeOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`block w-full px-4 py-2 text-left text-[13px] transition-colors hover:bg-slate-50 ${timeFilter === opt.value ? "bg-slate-50 font-medium" : ""}`}
                  onClick={() => {
                    setTimeFilter(opt.value);
                    setTimeDropdownOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear all */}
        {!isDefault && (
          <button
            className="mt-5 text-[13px] text-[#888] underline transition-colors hover:text-[#444]"
            onClick={clearAll}
          >
            {t.clearAll}
          </button>
        )}
      </div>
    </div>
  );
}
