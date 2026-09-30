"use client";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { localeCookie, normalizeLocale, type Locale } from "./config";
import zh from "../../messages/zh-CN.json";
import en from "../../messages/en.json";
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>({ locale: "zh-CN", setLocale: () => {} });
export function LocaleProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback(
    (next: Locale) => {
      const value = normalizeLocale(next);
      document.cookie = `${localeCookie}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      updateLocale(value);
      router.refresh();
      // Mirror only this non-sensitive preference for cross-tab synchronization.
      try {
        localStorage.setItem(localeCookie, value);
      } catch {}
    },
    [router],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === localeCookie && event.newValue) {
        updateLocale(normalizeLocale(event.newValue));
        router.refresh();
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [router]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider
        timeZone="UTC"
        locale={locale}
        messages={(locale === "en" ? en : zh) as AbstractIntlMessages}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
export function LanguageSwitcher() {
  const { locale, setLocale } = useContext(LocaleContext);
  return (
    <div
      className="fixed bottom-3 right-3 z-[60] flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground shadow-sm"
      data-testid="language-switcher"
    >
      <Languages className="h-3.5 w-3.5" aria-hidden="true" />
      <label className="sr-only" htmlFor="platform-language">
        {locale === "en" ? "Interface language" : "界面语言"}
      </label>
      <select
        id="platform-language"
        value={locale}
        onChange={(e) => setLocale(normalizeLocale(e.target.value))}
        className="max-w-[140px] cursor-pointer bg-background text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        aria-label={locale === "en" ? "Interface language" : "界面语言"}
      >
        <option value="zh-CN" lang="zh-CN">
          简体中文
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </div>
  );
}
