const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace('const [selectedTrain, setSelectedTrain] = useState<TrainSchedule | null>(null);', 
  'const [selectedTrain, setSelectedTrain] = useState<TrainSchedule | null>(null);\n  const [activeTrains, setActiveTrains] = useState<Set<string>>(new Set());');

app = app.replace(/const t = simTime\.getTime\(\);.*?Đang theo dõi \{visibleTrainsCount\} tàu đang chạy\./s, 
  `Đang theo dõi {activeTrains.size} tàu đang chạy.`);

app = app.replace(/onSelect=\{\(\) => setSelectedTrain\(train\)\}/s,
  `onSelect={() => setSelectedTrain(train)}\n            onActiveChange={(isActive) => {\n              setActiveTrains(prev => {\n                const next = new Set(prev);\n                if (isActive) next.add(train.trainCode);\n                else next.delete(train.trainCode);\n                return next;\n              })\n            }}`);

fs.writeFileSync('src/App.tsx', app);

let tm = fs.readFileSync('src/TrainMarker.tsx', 'utf8');
tm = tm.replace('onSelect?: () => void;', 'onSelect?: () => void;\n  onActiveChange?: (isActive: boolean) => void;');
tm = tm.replace('  if (!position) return null;', '  useEffect(() => {\n    if (onActiveChange) onActiveChange(!!position);\n  }, [!!position]);\n\n  if (!position) return null;');

fs.writeFileSync('src/TrainMarker.tsx', tm);
