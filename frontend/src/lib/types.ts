// Shared API DTOs — mirror the backend Pydantic schemas.

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  company_id: number | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Kpi {
  label: string;
  value: string;
  sub: string;
}

export interface RiskCard {
  id: number;
  title: string;
  supplier: string;
  severity: string;
  severity_color: string;
  impact: string;
  time: string;
}

export interface NewsCard {
  id: number;
  source: string;
  title: string;
  time: string;
  url: string;
}

export interface DashboardResponse {
  kpis: Kpi[];
  risks: RiskCard[];
  news: NewsCard[];
  actions_summary: string;
  map_points: { country: string; lat: number; lon: number; severity: string; score: number }[];
}

export interface Factor {
  label: string;
  value: number;
}

export interface ImpactTile {
  label: string;
  value: string;
}

export interface RiskDetail {
  id: number;
  title: string;
  headline: string;
  severity: string;
  severity_color: string;
  score: number;
  confidence: number;
  time: string;
  reasoning: string;
  factors: Factor[];
  impact: ImpactTile[];
  chain: string[];
}

export interface ScenarioTile {
  id: string;
  name: string;
  risk_reduction: string;
  cost: string;
  recovery: string;
  financial: string;
}

export interface ScenarioResponse {
  risk_id: number;
  risk_title: string;
  scenarios: ScenarioTile[];
}

export interface ActionCard {
  id: number;
  title: string;
  owner: string;
  deadline: string;
  priority: string;
  priority_color: string;
  status: string;
}

export interface ActionColumn {
  key: string;
  name: string;
  items: ActionCard[];
}

export interface ActionBoardResponse {
  columns: ActionColumn[];
}

export interface EmailResponse {
  subject: string;
  body: string;
  kind: string;
  saved: boolean;
}

export interface IngestResult {
  ingested: number;
  matched: number;
  new_risks: number[];
  message: string;
}
