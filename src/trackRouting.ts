import type { Feature, LineString } from 'geojson';
import { lineString } from '@turf/helpers';
import distance from '@turf/distance';

type Coord = [number, number]; // [lng, lat]

interface GraphNode {
  id: string; // "lng|lat"
  point: Coord;
}

export class TrackGraph {
  public edges: Map<string, Array<{ to: string, weight: number }>> = new Map();
  public nodes: Map<string, GraphNode> = new Map();

  private makeId(pt: Coord): string {
    return `${pt[0].toFixed(5)}|${pt[1].toFixed(5)}`;
  }

  public buildGraph(tracks: Feature<LineString>[]) {
    this.edges.clear();
    this.nodes.clear();

    for (const track of tracks) {
      if (!track.geometry || !track.geometry.coordinates) continue;
      const coords = track.geometry.coordinates as Coord[];
      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];

        const id1 = this.makeId(p1);
        const id2 = this.makeId(p2);

        if (!this.nodes.has(id1)) this.nodes.set(id1, { id: id1, point: p1 });
        if (!this.nodes.has(id2)) this.nodes.set(id2, { id: id2, point: p2 });

        const d = distance(p1, p2, { units: 'kilometers' });

        if (!this.edges.has(id1)) this.edges.set(id1, []);
        if (!this.edges.has(id2)) this.edges.set(id2, []);

        this.edges.get(id1)!.push({ to: id2, weight: d });
        this.edges.get(id2)!.push({ to: id1, weight: d }); // undirected
      }
    }
    console.log(`[TrackGraph] Built routing graph with ${this.nodes.size} geometry nodes.`);
  }

  private findNearestNodeId(pt: Coord): string | null {
    let bestDist = Infinity;
    let bestId: string | null = null;
    
    // In a huge graph, a spatial index (e.g., RBush) is ideal, 
    // but a linear scan over 10k nodes in browser takes < 5ms.
    for (const [id, node] of this.nodes.entries()) {
      const d = distance(pt, node.point, { units: 'kilometers' });
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }

  // A* implementation
  public findShortestPath(startCoord: Coord, endCoord: Coord): Feature<LineString> | null {
    if (this.nodes.size === 0) return null;

    const startId = this.findNearestNodeId(startCoord);
    const endId = this.findNearestNodeId(endCoord);

    if (!startId || !endId) return null;
    if (startId === endId) return lineString([startCoord, endCoord]);

    // Priority Queue substitute (standard array sorted)
    // For JS, simple array mapping works well enough for small localized graphs
    const openSet = new Set<string>([startId]);
    const cameFrom = new Map<string, string>();
    
    const gScore = new Map<string, number>();
    gScore.set(startId, 0);

    const fScore = new Map<string, number>();
    const startPt = this.nodes.get(startId)!.point;
    const endPt = this.nodes.get(endId)!.point;
    fScore.set(startId, distance(startPt, endPt, { units: 'kilometers' }));

    while (openSet.size > 0) {
      // Find node in openSet with lowest fScore
      let currentId = '';
      let lowestF = Infinity;
      for (const id of openSet) {
        const score = fScore.get(id) ?? Infinity;
        if (score < lowestF) {
          lowestF = score;
          currentId = id;
        }
      }

      if (currentId === endId) {
        // Reconstruct path
        const path: Coord[] = [];
        let curr = endId;
        while (curr) {
          path.unshift(this.nodes.get(curr)!.point);
          curr = cameFrom.get(curr) || '';
        }
        return lineString(path);
      }

      openSet.delete(currentId);

      const neighbors = this.edges.get(currentId) || [];
      for (const neighbor of neighbors) {
        const tentative_gScore = (gScore.get(currentId) ?? Infinity) + neighbor.weight;

        if (tentative_gScore < (gScore.get(neighbor.to) ?? Infinity)) {
          cameFrom.set(neighbor.to, currentId);
          gScore.set(neighbor.to, tentative_gScore);
          const neighborPt = this.nodes.get(neighbor.to)!.point;
          fScore.set(neighbor.to, tentative_gScore + distance(neighborPt, endPt, { units: 'kilometers' }));
          
          if (!openSet.has(neighbor.to)) {
            openSet.add(neighbor.to);
          }
        }
      }
    }

    return null; // Path not found
  }
}

// Global Singleton Instance
export const globalTrackGraph = new TrackGraph();
