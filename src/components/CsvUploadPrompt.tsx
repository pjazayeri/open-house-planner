import { useRef, useState } from "react";
import { CSV_ACCEPT, isIOSDevice, csvInstructions } from "../utils/csvUpload";

interface CsvUploadPromptProps {
  onUpload: (csvText: string) => Promise<number>;
  user?: { displayName: string | null; email: string | null } | null;
  onSignOut?: () => Promise<void>;
  /** Signed-in users can skip the CSV and heart listings from the catalog instead. */
  onSkip?: () => void;
}

export function CsvUploadPrompt({ onUpload, user, onSignOut, onSkip }: CsvUploadPromptProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ios = typeof navigator !== "undefined" && isIOSDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
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
          Upload your Redfin favorites CSV to get started.
        </p>
        <ol className="csv-prompt-steps" aria-label="How to get the CSV">
          {csvInstructions(ios).map((step) => <li key={step}>{step}</li>)}
        </ol>
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
        {onSkip && (
          <button className="csv-prompt-skip" onClick={onSkip}>
            No CSV? <strong>Browse the catalog instead</strong> — every SF listing with an open house, heart the ones you like.
          </button>
        )}
        {error && <p className="csv-prompt-error">{error}</p>}
        <input ref={fileRef} type="file" accept={CSV_ACCEPT} style={{ display: "none" }} onChange={handleFile} />
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
