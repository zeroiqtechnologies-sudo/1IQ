/**
 * Core typed data model. All money values are integer paise (1 INR = 100 paise).
 * Timestamps are epoch milliseconds (rendered in Asia/Kolkata).
 */
export type Paise = number;
export type Millis = number;
export type ID = string;

export type Role = 'customer' | 'cp' | 'developer' | 'admin';

export interface UserAccount {
  id: ID;
  role: Role;
  name: string;
  email: string;
  /** Developer or CP profile id this user belongs to. */
  orgId?: ID;
  status: 'active' | 'suspended';
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Developer {
  id: ID;
  company: string;
  shortName: string;
  contactPerson: string;
  contactEmail: string;
  cin: string; // fictional company id, demo only
  yearsActive: number;
  about: string;
  city: string;
  verificationStatus: ReviewStatus;
  verificationDocs: string[];
  verificationNote?: string;
  submittedAt: Millis;
  reviewedAt?: Millis;
}

export type CpKind = 'individual' | 'brokerage';

export interface CpProfile {
  id: ID;
  kind: CpKind;
  displayName: string;
  contactName: string;
  phone: string;
  email: string;
  serviceCities: string[];
  /** City / locality preferences. These are NOT project interest. */
  serviceLocalities: string[];
  languages: string[];
  specialisms: string[];
  experienceYears: number;
  registrationNo: string; // fictional, demo only
  documents: string[];
  reviewStatus: ReviewStatus;
  reviewNote?: string;
  submittedAt: Millis;
}

export type PropertyType = 'apartment' | 'villa';
export type ConstructionStatus = 'new_launch' | 'under_construction' | 'ready_to_move';

export type ProjectStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'published'
  | 'paused'
  | 'archived';

export interface UnitConfig {
  id: ID;
  bhk: number; // 1..5
  label: string; // "2 BHK"
  carpetMinSqft: number;
  carpetMaxSqft: number;
  priceMin: Paise;
  priceMax: Paise;
  unitsTotal: number;
  unitsAvailable: number;
}

export interface CpCommercialTerms {
  commissionPercent: number; // developer -> CP brokerage, separate from lead purchase fees
  payoutTrigger: string;
  notes: string;
}

export interface Project {
  id: ID;
  developerId: ID;
  name: string;
  city: string;
  locality: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  propertyType: PropertyType;
  constructionStatus: ConstructionStatus;
  configs: UnitConfig[];
  possession: string; // YYYY-MM
  amenities: string[];
  /** Number of procedurally generated gallery images (local placeholders). */
  galleryCount: number;
  paletteSeed: number;
  brochureName: string;
  priceInclusions: string[];
  priceExclusions: string[];
  registrationNo: string;
  registrationAuthority: string;
  /** Explicit admin review of registration details. A supplied number alone is not verification. */
  registrationReview: 'not_reviewed' | 'reviewed' | 'mismatch';
  cpTerms: CpCommercialTerms;
  cpApprovalRequired: boolean;
  status: ProjectStatus;
  reviewNote?: string;
  featured: boolean;
  createdAt: Millis;
  updatedAt: Millis;
  publishedAt?: Millis;
}

export interface ProjectInterest {
  id: ID;
  cpId: ID;
  projectId: ID;
  state: 'interested' | 'withdrawn';
  /** Only used when the project's cpApprovalRequired is true. */
  approval: 'not_required' | 'pending' | 'approved' | 'rejected';
  createdAt: Millis;
  updatedAt: Millis;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string; // display form, fictional
  phoneNormalized: string;
  email?: string;
  createdAt: Millis;
}

export type EnquiryStatus =
  | 'received'
  | 'verification_pending'
  | 'qualification_pending'
  | 'qualified'
  | 'rejected'
  | 'duplicate'
  | 'withdrawn'
  | 'in_auction'
  | 'assigned'
  | 'unassigned'; // auction expired / cancelled, awaiting admin

export type Timeline = 'immediate' | '1_3_months' | '3_6_months' | '6_12_months' | 'exploring';
export type Purpose = 'self_use' | 'investment';
export type ContactPreference = 'call' | 'whatsapp' | 'email';
export type ContactTime = 'morning' | 'afternoon' | 'evening' | 'anytime';

export interface Consent {
  shareWithAssignedPartner: boolean;
  shareTextVersion: string;
  shareGivenAt?: Millis;
  marketing: boolean;
  marketingTextVersion: string;
  marketingGivenAt?: Millis;
  source: string; // e.g. "web:project-detail"
  withdrawnAt?: Millis;
}

export interface Enquiry {
  id: ID;
  customerId: ID;
  projectId?: ID; // undefined => general enquiry
  allowAlternatives: boolean;
  budgetMin: Paise;
  budgetMax: Paise;
  bhk: number[];
  preferredLocalities: string[];
  timeline: Timeline;
  purpose: Purpose;
  contactPreference: ContactPreference;
  contactTime: ContactTime;
  visitAvailability?: string;
  /** Free text from the customer. Never shown to CPs before purchase. */
  message?: string;
  otpVerifiedAt?: Millis;
  consent: Consent;
  status: EnquiryStatus;
  duplicateOf: ID[];
  duplicateReview: 'none' | 'flagged' | 'cleared' | 'confirmed';
  createdAt: Millis;
  updatedAt: Millis;
  sharingStoppedAt?: Millis;
}

export interface QualificationChecks {
  contactVerified: boolean;
  requirementsComplete: boolean;
  timelineConfirmed: boolean;
  consentActive: boolean;
  duplicateReviewed: boolean;
}

export interface Qualification {
  id: ID;
  enquiryId: ID;
  reviewerId: ID;
  result: 'qualified' | 'rejected' | 'duplicate';
  checks: QualificationChecks;
  /** Public-safe evidence labels (no identifying info). */
  evidence: string[];
  /** Internal admin notes. Never in auction previews. */
  internalNote?: string;
  budgetEvidence: 'not_verified' | 'customer_stated';
  at: Millis;
}

export interface ProjectMatch {
  projectId: ID;
  reasons: string[];
  primary: boolean;
}

export interface Lead {
  id: ID;
  enquiryId: ID;
  qualificationId: ID;
  matches: ProjectMatch[];
  eligibleCpIds: ID[]; // snapshot at qualification / auction start
  state: 'ready' | 'in_auction' | 'assigned' | 'unassigned' | 'cancelled';
  createdAt: Millis;
}

export type AuctionState =
  | 'scheduled'
  | 'live'
  | 'settlement_pending'
  | 'assigned'
  | 'expired_no_bids'
  | 'cancelled'
  | 'settlement_failed';

export interface AuctionRules {
  startPrice: Paise;
  increment: Paise;
  durationMs: Millis;
}

export interface Auction {
  id: ID;
  leadId: ID;
  rules: AuctionRules;
  state: AuctionState;
  startsAt: Millis;
  endsAt: Millis;
  nextSeq: number;
  settlementKey?: string;
  settledAt?: Millis;
  closedAt?: Millis;
  cancelReason?: string;
  failureReason?: string;
  /** Demo-only: force settlement failure at close. */
  demoFailSettlement?: boolean;
  createdBy: ID;
}

export type BidRejectReason =
  | 'auction_not_live'
  | 'late'
  | 'ineligible'
  | 'account_inactive'
  | 'below_minimum'
  | 'invalid_increment'
  | 'insufficient_funds';

export interface Bid {
  id: ID;
  auctionId: ID;
  cpId: ID;
  amount: Paise;
  at: Millis;
  status: 'accepted' | 'rejected';
  seq?: number; // only for accepted bids
  rejectReason?: BidRejectReason;
  rejectMessage?: string;
}

export interface Hold {
  id: ID;
  cpId: ID;
  auctionId: ID;
  amount: Paise;
  state: 'active' | 'released' | 'consumed';
  createdAt: Millis;
  updatedAt: Millis;
}

export type LedgerType = 'top_up' | 'hold' | 'hold_release' | 'lead_purchase' | 'refund' | 'admin_adjustment';

export interface LedgerEntry {
  id: ID;
  cpId: ID;
  type: LedgerType;
  /** Effect on total balance (holds/releases are 0 here). */
  amount: Paise;
  /** For holds and releases: the amount moved between available and held. */
  holdDelta: Paise;
  status: 'succeeded' | 'failed';
  at: Millis;
  ref: string; // auction / payment / purchase / dispute reference
  idempotencyKey: string;
  memo: string;
}

export interface Payment {
  id: ID;
  cpId: ID;
  amount: Paise;
  outcome: 'pending' | 'succeeded' | 'failed';
  createdAt: Millis;
  callbacksReceived: number;
}

export interface Purchase {
  id: ID;
  receiptNo: string;
  auctionId: ID;
  leadId: ID;
  cpId: ID;
  amount: Paise;
  ledgerEntryId: ID;
  at: Millis;
}

export type CrmStage =
  | 'new'
  | 'attempted'
  | 'contacted'
  | 'qualified'
  | 'visit_scheduled'
  | 'visit_completed'
  | 'negotiation'
  | 'booked'
  | 'lost';

export interface Assignment {
  id: ID;
  leadId: ID;
  enquiryId: ID;
  cpId: ID;
  purchaseId: ID;
  stage: CrmStage;
  lostReason?: string;
  developerConfirmedBooking?: boolean;
  at: Millis;
}

export interface Activity {
  id: ID;
  assignmentId: ID;
  kind: 'note' | 'stage_change' | 'call_preview' | 'message_preview' | 'reminder' | 'visit' | 'system';
  text: string;
  dueAt?: Millis;
  done?: boolean;
  at: Millis;
  actorId: ID;
}

export interface SiteVisit {
  id: ID;
  assignmentId: ID;
  projectId: ID;
  at: Millis;
  state: 'requested' | 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  requestedBy: 'customer' | 'cp';
  note?: string;
}

export type DisputeReason = 'invalid_contact' | 'duplicate_sold' | 'incorrect_qualification' | 'other';

export interface Dispute {
  id: ID;
  purchaseId: ID;
  cpId: ID;
  reason: DisputeReason;
  evidence: string;
  status: 'requested' | 'approved' | 'rejected';
  decisionNote?: string;
  decidedBy?: ID;
  decidedAt?: Millis;
  refundLedgerId?: ID;
  createdAt: Millis;
}

export interface SupportTicket {
  id: ID;
  customerId: ID;
  enquiryId?: ID;
  kind: 'report_partner' | 'stop_sharing' | 'general';
  text: string;
  status: 'open' | 'closed';
  createdAt: Millis;
}

export interface AppNotification {
  id: ID;
  recipientId: ID; // user id
  title: string;
  body: string;
  link?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  read: boolean;
  at: Millis;
}

export interface AuditEvent {
  id: ID;
  actorId: ID;
  action: string;
  objectType: string;
  objectId: ID;
  detail?: string;
  sensitive?: boolean;
  at: Millis;
}

export interface PlatformSettings {
  auctionDefaults: AuctionRules;
  consentTextVersion: string;
  marketingTextVersion: string;
}

export interface DbState {
  schemaVersion: number;
  seq: number;
  clockOffsetMs: Millis;
  seededAt: Millis;
  settings: PlatformSettings;
  users: UserAccount[];
  developers: Developer[];
  cps: CpProfile[];
  projects: Project[];
  interests: ProjectInterest[];
  customers: Customer[];
  enquiries: Enquiry[];
  qualifications: Qualification[];
  leads: Lead[];
  auctions: Auction[];
  bids: Bid[];
  holds: Hold[];
  ledger: LedgerEntry[];
  payments: Payment[];
  purchases: Purchase[];
  assignments: Assignment[];
  activities: Activity[];
  visits: SiteVisit[];
  disputes: Dispute[];
  tickets: SupportTicket[];
  notifications: AppNotification[];
  audit: AuditEvent[];
  /** Per-browser customer conveniences (demo). */
  shortlist: ID[];
  compare: ID[];
}

/** Context passed to every state-changing operation. */
export interface OpContext {
  now: Millis;
  actorId: ID;
}

/**
 * Anonymised auction view for CPs who have not purchased the lead.
 * This type deliberately has no fields for customer name, phone, email,
 * address, free-text messages or internal admin notes.
 */
export interface AuctionPreview {
  auctionId: ID;
  leadId: ID;
  state: AuctionState;
  requirement: {
    budgetMin: Paise;
    budgetMax: Paise;
    bhk: number[];
    preferredLocalities: string[];
    timeline: Timeline;
    purpose: Purpose;
    contactPreference: ContactPreference;
    city: string;
  };
  projects: { projectId: ID; name: string; locality: string; primary: boolean; reasons: string[] }[];
  qualification: { checks: QualificationChecks; evidence: string[]; qualifiedAt: Millis; contactVerifiedAt?: Millis; budgetEvidence: Qualification['budgetEvidence'] };
  enquiryAt: Millis;
  rules: AuctionRules;
  startsAt: Millis;
  endsAt: Millis;
  currentBid: Paise | null;
  minNextBid: Paise;
  bidderCount: number;
  bidCount: number;
  viewer: {
    eligible: boolean;
    ineligibleReason?: string;
    status: 'none' | 'leading' | 'outbid' | 'won' | 'lost';
    myHighestBid: Paise | null;
    myHold: Paise;
  };
}
