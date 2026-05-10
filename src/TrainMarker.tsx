import { useEffect, useState } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
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

// Icons
const trainSvg = `
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
`;

const trainIcon = L.divIcon({
  html: trainSvg,
  className: 'custom-train-icon drop-shadow-md',
  iconSize: [24, 30],
  iconAnchor: [12, 15]
});

const segmentCache = new Map<string, Feature<LineString> | null>();

function getTrackSegment(latA: number, lonA: number, latB: number, lonB: number): Feature<LineString> | null {
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

export function TrainMarker({ train, geoTracks, stationsGeo, currentTime, onSelect, onActiveChange }: TrainProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState({ speed: 0, nextStation: '', destinationStation: '', eta: '' });

  useEffect(() => {
    // 1. Find the current segment the train is in based on `currentTime`
    const t = currentTime.getTime();
    
    let currentStation = null;
    let nextStation = null;

    // Check if it's before departure
    const firstStopArr = new Date(train.stations[0].departureTime).getTime();
    if (t < firstStopArr - 10 * 60 * 1000) return setPosition(null); // Not spawned yet
    if (t >= firstStopArr - 10 * 60 * 1000 && t < firstStopArr) {
       // Boarding at origin
       currentStation = train.stations[0];
       nextStation = train.stations[0];
    }

    // Check if it's dead
    const lastStopArr = new Date(train.stations[train.stations.length - 1].arrivalTime).getTime();
    if (t > lastStopArr + 10 * 60 * 1000) return setPosition(null); // Killed
    if (t >= lastStopArr && t <= lastStopArr + 10 * 60 * 1000) {
       currentStation = train.stations[train.stations.length - 1];
       nextStation = train.stations[train.stations.length - 1];
    }

    // Otherwise, find the segment
    if (!currentStation) {
      for (let i = 0; i < train.stations.length - 1; i++) {
        const sCurrent = train.stations[i];
        const sNext = train.stations[i+1];
        const depTime = new Date(sCurrent.departureTime).getTime();
        const arrTime = new Date(sNext.arrivalTime).getTime();

        if (t >= new Date(sCurrent.arrivalTime).getTime() && t <= depTime) {
          // Stopped at station i
          currentStation = sCurrent;
          nextStation = sCurrent;
          break;
        }

        if (t > depTime && t < arrTime) {
          // Traveling between i and i+1
          currentStation = sCurrent;
          nextStation = sNext;
          break;
        }
      }
    }

    if (!currentStation || !nextStation) {
      setPosition(null);
      return;
    }

    const startGeo = stationsGeo.find(s => s.MaGa === currentStation.stationCode);
    const endGeo = stationsGeo.find(s => s.MaGa === nextStation.stationCode);

    if (!startGeo || !endGeo) return;

    const finalStationName = train.stations[train.stations.length - 1].stationName;

    if (currentStation === nextStation) {
      // Stopped
      setPosition([startGeo.lat, startGeo.lon]);
      setStatus({ speed: 0, nextStation: currentStation.stationName, destinationStation: finalStationName, eta: 'Đang đón khách/Dừng' });
    } else {
      // Moving
      const depTime = new Date(currentStation.departureTime).getTime();
      const arrTime = new Date(nextStation.arrivalTime).getTime();
      const percent = (t - depTime) / (arrTime - depTime);

      const trackFeature = getTrackSegment(startGeo.lat, startGeo.lon, endGeo.lat, endGeo.lon);
      if (trackFeature) {
         const segmentLength = length(trackFeature, { units: 'kilometers' });
         const distTraveled = percent * segmentLength;
         
         const curPoint = along(trackFeature, distTraveled, { units: 'kilometers' });
         const [lng, lat] = curPoint.geometry.coordinates;
         setPosition([lat, lng]);

         // Estimate speed (km/h)
         const hours = (arrTime - depTime) / (1000 * 60 * 60);
         const speed = segmentLength / hours;

         setStatus({ 
           speed: Math.round(speed), 
           nextStation: nextStation.stationName,
           destinationStation: finalStationName,
           eta: new Date(arrTime).toLocaleTimeString('vi-VN')
         });
      }
    }
  }, [currentTime, train, geoTracks, stationsGeo]);

  useEffect(() => {
    if (onActiveChange) {
      onActiveChange(!!position);
    }
  }, [!!position, onActiveChange]);

  if (!position) return null;

  return (
    <Marker 
      position={position} 
      icon={trainIcon} 
      zIndexOffset={train.isPriority ? 100 : 50}
      eventHandlers={{ click: onSelect }}
    >
      <Tooltip permanent direction="right" offset={[12, 0]} className="bg-white/90 border-none shadow-sm font-bold text-slate-800 px-1.5 py-0.5 rounded text-xs">
        {train.trainCode}
      </Tooltip>
    </Marker>
  );
}
