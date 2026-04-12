import { useState, useEffect } from "react";
import { cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { ListingAmenities } from "../utils/cloudSync";

export function useAmenities() {
  const [amenities, setAmenities] = useState<Record<string, ListingAmenities>>({});

  useEffect(() => {
    cloudFetch().then((s) => setAmenities(s.amenities)).catch(() => {});
  }, []);

  function setAmenity(id: string, field: "parking" | "laundry", value: boolean | undefined) {
    setAmenities((prev) => {
      const next = { ...prev, [id]: { ...prev[id], [field]: value } };
      // Remove key entirely if both fields are undefined
      const entry = next[id];
      if (entry.parking === undefined && entry.laundry === undefined) delete next[id];
      cloudPatch({ amenities: next }).catch(() => {});
      return next;
    });
  }

  return { amenities, setAmenity };
}
