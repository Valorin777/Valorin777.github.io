import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenseScreen } from "@/components/tenses/TenseScreen";
import { getTense } from "@/content/tenses";
import { TENSE_IDS } from "@/content/tenses/ids";

export const dynamicParams = false;

export function generateStaticParams() {
  return TENSE_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/tenses/[id]">): Promise<Metadata> {
  const { id } = await params;
  const t = getTense(id);
  return { title: t ? `${t.name} · Tenses` : "Tenses" };
}

export default async function Page({ params }: PageProps<"/tenses/[id]">) {
  const { id } = await params;
  if (!getTense(id)) notFound();
  return <TenseScreen id={id} />;
}
