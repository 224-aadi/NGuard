export interface FormState {
  crop: string;
  plannedYield: string;  // tons/acre
  acreage: string;       // total field acres
  prevN: string;
  fertilizerForm: string;
  soil: string;
  irrigation: string;
}

export interface CostBreakdown {
  nLossLbs: number;
  costPerLbN: number;
  replacementCost: number;
  reapplicationCost: number;
  regulatoryExposure: number;
  totalVarPerAcre: number;
  fertilizerSource: string;
  regulatorySource: string;
}

export interface CalcResult {
  baseN: number;
  leachingProb: number;
  airborneFlag: string | null;
  riskCategory: "Low" | "Moderate" | "High Liability";
  adjustedN: number;
  directive: string;
  varDollars: number;
  totalFieldExposure: number;
  costBreakdown: CostBreakdown;
}

export interface WeatherInfo {
  latitude: number;
  longitude: number;
  locationName: string;
  rainMm: number;
  tempC: number;
  windMph: number;
  humidity: number;
  fetchedAt: string;
}

export interface StreamFeature {
  id: number;
  name: string;
  distanceMeters: number;
  estNlbs?: number;
}

export interface FieldFilesEstimate {
  chosenAreaAcres: number;
  chosenAreaSqMeters: number;
  centroid: {
    lat: number;
    lon: number;
  };
  tiff: {
    fileName: string;
    areaAcres: number;
    areaSqMeters: number;
    width: number;
    height: number;
    pixelSizeX: number;
    pixelSizeY: number;
    units: string;
    warnings?: string[];
  };
  polygon: {
    fileName: string;
    source: string;
    areaAcres: number;
    areaSqMeters: number;
    ringCount: number;
    pointCount: number;
  };
}
