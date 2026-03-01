import { useState, useCallback, useEffect } from "react";
import { JSONBIN_API_KEY, JSONBIN_BIN_ID } from "../config";

const LS_KEY = "open-house-hidden-ids";
const USE_CLOUD = JSONBIN_API_KEY !== "" && JSONBIN_BIN_ID !== "";
const BIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;
const HEADERS = { "X-Access-Key": JSONBIN_API_KEY };

function lsLoad(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function lsSave(ids: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(ids)));
}

async function cloudFetch(): Promise<Set<string>> {
  const res = await fetch(`${BIN_URL}/latest`, { headers: HEADERS });
  if (!res.ok) throw new Error(`JSONBin ${res.status}`);
  const json = await res.json();
  return new Set((json.record?.hiddenIds ?? []) as string[]);
}

async function cloudSave(ids: Set<string>): Promise<void> {
  const res = await fetch(BIN_URL, {
    method: "PUT",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ hiddenIds: Array.from(ids) }),
  });
  if (!res.ok) throw new Error(`JSONBin ${res.status}`);
}

interface UseHiddenIdsResult {
  hiddenIds: Set<string>;
  hide: (id: string) => void;
  clearHidden: () => void;
}

export function useHiddenIds(): UseHiddenIdsResult {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(lsLoad);

  // On mount, pull latest from cloud (overrides local cache)
  useEffect(() => {
    if (!USE_CLOUD) return;
    cloudFetch()
      .then((ids) => {
        setHiddenIds(ids);
        lsSave(ids);
      })
      .catch(() => {
        // Network failure — stay with localStorage values silently
      });
  }, []);

  const persist = useCallback((ids: Set<string>) => {
    lsSave(ids);
    if (USE_CLOUD) {
      cloudSave(ids).catch(() => {}); // fire-and-forget; localStorage already updated
    }
  }, []);

  const hide = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      persist(next);
      return next;
    });
  }, [persist]);

  const clearHidden = useCallback(() => {
    const empty = new Set<string>();
    setHiddenIds(empty);
    persist(empty);
  }, [persist]);

  return { hiddenIds, hide, clearHidden };
}
