import fs from 'fs';

async function generateMissingStations() {
  try {
    const apiReq = await fetch("https://k.vnticketonline.vn/api/GTGV/LoadDmGa");
    if (!apiReq.ok) throw new Error("API failed");
    const vnTicketStations = await apiReq.json();

    const query = `
      [out:json];
      area["ISO3166-1"="VN"][admin_level=2]->.searchArea;
      node["railway"="station"](area.searchArea);
      out geom;
    `;
    const overpassReq = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", body: query
    });
    const overpassData = await overpassReq.json();

    const overpassStations = overpassData.elements.filter((e: any) => e.type === 'node');

    const normalize = (s: string) => s.toLowerCase().replace(/ga\s+/gi, '').replace(/-/g, '').trim();

    const missingStations: any[] = [];
    vnTicketStations.forEach((apiStation: any) => {
      const apiName = normalize(apiStation.TenGa);
      const match = overpassStations.find((n: any) => {
        const nodeName = n.tags?.name ? normalize(n.tags.name) : '';
        const nodeNameEn = n.tags?.['name:en'] ? normalize(n.tags['name:en']) : '';
        return nodeName === apiName || nodeNameEn === apiName;
      });

      if (!match) missingStations.push(apiStation);
    });

    const content = missingStations.map((m: any) => `ID: ${m.Id}, Name: ${m.TenGa}, Code: ${m.MaGa}`).join('\n');
    fs.writeFileSync('missing_stations.txt', content);
    console.log(`Saved ${missingStations.length} missing stations to missing_stations.txt`);
  } catch (e) {
    console.error(e);
  }
}
generateMissingStations();
