import { useEffect, useState } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import length from '@turf/length';
import along from '@turf/along';
import { lineString } from '@turf/helpers';
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

const segmentCache = new Map<string, Feature<LineString> | null>();

export function getTrackSegment(latA: number, lonA: number, latB: number, lonB: number): Feature<LineString> | null {
  const cacheKey = `${latA},${lonA}-${latB},${lonB}`;
  if (segmentCache.has(cacheKey)) return segmentCache.get(cacheKey)!;

  // Use our Pre-computed graph stitched from Overpass
  const path = globalTrackGraph.findShortestPath([lonA, latA], [lonB, latB]);
  
  if (!path) {
    // Ultimate spatial fallback
    const fallback = lineString([[lonA, latA], [lonB, latB]]);
    segmentCache.set(cacheKey, fallback);
    return fallback;
  }

  segmentCache.set(cacheKey, path);
  return path;
}

export function calculateTrainPosition(
  train: TrainProps['train'],
  stationsGeo: Array<{ MaGa: string; lat: number; lon: number }>,
  currentTime: Date
): [number, number] | null {
  const t = currentTime.getTime();
  
  let currentStation = null;
  let nextStation = null;

  const firstStopArr = new Date(train.stations[0].departureTime).getTime();
  if (t < firstStopArr - 10 * 60 * 1000) return null;
  if (t >= firstStopArr - 10 * 60 * 1000 && t < firstStopArr) {
     currentStation = train.stations[0];
     nextStation = train.stations[0];
  }

  const lastStopArr = new Date(train.stations[train.stations.length - 1].arrivalTime).getTime();
  if (t > lastStopArr + 10 * 60 * 1000) return null;
  if (t >= lastStopArr && t <= lastStopArr + 10 * 60 * 1000) {
     currentStation = train.stations[train.stations.length - 1];
     nextStation = train.stations[train.stations.length - 1];
  }

  if (!currentStation) {
    for (let i = 0; i < train.stations.length - 1; i++) {
      const sCurrent = train.stations[i];
      const sNext = train.stations[i+1];
      const depTime = new Date(sCurrent.departureTime).getTime();
      const arrTime = new Date(sNext.arrivalTime).getTime();

      if (t >= new Date(sCurrent.arrivalTime).getTime() && t <= depTime) {
        currentStation = sCurrent;
        nextStation = sCurrent;
        break;
      }

      if (t > depTime && t < arrTime) {
        currentStation = sCurrent;
        nextStation = sNext;
        break;
      }
    }
  }

  if (!currentStation || !nextStation) return null;

  const startGeo = stationsGeo.find(s => s.MaGa === currentStation.stationCode);
  const endGeo = stationsGeo.find(s => s.MaGa === nextStation.stationCode);

  if (!startGeo || !endGeo) return null;

  if (currentStation === nextStation) {
    return [startGeo.lat, startGeo.lon];
  } else {
    const depTime = new Date(currentStation.departureTime).getTime();
    const arrTime = new Date(nextStation.arrivalTime).getTime();
    const percent = (t - depTime) / (arrTime - depTime);

    const trackFeature = getTrackSegment(startGeo.lat, startGeo.lon, endGeo.lat, endGeo.lon);
    if (trackFeature) {
       const segmentLength = length(trackFeature, { units: 'kilometers' });
       const distTraveled = percent * segmentLength;
       
       const curPoint = along(trackFeature, distTraveled, { units: 'kilometers' });
       const [lng, lat] = curPoint.geometry.coordinates;
       return [lat, lng];
    }
  }
  return null;
}

export function TrainMarker({ train, geoTracks, stationsGeo, currentTime, onSelect, onActiveChange }: TrainProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);

  useEffect(() => {
    setPosition(calculateTrainPosition(train, stationsGeo, currentTime));
  }, [currentTime, train, geoTracks, stationsGeo]);

  useEffect(() => {
    if (onActiveChange) {
      onActiveChange(!!position);
    }
  }, [!!position]);

  if (!position) return null;

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
        <div 
          className="relative drop-shadow-md transition-transform hover:scale-110"
        >
          <svg width="24" height="30" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
            <g fill="#2563eb">
              <rect x="2" y="2" width="36" height="38" rx="8" />
              <path d="M 8 43 L 32 43 L 38 48 L 2 48 Z" />
            </g>
            <g fill="#ffffff">
              <rect x="8" y="10" width="24" height="12" rx="4" />
              <circle cx="13" cy="32" r="4" />
              <circle cx="27" cy="32" r="4" />
            </g>
          </svg>
          
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-white/90 shadow-sm font-bold text-slate-800 px-1.5 py-0.5 rounded text-xs whitespace-nowrap pointer-events-none">
            {train.trainCode}
          </div>
        </div>
      </Marker>
    </>
  );
}
