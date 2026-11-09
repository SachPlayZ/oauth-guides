import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getShownGuide } from "@/lib/guides";
import { GuideView } from "./guide-view";

export default function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the guide…</p>}>
      <GuideContent params={params} />
    </Suspense>
  );
}

async function GuideContent({ params }: { params: PageProps<"/guides/[slug]">["params"] }) {
  const { slug } = await params;
  const shown = await getShownGuide(slug);
  if (!shown) notFound();
  return <GuideView guide={shown.guide} version={shown.version} newerUnreviewed={shown.newerUnreviewed} />;
}
