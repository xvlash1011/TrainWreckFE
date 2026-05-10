// api.ts
const BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

export interface APIStation {
  Id: number;
  TenGa: string;
  MaGa: string;
  SKeys: string;
  Km: number;
  ThoiGian: string;
}

export interface OverpassNode {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: {
    name?: string;
    "name:en"?: string;
    railway?: string;
    [key: string]: string | undefined;
  };
}

export interface OverpassWay {
  type: string;
  id: number;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  type: string;
  features: any[];
}

export interface TrainSchedule {
  tauId: number;
  trainCode: string; // e.g., SE1, TN2
  stations: Array<{
    stationName: string;
    stationCode: string;
    arrivalTime: string;
    departureTime: string;
  }>;
  occupancy?: number | null;
}

export async function fetchVNTicketStations(): Promise<MappedStation[]> {
  try {
    const response = await fetch(`${BASE_URL}/api/stations`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.filter((d: any) => !!d.lat).map((d: any) => ({
      id: d.Id, name: d.TenGa, code: d.MaGa, lat: d.lat, lng: d.lon
    }));
  } catch (error) {
    console.error("Failed to fetch hydrated stations.", error);
    return [];
  }
}

export async function fetchVietnamTracksAndStations(): Promise<OverpassResponse | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/tracks`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch offline geojson tracks from backend.", error);
    return null;
  }
}

export async function fetchRealtimeSchedules(): Promise<TrainSchedule[]> {
  try {
    const response = await fetch(`${BASE_URL}/api/schedule`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json() as TrainSchedule[];
  } catch (error) {
    console.error("Failed to fetch collision-free schedules.", error);
    return [];
  }
}

// Normalized station type for the UI
export interface MappedStation {
  id: number | string;
  name: string;
  code?: string;
  lat: number;
  lng: number;
  isMissingFromAPI?: boolean; // T if present in overpass but not in API
}
