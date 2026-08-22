"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LogOut, Menu, Moon, Sparkles, Sun, Users as UsersIcon, X, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { cx } from "@/lib/cx";
import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { SubmitButton } from "./submit-button";

type Company = { id: string; name: string };

const RECENT_COMPANIES_KEY = "gw:recent-companies";
const MAX_RECENT_COMPANIES = 5;

function readRecentCompanyIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COMPANIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

const primaryNav = [
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/generic-post-generator", label: "Post generator", icon: Sparkles },
];

export function Sidebar({
  companies,
  isAdmin,
  isStaff,
  roleLabel,
  roleVariant,
  userLabel,
  signOutAction,
}: {
  companies: Company[];
  isAdmin: boolean;
  isStaff: boolean;
  roleLabel: string;
  roleVariant: "accent" | "neutral" | "warning";
  userLabel: string;
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recentCompanyIds, setRecentCompanyIds] = useState<string[]>([]);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // resolvedTheme is unknown during SSR, so the icon must stay stable until
  // after mount to avoid a hydration mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close the mobile menu on route change. Adjusted during render (not an
  // effect) per https://react.dev/learn/you-might-not-need-an-effect —
  // this is "resetting state when a prop changes," not a synchronization
  // with an external system.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const activeCompanyId = pathname.match(/^\/companies\/([^/]+)/)?.[1];

  useEffect(() => {
    const stored = readRecentCompanyIds();
    const next = activeCompanyId
      ? [activeCompanyId, ...stored.filter((id) => id !== activeCompanyId)].slice(0, MAX_RECENT_COMPANIES)
      : stored;

    if (activeCompanyId) {
      try {
        localStorage.setItem(RECENT_COMPANIES_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable (private mode, etc.) — recents just won't persist.
      }
    }

    // Reading localStorage on mount and recording the viewed company are
    // synchronizations with an external system (browser storage), not state
    // derived from props/state — the pattern this rule normally guards
    // against doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentCompanyIds(next);
  }, [activeCompanyId]);

  const recentCompanies = recentCompanyIds
    .map((id) => companies.find((c) => c.id === id))
    .filter((c): c is Company => Boolean(c));

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/companies" className="flex items-center">
          <Logo size={20} />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {primaryNav.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={pathname === item.href} />
          ))}
          {isStaff && (
            <NavItem href="/accounts" icon={UsersIcon} label="Accounts" active={pathname.startsWith("/accounts")} />
          )}
          {isAdmin && (
            <NavItem
              href="/admin/users"
              icon={UsersIcon}
              label="Users"
              active={pathname.startsWith("/admin/users")}
            />
          )}
        </div>

        {recentCompanies.length > 0 && (
          <div className="space-y-0.5 border-t border-border pt-4">
            <p className="px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Recent
            </p>
            {recentCompanies.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className={cx(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
                  c.id === activeCompanyId
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Avatar name={c.name} size="sm" />
                <span className="truncate">{c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Link
          href="/account"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 -m-1 transition-colors duration-150 hover:bg-secondary"
        >
          <Avatar name={userLabel} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{userLabel}</p>
            <Badge variant={roleVariant} className="mt-0.5">
              {roleLabel}
            </Badge>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Toggle theme"
        >
          {mounted && resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <form action={signOutAction}>
          <SubmitButton
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            className="rounded-md text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </SubmitButton>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden print:hidden">
        <Link href="/companies" className="flex items-center">
          <Logo size={20} />
        </Link>
        <div className="flex items-center gap-3">
          <Avatar name={userLabel} size="sm" />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className={cx("fixed inset-0 z-40 lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cx(
            "absolute inset-0 bg-overlay transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cx(
            "absolute inset-y-0 left-0 w-72 rounded-r-xl border-r border-border bg-card shadow-lg transition-transform duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {nav}
        </div>
      </div>

      <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:block print:hidden">{nav}</aside>
    </>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "relative flex items-center gap-2.5 rounded-md py-1.5 pr-2.5 pl-2.5 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <span
        className={cx(
          "bg-primary absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full transition-transform duration-200",
          active ? "scale-y-100" : "scale-y-0",
        )}
        aria-hidden="true"
      />
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
