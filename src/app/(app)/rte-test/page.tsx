import { RichTextEditor } from "@/components/rich-text-editor";

// Isolated mount point for the rich-text-editor e2e spec (auth-gated like
// every (app) route). Not linked from the UI.
export default function RteTestPage() {
  return (
    <div className="container max-w-2xl py-6">
      <h1 className="mb-4 text-xl font-bold">RTE Test</h1>
      <RichTextEditor name="test" placeholder="Test…" />
    </div>
  );
}
