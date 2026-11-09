import { Suspense } from "react";
import { listDirectory } from "@/lib/guides";
import { Directory } from "./directory";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">How long until your own OAuth app is live?</h1>
        <p className="max-w-2xl text-muted-foreground">
          Moving off Composio managed auth before launch? Each guide gives a Runway level from R0 (minutes) to R5 (gated),
          hands-on effort and approval wait shown separately, what will block you, and which steps a browser agent can do for you.
          Every claim carries its evidence.
        </p>
      </section>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the directory…</p>}>
        <DirectoryData />
      </Suspense>
    </div>
  );
}

async function DirectoryData() {
  return <Directory items={await listDirectory()} />;
}
