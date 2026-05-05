import { useRef, useState } from "react";

interface CsvUploadPromptProps {
  onUpload: (csvText: string) => Promise<number>;
  user?: { displayName: string | null; email: string | null } | null;
  onSignOut?: () => Promise<void>;
}

export function CsvUploadPrompt({ onUpload, user, onSignOut }: CsvUploadPromptProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        onUpload(text)
          .catch(() => setError("Failed to parse CSV — make sure it's a Redfin favorites export."))
          .finally(() => setLoading(false));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="csv-prompt-screen">
      <div className="csv-prompt-card">
        <div className="csv-prompt-icon">&#127968;</div>
        <h1 className="csv-prompt-title">Open House Planner</h1>
        <p className="csv-prompt-body">
          Upload your Redfin favorites CSV to get started. Go to your Redfin favorites page,
          click <strong>Download all (CSV)</strong>, then upload it here.
        </p>
        <div className="csv-prompt-actions">
          <button
            className="csv-prompt-btn csv-prompt-btn--primary"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
          >
            {loading ? <span className="csv-prompt-spinner" /> : null}
            {loading ? "Loading\u2026" : "Upload CSV"}
          </button>
          <a
            className="csv-prompt-btn csv-prompt-btn--secondary"
            href="https://www.redfin.com/myredfin/favorites"
            target="_blank"
            rel="noreferrer"
          >
            Open Redfin Favorites &#8599;
          </a>
        </div>
        {error && <p className="csv-prompt-error">{error}</p>}
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
        {user && onSignOut && (
          <p className="csv-prompt-signout">
            Signed in as {user.displayName ?? user.email}.{" "}
            <button className="csv-prompt-signout-btn" onClick={onSignOut}>Sign out</button>
          </p>
        )}
      </div>
    </div>
  );
}
