const fs = require('fs');
const code = fs.readFileSync('src/App.tsx', 'utf-8').split('\n');
// We know up to line 442 is safe: <div className="mt-auto">
const safeEndIndex = code.findIndex(line => line.includes('<div className="mt-auto">'));
const safeCode = code.slice(0, safeEndIndex + 1);

const rest = `                        {durationStr && (
                          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              Thời gian dừng
                            </span>
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

            {/* DESKTOP: Vertical Scroll */}
            <div className="hidden md:flex flex-1 w-full overflow-x-hidden overflow-y-auto px-6 py-6 custom-scrollbar bg-slate-50 flex-col relative">
              <div className="border-l-2 border-red-200 pl-6 ml-2 space-y-6 pb-6 relative">
                {selectedTrain.stations.map((stop, sIdx) => {
                  const arrTime = new Date(stop.arrivalTime).getTime();
                  const depTime = new Date(stop.departureTime).getTime();
                  const tMs = simTime.getTime();

                  let isActive = false;
                  let isTravelingToNext = false;

                  if (tMs >= arrTime && tMs <= depTime) isActive = true;
                  if (sIdx < selectedTrain.stations.length - 1) {
                    const nextArr = new Date(selectedTrain.stations[sIdx + 1].arrivalTime).getTime();
                    if (tMs > depTime && tMs < nextArr) {
                      isTravelingToNext = true;
                    }
                  }

                  let durationStr = '';
                  if (depTime > arrTime) {
                    const mm = Math.round((depTime - arrTime) / 60000);
                    durationStr = mm > 60 ? \`\${Math.floor(mm / 60)} giờ \${mm % 60} phút\` : \`\${mm} phút\`;
                  }

                  return (
                    <div key={sIdx} id={\`station-desktop-\${sIdx}\`} className="relative">
                      {/* Timeline dot */}
                      <div className={\`absolute -left-[33px] top-1.5 w-4 h-4 rounded-full border-2 transition-colors duration-300 z-10 \${isActive ? 'bg-red-500 border-red-200 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                          (tMs > arrTime ? 'bg-slate-300 border-slate-100' : 'bg-white border-slate-300')
                        }\`}></div>

                      {/* Timeline connection line (Vertical) */}
                      {sIdx < selectedTrain.stations.length - 1 && (
                        <div className={\`absolute -left-[26px] top-6 w-[3px] h-[calc(100%+0.5rem)] transition-colors duration-300 \${isTravelingToNext ? 'bg-red-400 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-transparent'}\`}></div>
                      )}

                      <div className={\`p-4 rounded-xl transition-all duration-300 \${isActive ? 'bg-red-50 border border-red-100 shadow-sm' :
                          isTravelingToNext ? 'bg-blue-50/50 border border-blue-100/50' :
                            'bg-white border border-slate-100 shadow-sm hover:bg-slate-50'
                        }\`}>
                        <h3 className={\`shrink-0 text-lg font-bold mb-1.5 \${isActive ? 'text-red-600' : isTravelingToNext ? 'text-blue-600' : 'text-slate-700'}\`}>
                          {stop.stationName || \`Ga \${stop.stationCode}\`} <span className="text-xs font-mono ml-2 opacity-50">{stop.stationCode}</span>
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
                            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                              Thời gian dừng
                            </span>
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

      {/* Floating Button to Re-open Menu */}
      {!isMenuOpen && (
        <button
          onClick={() => setIsMenuOpen(true)}
          className="absolute z-[9999] bottom-6 right-6 md:bottom-6 md:left-6 w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full shadow-[0_4px_15px_rgba(239,68,68,0.4)] flex items-center justify-center text-white transition-all hover:scale-105"
          title="Hiện Menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      )}
    </div>
  );
}
`

fs.writeFileSync('src/App.tsx', safeCode.join('\n') + '\n' + rest);
console.log('Fixed!');
