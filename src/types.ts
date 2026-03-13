export interface RawListing {
  "SALE TYPE": string;
  "SOLD DATE": string;
  "PROPERTY TYPE": string;
  ADDRESS: string;
  CITY: string;
  "STATE OR PROVINCE": string;
  "ZIP OR POSTAL CODE": string;
  PRICE: string;
  BEDS: string;
  BATHS: string;
  LOCATION: string;
  "SQUARE FEET": string;
  "LOT SIZE": string;
  "YEAR BUILT": string;
  "DAYS ON MARKET": string;
  "$/SQUARE FEET": string;
  "HOA/MONTH": string;
  STATUS: string;
  "NEXT OPEN HOUSE START TIME": string;
  "NEXT OPEN HOUSE END TIME": string;
  "URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)": string;
  SOURCE: string;
  "MLS#": string;
  FAVORITE: string;
  INTERESTED: string;
  LATITUDE: string;
  LONGITUDE: string;
}

export type { CapRateBreakdown } from "./utils/capRate";

export interface Listing {
  id: string;
  address: string;
  location: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number | null;
  yearBuilt: number | null;
  daysOnMarket: number | null;
  pricePerSqft: number | null;
  hoa: number | null;
  propertyType: string;
  openHouseStart: Date;
  openHouseEnd: Date;
  url: string;
  lat: number;
  lng: number;
  capRate: number;
  capRateBreakdown: import("./utils/capRate").CapRateBreakdown;
  visitOrder?: number;
  timeSlot?: string;
}

export interface TimeSlotGroup {
  label: string;
  startTime: Date;
  endTime: Date;
  listings: Listing[];
}

export interface VisitRecord {
  visitedAt: string; // ISO datetime string
  liked: boolean | null; // quick thumbs up/down
  rating: number | null; // 1–5 stars, null = no rating yet
  pros: string;
  cons: string;
  wantOffer: boolean;
}
