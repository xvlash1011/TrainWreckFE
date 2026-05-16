import { useEffect, useState, useMemo, useRef } from 'react';
import Map, { Source, Layer, Marker, Popup, NavigationControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchVNTicketStations, fetchVietnamTracksAndStations, fetchRealtimeSchedules } from './api';
import type { TrainSchedule, MappedStation } from './api';
import { TrainMarker, getTrackSegment, calculateTrainPosition } from './TrainMarker';
import type { Feature, LineString, FeatureCollection } from 'geojson';

export default function App() {
  const [stations, setStations] = useState<MappedStation[]>([]);
  const [geoTracks, setGeoTracks] = useState<Feature<LineString>[]>([]);
  const [selectedTrain, setSelectedTrain] = useState<TrainSchedule | null>(null);
  const [schedules, setSchedules] = useState<TrainSchedule[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [trainFilter, setTrainFilter] = useState<'ALL' | 'GROUP_SE' | 'GROUP_LOCAL'>('ALL');
  const mapRef = useRef<MapRef>(null);

  // Real-time Simulation Clock
  const [simTime, setSimTime] = useState<Date>(new Date());

  const [loading, setLoading] = useState(true);
  const [showStations, setShowStations] = useState<boolean>(true);
  const [viewState, setViewState] = useState({
    longitude: 108.206230,
    latitude: 16.047079,
    zoom: 5
  });

  useEffect(() => {
    if (!selectedTrain || !isMenuOpen || !autoScrollEnabled) return;
    const tMs = simTime.getTime();
    let activeIdx = -1;
    
    for (let i = 0; i < selectedTrain.stations.length; i++) {
      const st = selectedTrain.stations[i];
      const arr = new Date(st.arrivalTime).getTime();
      const dep = new Date(st.departureTime).getTime();
      
      if (tMs >= arr && tMs <= dep) {
        activeIdx = i;
        break;
      }
      if (i < selectedTrain.stations.length - 1) {
        const nextArr = new Date(selectedTrain.stations[i + 1].arrivalTime).getTime();
        if (tMs > dep && tMs < nextArr) {
          activeIdx = i;
          break;
        }
      }
    }

    if (activeIdx !== -1) {
      const elMobile = document.getElementById(`station-mobile-${activeIdx}`);
      const elDesktop = document.getElementById(`station-desktop-${activeIdx}`);
      if (elMobile && window.innerWidth < 768) {
        elMobile.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        setAutoScrollEnabled(false);
      } else if (elDesktop && window.innerWidth >= 768) {
        elDesktop.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setAutoScrollEnabled(false);
      }
    }
  }, [selectedTrain, simTime, isMenuOpen, autoScrollEnabled]);

  useEffect(() => {
    setAutoScrollEnabled(true);
  }, [selectedTrain]);

  const activeSchedules = useMemo(() => {
    const tMs = simTime.getTime();
    return schedules.filter(t => {
      if (!t.stations || t.stations.length === 0) return false;
      const first = new Date(t.stations[0].departureTime).getTime();
      const last = new Date(t.stations[t.stations.length - 1].arrivalTime).getTime();
      return tMs >= (first - 10 * 60 * 1000) && tMs <= (last + 10 * 60 * 1000);
    });
  }, [schedules, simTime]);

  const flyToTrain = (t: TrainSchedule, allStations: MappedStation[]) => {
    if (!mapRef.current) return;
    const stationsGeo = allStations.map(s => ({ MaGa: s.code!, lat: s.lat, lon: s.lng }));
    
    // Attempt to calculate exact real-time position
    const pos = calculateTrainPosition(t as any, stationsGeo, simTime);
    if (pos) {
      mapRef.current.flyTo({
        center: [pos[1], pos[0]], // [lng, lat]
        zoom: 13,
        duration: 2500
      });
    } else {
      // Fallback to first station
      const targetStation = t.stations[0];
      const fullSt = allStations.find(s => s.code === targetStation.stationCode);
      if (fullSt) {
        mapRef.current.flyTo({
          center: [fullSt.lng, fullSt.lat],
          zoom: 9,
          duration: 2500
        });
      }
    }
  };

  const MAJOR_STATIONS = useMemo(() => new Set([
    'Hà Nội', 'Phủ Lý', 'Nam Định', 'Ninh Bình', 'Thanh Hoá', 'Thanh Hóa', 'Vinh', 'Yên Trung', 'Hương Phố', 
    'Đồng Lê', 'Đồng Hới', 'Đông Hà', 'Huế', 'Đà Nẵng', 'Tam Kỳ', 'Quảng Ngãi', 'Diêu Trì', 
    'Tuy Hoà', 'Tuy Hòa', 'Nha Trang', 'Tháp Chàm', 'Bình Thuận', 'Long Khánh', 'Biên Hoà', 'Biên Hòa', 'Sài Gòn',
    'Hải Phòng', 'Lào Cai', 'Lạng Sơn'
  ]), []);

  // 1. Fetch all static geometry and schedules on load
  useEffect(() => {
    async function init() {
      setLoading(true);

      const s = await fetchVNTicketStations();
      setStations(s);

      const overpass = await fetchVietnamTracksAndStations();
      const features: Feature<LineString>[] = [];
      if (overpass?.features) {
        overpass.features.forEach((feat: any) => {
          if (feat.geometry?.type === 'LineString') {
            features.push(feat);
          }
        });

        // Eagerly pre-compute routing graph connecting 10k segments for physics calculations
        import('./trackRouting').then(({ globalTrackGraph }) => {
          globalTrackGraph.buildGraph(features);
        });
      }
      setGeoTracks(features);

      // Fetch dynamic schedules (from Node backend)
      const sched = await fetchRealtimeSchedules();
      setSchedules(sched);
      
      const seTrains = sched.filter((t: TrainSchedule) => t.trainCode.toUpperCase().startsWith('SE'));
      if (seTrains.length > 0) {
        const rand = seTrains[Math.floor(Math.random() * seTrains.length)];
        setSelectedTrain(rand);
        setTimeout(() => flyToTrain(rand, s), 500);
      }

      setLoading(false);
    }
    init();

    // 3. Refresh schedules every 15 minutes
    const fetchInterval = setInterval(async () => {
      try {
        const sched = await fetchRealtimeSchedules();
        setSchedules(sched);
      } catch (err) {
        console.error('Failed to refresh schedules', err);
      }
    }, 15 * 60 * 1000);

    return () => clearInterval(fetchInterval);
  }, []);

  // 2. Real-time Simulation Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setSimTime(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const tracksGeoJson: FeatureCollection = useMemo(() => {
    if (selectedTrain) {
      const features: Feature<LineString>[] = [];
      for (let i = 0; i < selectedTrain.stations.length - 1; i++) {
        const sCurrent = selectedTrain.stations[i];
        const sNext = selectedTrain.stations[i+1];
        const stA = stations.find(s => s.code === sCurrent.stationCode);
        const stB = stations.find(s => s.code === sNext.stationCode);
        if (stA && stB) {
          const seg = getTrackSegment(stA.lat, stA.lng, stB.lat, stB.lng);
          if (seg) features.push(seg);
        }
      }
      return { type: 'FeatureCollection', features };
    }
    return {
      type: 'FeatureCollection',
      features: geoTracks
    };
  }, [geoTracks, selectedTrain, stations]);

  const visibleStations = useMemo(() => {
    if (!showStations) return [];
    
    let stList = stations;
    if (selectedTrain) {
       const trainStationCodes = new Set(selectedTrain.stations.map(s => s.stationCode));
       stList = stations.filter(s => s.code && trainStationCodes.has(s.code));
    }
    
    return stList.filter(s => {
      if (viewState.zoom > 7) return true;
      return MAJOR_STATIONS.has(s.name);
    });
  }, [stations, selectedTrain, showStations, viewState.zoom, MAJOR_STATIONS]);

  const [stationPopupInfo, setStationPopupInfo] = useState<MappedStation | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white text-xl">
        Đang tải hệ thống mô phỏng...
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative font-sans">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        mapStyle={{
          version: 8,
          sources: {
            'osm-tiles': {
              type: 'raster',
              tiles: [
                'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=vi'
              ],
              tileSize: 256,
              attribution: 'Map data © Google'
            }
          },
          layers: [
            {
              id: 'osm-tiles',
              type: 'raster',
              source: 'osm-tiles',
              minzoom: 0,
              maxzoom: 19
            }
          ]
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="bottom-left" />

        <Source id="tracks" type="geojson" data={tracksGeoJson}>
          <Layer
            id="track-glow"
            type="line"
            paint={{
              'line-color': '#ff4d4d',
              'line-width': 8,
              'line-opacity': 0.2,
              'line-blur': 4
            }}
          />
          <Layer
            id="track-lines"
            type="line"
            paint={{
              'line-color': '#e11d48',
              'line-width': 3,
              'line-opacity': 0.8
            }}
          />
        </Source>

        {/* Highlight Vietnam's Islands */}
        <Marker longitude={111.9774} latitude={16.5413} anchor="center">
          <div className="flex flex-col items-center select-none pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-red-500 border border-white mb-1 shadow-sm" />
            <div className="text-slate-700 text-[10px] font-bold text-center bg-white/70 px-1.5 py-0.5 rounded backdrop-blur-sm border border-slate-200/50">
              Quần đảo Hoàng Sa<br/>(Việt Nam)
            </div>
          </div>
        </Marker>
        <Marker longitude={114.2144} latitude={9.8661} anchor="center">
          <div className="flex flex-col items-center select-none pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-red-500 border border-white mb-1 shadow-sm" />
            <div className="text-slate-700 text-[10px] font-bold text-center bg-white/70 px-1.5 py-0.5 rounded backdrop-blur-sm border border-slate-200/50">
              Quần đảo Trường Sa<br/>(Việt Nam)
            </div>
          </div>
        </Marker>

        {visibleStations.map(st => (
          <Marker
            key={st.code}
            longitude={st.lng}
            latitude={st.lat}
            anchor="center"
          >
            <div 
              className="bg-white border-2 border-black rounded-full cursor-pointer hover:bg-gray-200 transition-colors"
              style={{ width: '10px', height: '10px' }}
              onClick={(e) => {
                e.stopPropagation();
                setStationPopupInfo(st);
              }}
            />
          </Marker>
        ))}

        {stationPopupInfo && (
          <Popup
            longitude={stationPopupInfo.lng}
            latitude={stationPopupInfo.lat}
            closeOnClick={false}
            onClose={() => setStationPopupInfo(null)}
            anchor="bottom"
          >
            <strong>{stationPopupInfo.name} ({stationPopupInfo.code})</strong>
            <div className="text-xs text-gray-500 mt-1">
              Tọa độ: {stationPopupInfo.lat.toFixed(4)}, {stationPopupInfo.lng.toFixed(4)}
            </div>
          </Popup>
        )}

        {schedules
          .filter(train => {
            if (selectedTrain) return train.tauId === selectedTrain.tauId;
            if (trainFilter === 'GROUP_SE') return train.trainCode.toUpperCase().startsWith('SE');
            if (trainFilter === 'GROUP_LOCAL') return !train.trainCode.toUpperCase().startsWith('SE');
            return true; // ALL
          })
          .map((train, i) => (
          <TrainMarker
            key={`${train.trainCode}-${train.tauId}-${i}`}
            train={{ ...train, isPriority: train.trainCode.toUpperCase().startsWith('SE') }}
            geoTracks={geoTracks}
            stationsGeo={stations.map(s => ({ MaGa: s.code!, lat: s.lat, lon: s.lng }))}
            currentTime={simTime}
            onSelect={() => setSelectedTrain(train)}
            onActiveChange={(isActive) => {}}
          />
        ))}
      </Map>

      {/* Responsive Sidebar / Bottom Sheet UI */}
      <div className={`absolute z-[9999] bg-white text-slate-800 transition-transform duration-300 shadow-2xl flex flex-col overflow-hidden bottom-0 left-0 w-full h-[360px] rounded-t-xl md:rounded-none md:top-0 md:bottom-auto md:h-screen md:w-[400px] md:border-r md:border-slate-200 ${
        isMenuOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:-translate-x-full'
      }`}>
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-slate-100">
          <div className="flex justify-between items-end mb-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight line-clamp-1 mt-1">
                {selectedTrain ? `Tàu ${selectedTrain.trainCode}` : 'Đường sắt Việt Nam'}
              </h1>
            </div>
            <button onClick={() => setIsMenuOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200 shrink-0 ml-2" title="Ẩn Menu">
               ✕
            </button>
          </div>

          <div className="bg-[#f05a5a] rounded-xl p-3 text-white shadow-lg shadow-red-500/20 mb-1">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                <div className="w-full md:w-1/2">
                  <label className="text-[10px] md:text-xs font-medium text-white/80 uppercase tracking-wider mb-1 block">Chọn chuyến tàu</label>
                  <select 
                    className="w-full bg-white/20 border-0 rounded-lg text-white font-semibold py-1.5 px-3 focus:ring-0 outline-none cursor-pointer"
                    value={selectedTrain ? selectedTrain.tauId.toString() : trainFilter}
                    onChange={(e) => {
                       const val = e.target.value;
                       if (val === 'ALL' || val === 'GROUP_SE' || val === 'GROUP_LOCAL') {
                         setSelectedTrain(null);
                         setTrainFilter(val as any);
                       } else {
                         const t = schedules.find(x => x.tauId.toString() === val);
                         if (t) {
                           setSelectedTrain(t);
                           setTrainFilter('ALL');
                           flyToTrain(t, stations);
                         }
                       }
                    }}
                  >
                    <option value="ALL" className="text-black">Tất cả các tàu đang chạy</option>
                    <option value="GROUP_SE" className="text-black font-bold">-- Chỉ hiện Tàu Bắc Nam (SE) --</option>
                    <option value="GROUP_LOCAL" className="text-black font-bold">-- Chỉ hiện Tàu Địa Phương --</option>
                    <optgroup label="Tàu Bắc Nam (SE)" className="text-black">
                      {activeSchedules.filter(t => t.trainCode.toUpperCase().startsWith('SE')).map(t => (
                        <option key={t.tauId} value={t.tauId.toString()}>{t.trainCode}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Tàu Địa Phương" className="text-black">
                      {activeSchedules.filter(t => !t.trainCode.toUpperCase().startsWith('SE')).map(t => (
                        <option key={t.tauId} value={t.tauId.toString()}>{t.trainCode}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
             </div>
          </div>
        </div>

        {selectedTrain ? (
          <>
            <div className="flex md:hidden flex-1 w-full overflow-x-auto overflow-y-hidden px-6 py-2 custom-scrollbar bg-slate-50 items-start gap-4">
              {selectedTrain.stations.map((stop, sIdx) => {
                const arrTime = new Date(stop.arrivalTime).getTime();
                const depTime = new Date(stop.departureTime).getTime();
                const tMs = simTime.getTime();
                let isActive = tMs >= arrTime && tMs <= depTime;
                let isTravelingToNext = sIdx < selectedTrain.stations.length - 1 && tMs > depTime && tMs < new Date(selectedTrain.stations[sIdx + 1].arrivalTime).getTime();
                let durationStr = depTime > arrTime ? (Math.round((depTime - arrTime) / 60000) > 60 ? `${Math.floor(Math.round((depTime - arrTime) / 60000) / 60)} giờ ${Math.round((depTime - arrTime) / 60000) % 60} phút` : `${Math.round((depTime - arrTime) / 60000)} phút`) : '';
                return (
                  <div key={sIdx} id={`station-mobile-${sIdx}`} className="relative min-w-[260px] flex-shrink-0 pt-6 h-full">
                    <div className={`absolute left-4 top-[7px] w-3.5 h-3.5 rounded-full border-2 transition-colors duration-300 z-10 ${isActive ? 'bg-red-500 border-red-200 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : (tMs > arrTime ? 'bg-slate-300 border-slate-100' : 'bg-white border-slate-300')}`}></div>
                    {sIdx < selectedTrain.stations.length - 1 && (
                      <div className={`absolute left-8 top-[13px] w-[calc(100%-0.5rem)] h-[3px] transition-colors duration-300 ${isTravelingToNext ? 'bg-red-400 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : (tMs > depTime ? 'bg-slate-300' : 'bg-slate-200')}`}></div>
                    )}
                    <div className={`flex flex-col p-3 pb-4 rounded-xl transition-all duration-300 ${isActive ? 'bg-red-50 border border-red-100 shadow-sm' : isTravelingToNext ? 'bg-blue-50/50 border border-blue-100/50' : 'bg-white border border-slate-100 shadow-sm'}`}>
                        <h3 className={`text-base font-bold truncate ${isActive ? 'text-red-600' : isTravelingToNext ? 'text-blue-600' : 'text-slate-700'}`}>
                          {stop.stationName || `Ga ${stop.stationCode}`} <span className="text-[10px] font-mono ml-1 opacity-50">{stop.stationCode}</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-2 text-[11px] mt-2">
                          <div>
                            <p className="text-slate-400 mb-0.5 uppercase tracking-wider scale-90 origin-left">Đến</p>
                            <p className="font-mono text-slate-700 font-medium">{new Date(stop.arrivalTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-0.5 uppercase tracking-wider scale-90 origin-left">Đi</p>
                            <p className="font-mono text-slate-700 font-medium">{new Date(stop.departureTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                        <div className="mt-auto">
                          {durationStr && (
                            <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">Thời gian dừng</span>
                              <span className="text-[10px] font-semibold text-slate-600">{durationStr}</span>
                            </div>
                          )}
                          {isTravelingToNext && (
                            <div className="mt-2 py-1.5 px-2 bg-blue-50 rounded text-[10px] animate-pulse flex items-center gap-1.5 truncate">
                              <div className="w-1 h-1 bg-blue-500 rounded-full shrink-0"></div>
                              <span className="text-blue-600 font-medium truncate">Đang hướng đến {selectedTrain.stations[sIdx + 1].stationName}</span>
                            </div>
                          )}
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:flex flex-1 w-full overflow-x-hidden overflow-y-auto px-6 py-6 custom-scrollbar bg-slate-50 flex-col relative">
              <div className="border-l-2 border-red-200 pl-6 ml-2 space-y-6 pb-6 relative">
                {selectedTrain.stations.map((stop, sIdx) => {
                  const arrTime = new Date(stop.arrivalTime).getTime();
                  const depTime = new Date(stop.departureTime).getTime();
                  const tMs = simTime.getTime();
                  let isActive = tMs >= arrTime && tMs <= depTime;
                  let isTravelingToNext = sIdx < selectedTrain.stations.length - 1 && tMs > depTime && tMs < new Date(selectedTrain.stations[sIdx + 1].arrivalTime).getTime();
                  let durationStr = depTime > arrTime ? (Math.round((depTime - arrTime) / 60000) > 60 ? `${Math.floor(Math.round((depTime - arrTime) / 60000) / 60)} giờ ${Math.round((depTime - arrTime) / 60000) % 60} phút` : `${Math.round((depTime - arrTime) / 60000)} phút`) : '';
                  return (
                    <div key={sIdx} id={`station-desktop-${sIdx}`} className="relative">
                      <div className={`absolute -left-[33px] top-1.5 w-4 h-4 rounded-full border-2 transition-colors duration-300 z-10 ${isActive ? 'bg-red-500 border-red-200 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : (tMs > arrTime ? 'bg-slate-300 border-slate-100' : 'bg-white border-slate-300')}`}></div>
                      {sIdx < selectedTrain.stations.length - 1 && (
                        <div className={`absolute -left-[26px] top-6 w-[3px] h-[calc(100%+0.5rem)] transition-colors duration-300 ${isTravelingToNext ? 'bg-red-400 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-transparent'}`}></div>
                      )}
                      <div className={`p-4 rounded-xl transition-all duration-300 ${isActive ? 'bg-red-50 border border-red-100 shadow-sm' : isTravelingToNext ? 'bg-blue-50/50 border border-blue-100/50' : 'bg-white border border-slate-100 shadow-sm hover:bg-slate-50'}`}>
                        <h3 className={`shrink-0 text-lg font-bold mb-1.5 ${isActive ? 'text-red-600' : isTravelingToNext ? 'text-blue-600' : 'text-slate-700'}`}>
                          {stop.stationName || `Ga ${stop.stationCode}`} <span className="text-xs font-mono ml-2 opacity-50">{stop.stationCode}</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                          <div>
                            <p className="text-slate-400 mb-0.5 text-[11px] uppercase tracking-wider">Đến ga</p>
                            <p className="font-mono text-slate-700 font-medium">{new Date(stop.arrivalTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-0.5 text-[11px] uppercase tracking-wider">Khởi hành</p>
                            <p className="font-mono text-slate-700 font-medium">{new Date(stop.departureTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                        {durationStr && (
                          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">Thời gian dừng</span>
                            <span className="text-xs font-semibold text-slate-600">{durationStr}</span>
                          </div>
                        )}
                        {isTravelingToNext && (
                          <div className="mt-3 py-2 px-3 bg-blue-50 rounded animate-pulse flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></div>
                            <span className="text-xs text-blue-600 font-medium truncate">Đang hướng đến {selectedTrain.stations[sIdx + 1].stationName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
           <div className="flex-1 w-full flex items-center justify-center bg-slate-50">
              <p className="text-slate-400 text-sm font-medium">Vui lòng chọn một chuyến tàu để xem lịch trình</p>
           </div>
        )}
      </div>
      {/* Collapsed thin sidebar on Desktop */}
      {!isMenuOpen && (
        <div className="hidden md:flex absolute z-[9998] left-0 top-0 w-16 h-full bg-[#f8fafc] border-r border-slate-200 flex-col items-center py-6 gap-8 text-slate-400 shadow-lg">
          <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600" title="Hiện Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>
      )}

      {/* Floating Button to Re-open Menu (Mobile only) */}
      {!isMenuOpen && (
        <button
          onClick={() => setIsMenuOpen(true)}
          className="md:hidden absolute z-[9999] top-4 left-4 w-12 h-12 bg-white/95 backdrop-blur-sm border border-slate-200 hover:bg-slate-50 rounded-xl shadow-lg flex items-center justify-center text-slate-700 transition-all"
          title="Hiện Menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
      )}
    </div>
  );
}
