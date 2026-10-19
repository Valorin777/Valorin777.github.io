import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonScreen } from "@/components/lesson/LessonScreen";
import { listDays } from "@/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return listDays().map((d) => ({ day: String(d.number) }));
}

export async function generateMetadata({ params }: PageProps<"/day/[day]">): Promise<Metadata> {
  const { day } = await params;
  const meta = listDays().find((d) => String(d.number) === day);
  return { title: meta ? `Day ${meta.number} · ${meta.title}` : "Day" };
}

export default async function Page({ params }: PageProps<"/day/[day]">) {
  const { day } = await params;
  const n = Number(day);
  if (!listDays().some((d) => d.number === n)) notFound();
  return <LessonScreen dayNumber={n} />;
}
