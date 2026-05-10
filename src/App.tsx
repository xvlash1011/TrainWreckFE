import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchVNTicketStations, fetchVietnamTracksAndStations, fetchRealtimeSchedules } from './api';
import type { TrainSchedule, MappedStation } from './api';
import { TrainMarker } from './TrainMarker';
import type { Feature, LineString } from 'geojson';
import L from 'leaflet';

// Fix leaflet default icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const stationIcon = L.divIcon({
  html: `<div style="background-color: white; border: 2px solid black; width: 10px; height: 10px; border-radius: 50%;"></div>`,
  className: '',
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});

export default function App() {
  const [stations, setStations] = useState<MappedStation[]>([]);
  const [rawTracks, setRawTracks] = useState<[number, number][][]>([]);
  const [geoTracks, setGeoTracks] = useState<Feature<LineString>[]>([]);
  const [selectedTrain, setSelectedTrain] = useState<TrainSchedule | null>(null);
  const [activeTrains, setActiveTrains] = useState<Set<string>>(new Set());
  const [schedules, setSchedules] = useState<TrainSchedule[]>([]);

  // Real-time Simulation Clock
  const [simTime, setSimTime] = useState<Date>(new Date());

  const [loading, setLoading] = useState(true);

  // 1. Fetch all static geometry and schedules on load
  useEffect(() => {
    async function init() {
      setLoading(true);

      const s = await fetchVNTicketStations();
      setStations(s);

      const overpass = await fetchVietnamTracksAndStations();
      const features: Feature<LineString>[] = [];
      const lines: [number, number][][] = [];

      if (overpass?.features) {
        overpass.features.forEach((feat: any) => {
          if (feat.geometry?.type === 'LineString') {
            // GeoJSON is [lon, lat], Leaflet expects [lat, lon]
            const geom = feat.geometry.coordinates.map((pt: any) => [pt[1], pt[0]]);
            lines.push(geom);
            features.push(feat);
          }
        });

        // Eagerly pre-compute routing graph connecting 10k segments for physics calculations
        import('./trackRouting').then(({ globalTrackGraph }) => {
          globalTrackGraph.buildGraph(features);
        });
      }
      setGeoTracks(features);
      setRawTracks(lines);

      // Fetch dynamic schedules (from Node backend)
      const sched = await fetchRealtimeSchedules();
      setSchedules(sched);

      setLoading(false);
    }
    init();
  }, []);

  // 2. Real-time Simulation Loop (Update every 20 seconds, or 1 second for fast simulation)
  useEffect(() => {
    // We update our UI state simulation clock every 5 seconds for smooth movement
    const interval = setInterval(() => {
      // In a pure real-time app, this matches standard Date.now.
      // E.g. Date.now() in GMT+7. (Browser locale handles it, or force offset if needed)
      setSimTime(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white text-xl">
        Đang tải hệ thống mô phỏng...
      </div>
    );
  }


    return (
      <div className="w-full h-screen relative font-sans">
        <div className="absolute top-4 left-4 z-[1000] bg-white text-black p-4 rounded-lg shadow-lg border-l-4 border-blue-500">
          <h1 className="text-xl font-bold mb-1">Đường sắt Việt Nam Trực tuyến</h1>
          <p className="text-sm text-gray-600 font-mono">
            Thời gian: {simTime.toLocaleString('vi-VN')}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Đang theo dõi {activeTrains.size} tàu đang chạy.
          </p>
        </div>

      <MapContainer
        center={[16.047079, 108.206230]}
        zoom={6}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          attribution='&copy; OSM'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Physical Railway Lines */}
        {rawTracks.map((pts, idx) => (
          <Polyline
            key={idx}
            positions={pts}
            pathOptions={{ color: 'red', weight: 3, opacity: 0.6 }}
          />
        ))}

        {/* Train Stations */}
        {stations.map(st => (
          <Marker
            key={st.code}
            position={[st.lat, st.lng]}
            icon={stationIcon}
          >
            <Popup>
              <strong>{st.name} ({st.code})</strong>
              <div className="text-xs text-gray-500 mt-1">
                Tọa độ: {st.lat.toFixed(4)}, {st.lng.toFixed(4)}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Simulated Trains */}
        {schedules.map((train, i) => (
          <TrainMarker
            key={`${train.trainCode}-${train.tauId}-${i}`}
            train={{ ...train, isPriority: train.trainCode.toUpperCase().startsWith('SE') }}
            geoTracks={geoTracks}
            stationsGeo={stations.map(s => ({ MaGa: s.code!, lat: s.lat, lon: s.lng }))}
            currentTime={simTime}
            onSelect={() => setSelectedTrain(train)}
            onActiveChange={(isActive) => {
              setActiveTrains(prev => {
                const next = new Set(prev);
                const k = train.tauId.toString();
                if (isActive) next.add(k);
                else next.delete(k);
                return next;
              });
            }}
          />
        ))}

      </MapContainer>

      {/* Right Interactive Sidebar */}
      {selectedTrain && (
        <div className="absolute top-0 right-0 w-80 md:w-96 h-full bg-slate-900/95 backdrop-blur-xl shadow-2xl z-[9999] flex flex-col text-slate-100 overflow-hidden border-l border-slate-700">
          <div className="flex items-center justify-between px-6 py-5 bg-slate-800/80 border-b border-slate-700">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                🚆 {selectedTrain.trainCode}
              </h2>
              <span className="text-sm text-slate-400 mt-1 block">Lịch trình hành trình</span>
            </div>
            <button
              onClick={() => setSelectedTrain(null)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar">
            <div className="relative border-l-2 border-slate-700/50 pl-6 ml-4 space-y-8">
              {selectedTrain.stations.map((stop, sIdx) => {
                const arrTime = new Date(stop.arrivalTime).getTime();
                const depTime = new Date(stop.departureTime).getTime();
                const tMs = simTime.getTime();

                // Active State logic
                let isActive = false;
                let isTravelingToNext = false;

                if (tMs >= arrTime && tMs <= depTime) {
                  isActive = true; // Train is actively standing exactly at this station
                } else if (
                  sIdx < selectedTrain.stations.length - 1 &&
                  tMs > depTime &&
                  tMs < new Date(selectedTrain.stations[sIdx + 1].arrivalTime).getTime()
                ) {
                  isTravelingToNext = true; // Train is traveling from this station to the next
                }

                // Stop duration
                let durationStr = '';
                if (depTime > arrTime) {
                  const mm = Math.round((depTime - arrTime) / 60000);
                  durationStr = mm > 60 ? `${Math.floor(mm / 60)} giờ ${mm % 60} phút` : `${mm} phút`;
                }

                return (
                  <div key={sIdx} className="relative">
                    {/* Glowing timeline dot */}
                    <div className={`absolute -left-[35px] top-1.5 w-4 h-4 rounded-full border-2 transition-colors duration-300 ${isActive ? 'bg-green-500 border-green-200 shadow-[0_0_15px_rgba(34,197,94,0.7)]' :
                        (tMs > arrTime ? 'bg-slate-500 border-slate-400' : 'bg-slate-800 border-slate-600')
                      }`}></div>

                    {/* Timeline connection line (highlighted when traveling) */}
                    {sIdx < selectedTrain.stations.length - 1 && (
                      <div className={`absolute -left-[28px] top-6 w-0.5 h-[calc(100%+0.5rem)] transition-colors duration-300 ${isTravelingToNext ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-transparent'}`}></div>
                    )}

                    <div className={`p-4 rounded-xl transition-all duration-300 ${isActive ? 'bg-green-500/10 border border-green-500/30 shadow-lg' :
                        isTravelingToNext ? 'bg-blue-500/5 border border-blue-500/20' :
                          'bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50'
                      }`}>
                      <h3 className={`text-lg font-bold mb-2 ${isActive ? 'text-green-400' : isTravelingToNext ? 'text-blue-400' : 'text-slate-200'}`}>
                        {stop.stationName} <span className="text-xs font-mono ml-2 opacity-50">{stop.stationCode}</span>
                      </h3>

                      <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                        <div>
                          <p className="text-slate-400 mb-0.5 text-xs uppercase tracking-wider">Đến ga</p>
                          <p className="font-mono text-slate-200">{new Date(stop.arrivalTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-0.5 text-xs uppercase tracking-wider">Khởi hành</p>
                          <p className="font-mono text-slate-200">{new Date(stop.departureTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>

                      {durationStr && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                          <span className="text-xs text-slate-400 flex items-center gap-1.5">
                            ⏱ Thời gian dừng
                          </span>
                          <span className="text-xs font-medium text-amber-400/90">{durationStr}</span>
                        </div>
                      )}

                      {isTravelingToNext && (
                        <div className="mt-3 py-2 px-3 bg-blue-500/10 rounded-lg animate-pulse flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                          <span className="text-xs text-blue-300 font-medium tracking-wide">Đang trên đường đến {selectedTrain.stations[sIdx + 1].stationName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
