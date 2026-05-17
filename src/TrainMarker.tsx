import { useEffect, useState } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import { globalTrackGraph } from './trackRouting';

interface TrainProps {
  train: {
    trainCode: string;
    isPriority: boolean;
    stations: Array<{
      stationName: string;
      stationCode: string;
      arrivalTime: string;
      departureTime: string;
    }>;
  };
  geoTracks: Feature<LineString>[];
  stationsGeo: Array<{ MaGa: string; lat: number; lon: number }>;
  currentTime: Date;
  onSelect?: () => void;
  onActiveChange?: (isActive: boolean) => void;
}

export interface TrainPositionResult {
  position: [number, number]; // [lat, lng]
  isAtStation: boolean;
}

const segmentCache = new Map<string, Feature<LineString> | null>();

export function getTrackSegment(latA: number, lonA: number, latB: number, lonB: number): Feature<LineString> | null {
  const cacheKey = `${latA},${lonA}-${latB},${lonB}`;
  if (segmentCache.has(cacheKey)) return segmentCache.get(cacheKey)!;

  const path = globalTrackGraph.findShortestPath([lonA, latA], [lonB, latB]);

  if (!path) {
    const fallback = turf.lineString([[lonA, latA], [lonB, latB]]);
    segmentCache.set(cacheKey, fallback);
    return fallback;
  }

  segmentCache.set(cacheKey, path);
  return path;
}

/**
 * Snap a station coordinate to the nearest point on any nearby track segment.
 * This places the stopped train ON the track rather than on the station dot.
 */
function snapToNearestTrack(
  lat: number,
  lon: number,
  geoTracks: Feature<LineString>[]
): [number, number] {
  if (geoTracks.length === 0) return [lat, lon];

  const pt = turf.point([lon, lat]);
  let bestDist = Infinity;
  let bestPos: [number, number] = [lat, lon];

  for (const track of geoTracks) {
    const snapped = turf.nearestPointOnLine(track, pt, { units: 'kilometers' });
    const dist = snapped.properties?.dist ?? Infinity;
    if (dist < bestDist && dist < 1.5) { // only snap if track is within 1.5km
      bestDist = dist;
      const [sLon, sLat] = snapped.geometry.coordinates;
      bestPos = [sLat, sLon];
    }
  }

  return bestPos;
}

