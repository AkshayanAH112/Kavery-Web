import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import OnlineExam from "@/components/site/OnlineExam";

export async function generateMetadata({ params }: PageProps<"/[locale]/parents/exam/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Exam" });
  // One child's sitting: nothing here is for a search engine.
  return { title: t("meta_title"), robots: { index: false, follow: false } };
}

/**
 * Where a child sits an online paper (`?student=<index number>`, one of the children this browser is
 * signed in for on the parent page). Everything happens in the browser against /api/public/online.
 */
export default async function ExamPage({ params, searchParams }: PageProps<"/[locale]/parents/exam/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const student = (await searchParams).student;
  return (
    <div className="min-h-screen pb-24 pt-[calc(var(--nav-h)+1.5rem)]">
      <div className="container-x max-w-[52rem]">
        <OnlineExam paperId={id} student={typeof student === "string" ? student : ""} />
      </div>
    </div>
  );
}
