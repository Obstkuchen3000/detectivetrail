export interface CityInfo { id: string; name: string; country: string; available: boolean; mapUrl?: string; tagline: string }
export const CITIES: CityInfo[] = [
  { id: 'nyc', name: 'New York', country: 'USA', available: true, mapUrl: 'cities/nyc/map.json', tagline: 'Manhattan · 99 U-Bahn-Knoten' },
  { id: 'london', name: 'London', country: 'UK', available: false, tagline: 'in Vorbereitung' },
  { id: 'berlin', name: 'Berlin', country: 'DE', available: false, tagline: 'in Vorbereitung' },
  { id: 'tokyo', name: 'Tokio', country: 'JP', available: false, tagline: 'in Vorbereitung' },
];