export function calculateTrainPosition(
  train: TrainProps['train'],
  stationsGeo: Array<{ MaGa: string; lat: number; lon: number }>,
  currentTime: Date,
  geoTracks?: Feature<LineString>[]
): TrainPositionResult | null {
  const t = currentTime.getTime();

  let currentStation: (typeof train.stations)[0] | null = null;
  let nextStation: (typeof train.stations)[0] | null = null;
  let isAtStation = false;

  const firstStopDep = new Date(train.stations[0].departureTime).getTime();
  if (t < firstStopDep - 10 * 60 * 1000) return null;
  if (t >= firstStopDep - 10 * 60 * 1000 && t < firstStopDep) {
    currentStation = train.stations[0];
    nextStation = train.stations[0];
    isAtStation = true;
  }

  const lastStopArr = new Date(train.stations[train.stations.length - 1].arrivalTime).getTime();
  if (t > lastStopArr + 10 * 60 * 1000) return null;
  if (t >= lastStopArr && t <= lastStopArr + 10 * 60 * 1000) {
    currentStation = train.stations[train.stations.length - 1];
    nextStation = train.stations[train.stations.length - 1];
    isAtStation = true;
  }

  if (!currentStation) {
    for (let i = 0; i < train.stations.length - 1; i++) {
      const sCurrent = train.stations[i];
      const sNext = train.stations[i + 1];
      const arrCurrent = new Date(sCurrent.arrivalTime).getTime();
      const depCurrent = new Date(sCurrent.departureTime).getTime();
      const arrNext = new Date(sNext.arrivalTime).getTime();

      // Train is dwelling at this station
      if (t >= arrCurrent && t <= depCurrent) {
        currentStation = sCurrent;
        nextStation = sCurrent;
        isAtStation = true;
        break;
      }

      // Train is moving to next station
      if (t > depCurrent && t < arrNext) {
        currentStation = sCurrent;
        nextStation = sNext;
        break;
      }
    }
  }

  if (!currentStation || !nextStation) return null;

  const startGeo = stationsGeo.find(s => s.MaGa === currentStation!.stationCode);
  const endGeo = stationsGeo.find(s => s.MaGa === nextStation!.stationCode);

  if (!startGeo || !endGeo) return null;

  if (isAtStation) {
    // Snap to the nearest track point adjacent to the station
    const snapped = geoTracks && geoTracks.length > 0
      ? snapToNearestTrack(startGeo.lat, startGeo.lon, geoTracks)
      : [startGeo.lat, startGeo.lon] as [number, number];
    return { position: snapped, isAtStation: true };
  } else {
    const depTime = new Date(currentStation.departureTime).getTime();
    const arrTime = new Date(nextStation.arrivalTime).getTime();
    const percent = Math.min(1, Math.max(0, (t - depTime) / (arrTime - depTime)));

    const trackFeature = getTrackSegment(startGeo.lat, startGeo.lon, endGeo.lat, endGeo.lon);
    if (trackFeature) {
      const segmentLength = turf.length(trackFeature, { units: 'kilometers' });
      const distTraveled = percent * segmentLength;
      const curPoint = turf.along(trackFeature, distTraveled, { units: 'kilometers' });
      const [lng, lat] = curPoint.geometry.coordinates;
      return { position: [lat, lng], isAtStation: false };
    }
  }

  return null;
}

export function TrainMarker({ train, geoTracks, stationsGeo, currentTime, onSelect, onActiveChange }: TrainProps) {
  const [result, setResult] = useState<TrainPositionResult | null>(null);

  useEffect(() => {
    setResult(calculateTrainPosition(train, stationsGeo, currentTime, geoTracks));
  }, [currentTime, train, geoTracks, stationsGeo]);

  useEffect(() => {
    if (onActiveChange) {
      onActiveChange(!!result);
    }
  }, [!!result]);

  if (!result) return null;

  const { position, isAtStation } = result;
  const iconColor = isAtStation ? '#dc2626' : (train.isPriority ? '#2563eb' : '#1d4ed8');
  const labelBg = isAtStation
    ? 'bg-red-50 border border-red-200 text-red-700'
    : 'bg-white/90 text-slate-800';

  return (
    <>
      <Marker
        longitude={position[1]}
        latitude={position[0]}
        anchor="center"
        style={{ zIndex: train.isPriority ? 100 : 50, cursor: 'pointer' }}
        onClick={(e) => {
          e.originalEvent.stopPropagation();
          onSelect?.();
        }}
      >
        <div className="relative drop-shadow-md transition-transform hover:scale-110">
          <svg width="24" height="30" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
            <g fill={iconColor} style={{ transition: 'fill 0.4s ease' }}>
              <rect x="2" y="2" width="36" height="38" rx="8" />
              <path d="M 8 43 L 32 43 L 38 48 L 2 48 Z" />
            </g>
            <g fill="#ffffff">
              <rect x="8" y="10" width="24" height="12" rx="4" />
              <circle cx="13" cy="32" r="4" />
              <circle cx="27" cy="32" r="4" />
            </g>
            {isAtStation && (
              // Amber dot on top of icon to indicate dwell state
              <circle cx="20" cy="6" r="4" fill="#fbbf24" />
            )}
          </svg>

          <div className={`absolute left-full top-1/2 -translate-y-1/2 ml-2 shadow-sm font-bold px-1.5 py-0.5 rounded text-xs whitespace-nowrap pointer-events-none ${labelBg}`}>
            {train.trainCode}
          </div>
        </div>
      </Marker>
    </>
  );
}
