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
  /** Price the seller verbally agreed to with the Acquisition Manager, waiting on your tap to send the contract. */
  agreedPrice?: number;
  /** Seller said it's OK to call/text them at this number (required before any AI callback). */
  consentToContact?: boolean;
  /** Seller asked not to be contacted again. Nothing is ever sent to this lead. */
  doNotContact?: boolean;
  /** Atlas's read of the street photo of the house. */
  visual?: VisualScan;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VisualScan {
  /** 0 = well kept, 10 = clearly abandoned or badly run down. */
  score: number;
  signs: string[];
  summary: string;
  /** Whether the house was clearly visible in the photo. */
  usable: boolean;
  /** When the street photo was taken (YYYY-MM), from Google. Old photos may not show today's condition. */
  imageDate?: string;
  hasImage: boolean;
  scannedAt: string;
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

export type AgentName = 'scout' | 'isa' | 'analyst' | 'negotiator' | 'dispositions' | 'coordinator' | 'acquisitions' | 'atlas';

/** A live seller conversation run by the AI Acquisition Manager (phone call, SMS thread or browser test). */
export interface Conversation {
  id: string;
  leadId: string;
  channel: 'voice' | 'sms' | 'web';
  /** Twilio CallSid for voice calls, so each webhook finds its call. */
  externalId?: string;
  transcript: { at: string; from: 'seller' | 'agent'; text: string }[];
  /** Claude message history, kept exactly as returned (append-only) so thinking blocks stay valid. */
  api: unknown[];
  status: 'active' | 'ended';
  outcome?: string;
  createdAt: string;
  updatedAt: string;
}

/** Something the team needs you for. Sent to Telegram when configured. */
export interface Notification {
  id: string;
  leadId?: string;
  kind: 'deal_agreed' | 'escalation' | 'callback' | 'info';
  text: string;
  status: 'open' | 'approved' | 'declined' | 'done';
  createdAt: string;
}

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
  /** The name the AI Acquisition Manager introduces itself with. It always says it's a virtual assistant. */
  agentName: string;
  /** City/area you buy in, used in the AI's greeting and answers. */
  market: string;
  /** Typical days to close, quoted to sellers. */
  closeDays: number;
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
  conversations: Conversation[];
  notifications: Notification[];
  settings: Settings;
}
