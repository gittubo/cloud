// Shared data model for the Dream Team.

export type LeadStage =
  | 'new'          // imported, not yet scored
  | 'scored'       // Lead Scout ranked it
  | 'contacted'    // first outreach approved
  | 'qualified'    // ISA confirmed motivation, condition, timeline, price
  | 'analyzed'     // Deal Analyst produced ARV / repairs / MAO
  | 'negotiating'  // offer out, Negotiator handling counters
  | 'contract'     // signed purchase agreement
  | 'marketed'     // Dispositions sent to buyers
  | 'assigned'     // assignment signed with an end buyer
  | 'closed'
  | 'dead';

export type Condition = 'turnkey' | 'light' | 'medium' | 'heavy' | 'teardown';

export interface Lead {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  mailingAddress?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  estimatedValue?: number;
  mortgageBalance?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
  /** Distress signals from the list source: pre-foreclosure, tax-delinquent, vacant, probate, absentee, etc. */
  tags: string[];
  source: string;
  stage: LeadStage;
  motivationScore?: number;
  scoreReasons?: string[];
  qualification?: Qualification;
  analysis?: DealAnalysis;
  negotiation?: NegotiationState;
  contractSignedAt?: string;
  closingDate?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Qualification {
  motivation?: string;
  condition?: Condition;
  timeline?: string;
  askingPrice?: number;
  occupancy?: 'owner' | 'tenant' | 'vacant';
  decisionMakers?: string;
  missing: string[];
}

export interface Comp {
  address: string;
  zip: string;
  soldPrice: number;
  soldDate: string;
  sqft: number;
  beds?: number;
  baths?: number;
  condition?: 'renovated' | 'average' | 'distressed';
}

export interface DealAnalysis {
  arv: number;
  arvConfidence: 'high' | 'medium' | 'low';
  compsUsed: string[];
  pricePerSqft: number;
  repairEstimate: number;
  assignmentFee: number;
  mao: number;
  openingOffer: number;
  verdict: 'strong' | 'workable' | 'pass';
  explanation: string[];
}

export interface NegotiationState {
  round: number;
  ourLastOffer: number;
  sellerLastAsk?: number;
  history: { at: string; party: 'us' | 'seller'; amount?: number; text: string }[];
}

export interface Buyer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  zips: string[];
  maxPrice?: number;
  minBeds?: number;
  strategies: string[]; // flip, rental, brrrr, new-build
  lastPurchase?: string;
}

export type AgentName = 'scout' | 'isa' | 'analyst' | 'negotiator' | 'dispositions' | 'coordinator';

/** Anything that would reach a seller or buyer waits here until a human approves it. */
export interface Draft {
  id: string;
  leadId: string;
  agent: AgentName;
  channel: 'sms' | 'email' | 'call-script' | 'letter';
  to?: string;
  subject?: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
}

export interface Task {
  id: string;
  leadId: string;
  title: string;
  due?: string;
  done: boolean;
}

export interface Settings {
  /** MAO rule: arv * arvPercent - repairs - fee */
  arvPercent: number;
  defaultAssignmentFee: number;
  repairCostPerSqft: Record<Condition, number>;
  companyName: string;
  yourName: string;
  callbackNumber: string;
}

export interface Activity {
  at: string;
  agent: AgentName | 'you';
  leadId?: string;
  text: string;
}

export interface Db {
  leads: Lead[];
  comps: Comp[];
  buyers: Buyer[];
  drafts: Draft[];
  tasks: Task[];
  activity: Activity[];
  settings: Settings;
}
