/**
 * Deterministic demo seed. Everything after the static catalogue is created by
 * running the real domain operations (top-ups, enquiries, qualification, bids,
 * settlement), so seed balances, holds and assignments are always consistent.
 * All people, companies, phone numbers and registrations are fictional.
 */
import type { CpProfile, DbState, Developer, Millis, OpContext, Project, UnitConfig, UserAccount } from '../domain/types';
import { crore, lakh, rupees } from '../domain/format';
import { createTopUp, handlePaymentCallback } from '../domain/wallet';
import { submitEnquiry, verifyOtp, qualifyEnquiry, resolveDuplicate, withdrawConsent, type EnquiryInput } from '../domain/enquiry';
import { placeBid, settleAuction, startAuction } from '../domain/auction';
import { addNote, addReminder, logOutreachPreview, raiseDispute, scheduleVisit, setStage } from '../domain/crm';
import { setInterest, decideInterest, reviewCp } from '../domain/projects';
import { must } from '../domain/util';

export const SCHEMA_VERSION = 3;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const LOCALITIES = ['Baner', 'Wakad', 'Hinjawadi', 'Kharadi', 'Hadapsar', 'Tathawade'] as const;
export const LOCALITY_COORDS: Record<string, [number, number]> = {
  Baner: [18.559, 73.786], Wakad: [18.599, 73.762], Hinjawadi: [18.591, 73.738],
  Kharadi: [18.551, 73.94], Hadapsar: [18.508, 73.926], Tathawade: [18.62, 73.749],
};
export const AMENITIES = ['Clubhouse', 'Swimming pool', 'Gym', "Kids' play area", 'Jogging track', '24x7 security', 'Power backup', 'EV charging', 'Rainwater harvesting', 'Co-working lounge', 'Indoor games', 'Landscaped garden', 'Visitor parking', 'Senior citizen zone'];

let cfgN = 0;
function cfg(bhk: number, carpet: [number, number], price: [number, number], total: number, avail: number, unit: 'L' | 'Cr' = 'L'): UnitConfig {
  cfgN += 1;
  const conv = unit === 'L' ? lakh : crore;
  return { id: `cfg_${cfgN}`, bhk, label: bhk === 5 ? '5 BHK' : `${bhk} BHK`, carpetMinSqft: carpet[0], carpetMaxSqft: carpet[1], priceMin: conv(price[0]), priceMax: conv(price[1]), unitsTotal: total, unitsAvailable: avail };
}

const REG_AUTH = 'Demo State Real Estate Authority (fictional)';

function project(id: string, developerId: string, p: Partial<Project> & Pick<Project, 'name' | 'locality' | 'configs' | 'possession' | 'status'>, t: Millis): Project {
  const [lat, lng] = LOCALITY_COORDS[p.locality];
  const n = Number(id.split('_')[1]);
  return {
    id,
    developerId,
    city: 'Pune',
    address: `Survey No. ${100 + n * 7}, near ${p.locality} main road, ${p.locality}, Pune (demo address)`,
    lat: lat + ((n % 3) - 1) * 0.004,
    lng: lng + ((n % 4) - 1.5) * 0.004,
    description: `${p.name} is a fictional residential project in ${p.locality}, Pune, created for this prototype. It features efficient layouts, open green spaces and quick access to schools, offices and daily needs.`,
    propertyType: 'apartment',
    constructionStatus: 'under_construction',
    amenities: AMENITIES.filter((_, i) => (i + n) % 3 !== 0).slice(0, 9),
    galleryCount: 5,
    paletteSeed: n,
    brochureName: `${p.name.replace(/\s+/g, '-')}-Brochure-DEMO.txt`,
    priceInclusions: ['Base price', 'Covered car parking (1)', 'Clubhouse membership'],
    priceExclusions: ['Stamp duty & registration', 'GST as applicable', 'Maintenance deposit', 'Legal charges'],
    registrationNo: `DEMO-REG-P521-${String(4000 + n * 37).padStart(5, '0')}`,
    registrationAuthority: REG_AUTH,
    registrationReview: 'reviewed',
    cpTerms: { commissionPercent: 2, payoutTrigger: 'On registration of agreement for sale', notes: 'Demo terms between developer and CP. Separate from lead purchase fees.' },
    cpApprovalRequired: false,
    featured: false,
    createdAt: t - 30 * DAY,
    updatedAt: t - 3 * DAY,
    publishedAt: p.status === 'published' ? t - 20 * DAY : undefined,
    ...p,
  };
}

function baseState(t: Millis): DbState {
  return {
    schemaVersion: SCHEMA_VERSION,
    seq: 0,
    clockOffsetMs: 0,
    seededAt: t,
    settings: {
      auctionDefaults: { startPrice: rupees(500), increment: rupees(100), durationMs: 10 * MIN },
      consentTextVersion: 'share-v1.0',
      marketingTextVersion: 'mkt-v1.0',
    },
    users: [], developers: [], cps: [], projects: [], interests: [], customers: [], enquiries: [], qualifications: [], leads: [], auctions: [], bids: [], holds: [], ledger: [], payments: [], purchases: [], assignments: [], activities: [], visits: [], disputes: [], tickets: [], notifications: [], audit: [], shortlist: [], compare: [],
  };
}

const ADMIN = 'user_admin';
const okChecks = { contactVerified: true, requirementsComplete: true, timelineConfirmed: true, consentActive: true, duplicateReviewed: true };

export function buildSeed(seedTime: Millis): DbState {
  cfgN = 0;
  const T = seedTime;
  const s = baseState(T);
  const at = (now: Millis, actorId = ADMIN): OpContext => ({ now, actorId });

  // ---------- Accounts ----------
  const developers: Developer[] = [
    { id: 'dev_1', company: 'Sahyadri Habitat Developers Pvt Ltd (fictional)', shortName: 'Sahyadri Habitat', contactPerson: 'Nikhil Sathe', contactEmail: 'projects@sahyadri-habitat.example', cin: 'DEMO-CIN-U70100-001', yearsActive: 14, about: 'A fictional Pune developer focused on mid-to-premium apartments in the west corridor.', city: 'Pune', verificationStatus: 'approved', verificationDocs: ['Company registration (demo).pdf', 'Authorised signatory letter (demo).pdf'], submittedAt: T - 60 * DAY, reviewedAt: T - 55 * DAY },
    { id: 'dev_2', company: 'Indrayani Estates LLP (fictional)', shortName: 'Indrayani Estates', contactPerson: 'Pooja Gokhale', contactEmail: 'sales@indrayani-estates.example', cin: 'DEMO-LLPIN-AAB-0042', yearsActive: 9, about: 'A fictional developer building family homes across Pune with a focus on open spaces.', city: 'Pune', verificationStatus: 'approved', verificationDocs: ['LLP deed (demo).pdf', 'PAN (demo).pdf'], submittedAt: T - 50 * DAY, reviewedAt: T - 48 * DAY },
    { id: 'dev_3', company: 'Mulshi Crest Realty Pvt Ltd (fictional)', shortName: 'Mulshi Crest', contactPerson: 'Farhan Shaikh', contactEmail: 'hello@mulshi-crest.example', cin: 'DEMO-CIN-U45200-077', yearsActive: 3, about: 'A fictional newer developer planning boutique projects in east and west Pune.', city: 'Pune', verificationStatus: 'pending', verificationDocs: ['Incorporation certificate (demo).pdf'], submittedAt: T - 2 * DAY },
  ];
  s.developers.push(...developers);

  const cps: CpProfile[] = [
    { id: 'cp_1', kind: 'brokerage', displayName: 'Kulkarni Realty Advisors', contactName: 'Sameer Kulkarni', phone: '+91 90000 10001', email: 'sameer@kulkarni-realty.example', serviceCities: ['Pune'], serviceLocalities: ['Baner', 'Wakad', 'Hinjawadi'], languages: ['Marathi', 'Hindi', 'English'], specialisms: ['First-time buyers', 'IT professionals'], experienceYears: 11, registrationNo: 'DEMO-AGENT-A5210-0101', documents: ['Agent registration (demo).pdf'], reviewStatus: 'approved', submittedAt: T - 40 * DAY },
    { id: 'cp_2', kind: 'brokerage', displayName: 'Deshmukh Property Partners', contactName: 'Aditi Deshmukh', phone: '+91 90000 10002', email: 'aditi@deshmukh-pp.example', serviceCities: ['Pune'], serviceLocalities: ['Kharadi', 'Hadapsar', 'Baner'], languages: ['Marathi', 'English'], specialisms: ['Premium homes', 'NRI buyers'], experienceYears: 8, registrationNo: 'DEMO-AGENT-A5210-0102', documents: ['Agent registration (demo).pdf'], reviewStatus: 'approved', submittedAt: T - 38 * DAY },
    { id: 'cp_3', kind: 'individual', displayName: 'Meera Joshi Homes', contactName: 'Meera Joshi', phone: '+91 90000 10003', email: 'meera@mjhomes.example', serviceCities: ['Pune'], serviceLocalities: ['Wakad', 'Tathawade', 'Hinjawadi'], languages: ['Marathi', 'Hindi', 'English', 'Kannada'], specialisms: ['Ready-to-move', 'Resale-to-new upgrades'], experienceYears: 5, registrationNo: 'DEMO-AGENT-A5210-0103', documents: ['Agent registration (demo).pdf'], reviewStatus: 'approved', submittedAt: T - 30 * DAY },
    { id: 'cp_4', kind: 'brokerage', displayName: 'Pune Home Connect', contactName: 'Rahul Bhosale', phone: '+91 90000 10004', email: 'rahul@punehomeconnect.example', serviceCities: ['Pune'], serviceLocalities: ['Hinjawadi', 'Baner', 'Kharadi'], languages: ['Hindi', 'English', 'Telugu'], specialisms: ['Investors', 'Villas'], experienceYears: 13, registrationNo: 'DEMO-AGENT-A5210-0104', documents: ['Agent registration (demo).pdf', 'GST certificate (demo).pdf'], reviewStatus: 'approved', submittedAt: T - 35 * DAY },
    { id: 'cp_5', kind: 'individual', displayName: 'Arjun Patil Realty', contactName: 'Arjun Patil', phone: '+91 90000 10005', email: 'arjun@patilrealty.example', serviceCities: ['Pune'], serviceLocalities: ['Baner', 'Wakad'], languages: ['Marathi', 'Hindi'], specialisms: ['Rentals to ownership'], experienceYears: 2, registrationNo: 'DEMO-AGENT-A5210-0105', documents: ['Agent registration (demo).pdf'], reviewStatus: 'pending', submittedAt: T - 1 * DAY },
    { id: 'cp_6', kind: 'brokerage', displayName: 'Skyway Realty Network', contactName: 'Vikram Rao', phone: '+91 90000 10006', email: 'vikram@skyway.example', serviceCities: ['Pune'], serviceLocalities: ['Hinjawadi', 'Wakad'], languages: ['English', 'Hindi'], specialisms: ['Bulk deals'], experienceYears: 7, registrationNo: 'DEMO-AGENT-A5210-0106', documents: ['Agent registration (demo).pdf'], reviewStatus: 'approved', submittedAt: T - 45 * DAY },
  ];
  s.cps.push(...cps);

  const users: UserAccount[] = [
    { id: ADMIN, role: 'admin', name: 'Kavya Iyer (Admin)', email: 'admin@setuhomes.example', status: 'active' },
    { id: 'user_dev_1', role: 'developer', name: 'Nikhil Sathe', email: developers[0].contactEmail, orgId: 'dev_1', status: 'active' },
    { id: 'user_dev_2', role: 'developer', name: 'Pooja Gokhale', email: developers[1].contactEmail, orgId: 'dev_2', status: 'active' },
    { id: 'user_dev_3', role: 'developer', name: 'Farhan Shaikh', email: developers[2].contactEmail, orgId: 'dev_3', status: 'active' },
    ...cps.map<UserAccount>((c) => ({ id: `user_${c.id}`, role: 'cp', name: c.contactName, email: c.email, orgId: c.id, status: c.reviewStatus === 'suspended' ? 'suspended' : 'active' })),
  ];
  s.users.push(...users);

  // ---------- 12 projects ----------
  s.projects.push(
    project('prj_1', 'dev_1', { name: 'Sahyadri Skyline', locality: 'Baner', featured: true, possession: '2027-12', status: 'published', configs: [cfg(2, [780, 860], [95, 118], 120, 34), cfg(3, [1080, 1240], [1.32, 1.65], 80, 21, 'Cr')], amenities: ['Clubhouse', 'Swimming pool', 'Gym', "Kids' play area", 'EV charging', 'Co-working lounge', '24x7 security', 'Power backup', 'Landscaped garden'] }, T),
    project('prj_2', 'dev_1', { name: 'Sahyadri Greens', locality: 'Wakad', constructionStatus: 'ready_to_move', possession: '2026-03', status: 'published', configs: [cfg(1, [440, 480], [55, 62], 60, 6), cfg(2, [640, 720], [74, 92], 140, 18)] }, T),
    project('prj_3', 'dev_1', { name: 'Sahyadri Riverwalk', locality: 'Kharadi', constructionStatus: 'new_launch', possession: '2028-06', status: 'published', cpApprovalRequired: true, featured: true, configs: [cfg(2, [820, 900], [1.1, 1.32], 100, 72, 'Cr'), cfg(3, [1150, 1320], [1.55, 1.9], 90, 66, 'Cr')] }, T),
    project('prj_4', 'dev_1', { name: 'Sahyadri Villas Tathawade', locality: 'Tathawade', propertyType: 'villa', possession: '2027-09', status: 'published', configs: [cfg(3, [1650, 1820], [1.8, 2.15], 24, 9, 'Cr'), cfg(4, [2150, 2400], [2.45, 2.9], 16, 7, 'Cr')] }, T),
    project('prj_5', 'dev_1', { name: 'Sahyadri Hilltop', locality: 'Hinjawadi', possession: '2027-03', status: 'published', configs: [cfg(1, [420, 470], [48, 56], 90, 22), cfg(2, [610, 690], [68, 85], 160, 47)] }, T),
    project('prj_6', 'dev_2', { name: 'Indrayani Horizon', locality: 'Hinjawadi', featured: true, possession: '2027-06', status: 'published', configs: [cfg(2, [700, 790], [78, 96], 150, 41), cfg(3, [980, 1100], [1.08, 1.3], 70, 19, 'Cr')] }, T),
    project('prj_7', 'dev_2', { name: 'Indrayani Meadows', locality: 'Hadapsar', possession: '2026-12', status: 'published', configs: [cfg(1, [430, 470], [52, 58], 50, 8), cfg(2, [650, 720], [72, 86], 120, 29), cfg(3, [950, 1050], [98, 115], 60, 14)] }, T),
    project('prj_8', 'dev_2', { name: 'Indrayani Crest', locality: 'Baner', featured: true, constructionStatus: 'new_launch', possession: '2028-03', status: 'published', configs: [cfg(3, [1350, 1480], [1.9, 2.35], 60, 44, 'Cr'), cfg(4, [1850, 2050], [2.8, 3.4], 30, 23, 'Cr')] }, T),
    project('prj_9', 'dev_2', { name: 'Indrayani Nest', locality: 'Tathawade', constructionStatus: 'ready_to_move', possession: '2026-01', status: 'published', configs: [cfg(1, [400, 450], [45, 52], 80, 4), cfg(2, [600, 680], [64, 78], 120, 11)] }, T),
    project('prj_10', 'dev_2', { name: 'Indrayani Bayview', locality: 'Kharadi', possession: '2028-09', status: 'submitted', registrationReview: 'not_reviewed', configs: [cfg(2, [760, 840], [1.02, 1.2], 110, 110, 'Cr'), cfg(3, [1050, 1180], [1.4, 1.7], 70, 70, 'Cr')] }, T),
    project('prj_11', 'dev_3', { name: 'Mulshi Crest Aria', locality: 'Wakad', possession: '2028-12', status: 'draft', registrationReview: 'not_reviewed', configs: [cfg(2, [720, 800], [82, 98], 80, 80)] }, T),
    project('prj_12', 'dev_3', { name: 'Mulshi Crest Orchard', locality: 'Hadapsar', propertyType: 'villa', possession: '2028-06', status: 'changes_requested', registrationReview: 'mismatch', reviewNote: 'Registration number format does not match the uploaded certificate. Please re-check (demo).', configs: [cfg(3, [1500, 1700], [1.45, 1.75], 20, 20, 'Cr'), cfg(4, [1900, 2100], [1.95, 2.3], 12, 12, 'Cr')] }, T),
  );

  // ---------- Project interest (separate from city preferences) ----------
  const interest = (cp: string, prj: string, t: Millis) => setInterest(s, at(t, `user_${cp}`), cp, prj, true);
  const iT = T - 10 * DAY;
  [['cp_1', 'prj_1'], ['cp_1', 'prj_2'], ['cp_1', 'prj_5'], ['cp_1', 'prj_6'], ['cp_1', 'prj_8'],
   ['cp_2', 'prj_1'], ['cp_2', 'prj_3'], ['cp_2', 'prj_7'], ['cp_2', 'prj_8'],
   ['cp_3', 'prj_2'], ['cp_3', 'prj_5'], ['cp_3', 'prj_9'], ['cp_3', 'prj_6'],
   ['cp_4', 'prj_1'], ['cp_4', 'prj_6'], ['cp_4', 'prj_3'], ['cp_4', 'prj_8'],
   ['cp_6', 'prj_6']].forEach(([c, p], i) => interest(c, p, iT + i * MIN));
  // Developer approval (enabled on Riverwalk): approve cp_2, leave cp_4 pending.
  const int2 = s.interests.find((i) => i.cpId === 'cp_2' && i.projectId === 'prj_3')!;
  decideInterest(s, at(iT + HOUR, 'user_dev_1'), 'dev_1', int2.id, true);
  // cp_6 registered interest, then was suspended. Its interest stays recorded but it cannot bid.
  reviewCp(s, at(T - 4 * DAY), 'cp_6', 'suspended', 'Suspended after repeated customer complaints (demo scenario).');

  // ---------- Wallet top-ups (simulated gateway) ----------
  const topUp = (cp: string, amount: number, t: Millis, outcome: 'succeeded' | 'failed' = 'succeeded') => {
    const p = createTopUp(s, at(t, `user_${cp}`), cp, amount);
    handlePaymentCallback(s, at(t + 2000, 'gateway-sim'), p.id, outcome);
  };
  const wT = T - 6 * DAY;
  topUp('cp_1', 500_000, wT); topUp('cp_1', 500_000, wT + HOUR);
  topUp('cp_2', 1_000_000, wT); topUp('cp_2', 500_000, wT + 2 * HOUR);
  topUp('cp_3', 100_000, wT); topUp('cp_3', 500_000, wT + MIN, 'failed');
  topUp('cp_4', 1_000_000, wT); topUp('cp_4', 1_000_000, wT + 3 * HOUR);
  topUp('cp_6', 100_000, wT - 10 * DAY);

  // ---------- Enquiries ----------
  let phoneN = 0;
  const custPhone: Record<string, string> = {};
  const enquire = (who: string, t: Millis, i: Partial<EnquiryInput>) => {
    if (!custPhone[who]) { phoneN += 1; custPhone[who] = `+91 99999 ${String(phoneN).padStart(5, '0')}`; }
    const first = who.split(' ')[0].toLowerCase();
    return submitEnquiry(s, at(t, 'web'), {
      name: who, phone: custPhone[who], email: `${first}.demo@example.com`, allowAlternatives: false, budgetMin: lakh(70), budgetMax: lakh(100), bhk: [2],
      preferredLocalities: [], timeline: '3_6_months', purpose: 'self_use', contactPreference: 'call', contactTime: 'evening',
      consentShare: true, consentMarketing: false, source: 'web:project-detail', ...i,
    });
  };
  const verify = (id: string, t: Millis) => verifyOtp(s, at(t, 'web'), id, '123456');
  const qualify = (id: string, t: Millis, evidence: string[]) => qualifyEnquiry(s, at(t), id, { result: 'qualified', checks: okChecks, evidence, internalNote: 'Spoke briefly; requirement confirmed (demo).' }).lead!;
  const bid = (auc: string, cp: string, amount: number, t: Millis) => {
    const r = placeBid(s, at(t, `user_${cp}`), auc, cp, rupees(amount));
    if (!r.ok) throw new Error(`Seed bid failed: ${r.message}`);
  };

  // E1 (Ananya, older): Wakad Greens → auction A4 assigned to cp_1, later disputed.
  const e1 = enquire('Ananya Rao', T - 4 * DAY, { projectId: 'prj_2', budgetMin: lakh(65), budgetMax: lakh(90), bhk: [2], timeline: '1_3_months', visitAvailability: 'Weekends after 11 am' });
  verify(e1.id, T - 4 * DAY + MIN);
  const l1 = qualify(e1.id, T - 4 * DAY + 2 * HOUR, ['Demo OTP verified', 'Budget & BHK confirmed on call (demo)', 'Timeline: 1–3 months confirmed']);
  const a4 = startAuction(s, at(T - 3 * DAY), l1.id);
  bid(a4.id, 'cp_3', 500, T - 3 * DAY + 2 * MIN);
  bid(a4.id, 'cp_1', 700, T - 3 * DAY + 4 * MIN);
  bid(a4.id, 'cp_3', 800, T - 3 * DAY + 5 * MIN);
  bid(a4.id, 'cp_1', 900, T - 3 * DAY + 7 * MIN);
  const r4 = settleAuction(s, at(a4.endsAt + 1000, 'system'), a4.id);
  const asg4 = r4.assignment!;
  logOutreachPreview(s, at(a4.endsAt + 20 * MIN, 'user_cp_1'), 'cp_1', asg4.id, 'call_preview', 'Called, no answer');
  logOutreachPreview(s, at(a4.endsAt + 5 * HOUR, 'user_cp_1'), 'cp_1', asg4.id, 'call_preview', 'Number not reachable');
  addNote(s, at(a4.endsAt + 5 * HOUR + MIN, 'user_cp_1'), 'cp_1', asg4.id, 'Tried twice, number not reachable. Will try WhatsApp.');
  raiseDispute(s, at(T - 1 * DAY, 'user_cp_1'), 'cp_1', asg4.id, 'invalid_contact', 'Three call attempts over two days returned "number not reachable"; WhatsApp message not delivered (demo evidence).');

  // E2 (Rohit): Baner Crest → A3 assigned to cp_2 after a leader raise.
  const e2 = enquire('Rohit Mehta', T - 3 * DAY, { projectId: 'prj_8', budgetMin: crore(2), budgetMax: crore(2.6), bhk: [3], timeline: 'immediate', purpose: 'self_use', contactPreference: 'whatsapp', contactTime: 'morning', allowAlternatives: true, preferredLocalities: ['Baner'], visitAvailability: 'Saturday morning' });
  verify(e2.id, T - 3 * DAY + MIN);
  const l2 = qualify(e2.id, T - 3 * DAY + HOUR, ['Demo OTP verified', 'Requirement confirmed on call (demo)', 'Ready to visit this month']);
  const a3 = startAuction(s, at(T - 2 * DAY), l2.id);
  bid(a3.id, 'cp_1', 900, T - 2 * DAY + MIN);
  bid(a3.id, 'cp_2', 1000, T - 2 * DAY + 2 * MIN);
  bid(a3.id, 'cp_4', 1100, T - 2 * DAY + 3 * MIN);
  bid(a3.id, 'cp_2', 1200, T - 2 * DAY + 5 * MIN);
  bid(a3.id, 'cp_2', 1300, T - 2 * DAY + 6 * MIN); // leader raise: holds only +100
  const asg3 = settleAuction(s, at(a3.endsAt + 1000, 'system'), a3.id).assignment!;
  const c2 = at(a3.endsAt + 30 * MIN, 'user_cp_2');
  logOutreachPreview(s, c2, 'cp_2', asg3.id, 'message_preview', 'Intro message about Indrayani Crest');
  setStage(s, at(a3.endsAt + 2 * HOUR, 'user_cp_2'), 'cp_2', asg3.id, 'contacted');
  setStage(s, at(a3.endsAt + 3 * HOUR, 'user_cp_2'), 'cp_2', asg3.id, 'qualified');
  addNote(s, at(a3.endsAt + 3 * HOUR, 'user_cp_2'), 'cp_2', asg3.id, 'Prefers east-facing 3 BHK on a higher floor. Wants to compare with Sahyadri Skyline.');
  scheduleVisit(s, at(a3.endsAt + 4 * HOUR, 'user_cp_2'), 'cp_2', asg3.id, 'prj_8', T + 1 * DAY + 4 * HOUR, 'Meet at sales lounge');
  addReminder(s, at(a3.endsAt + 4 * HOUR, 'user_cp_2'), 'cp_2', asg3.id, 'Confirm visit and share floor plans', T + 3 * HOUR);

  // E3 (Sneha): Tathawade Nest → A6 expires with no bids.
  const e3 = enquire('Sneha Kulkarni', T - 2 * DAY, { projectId: 'prj_9', budgetMin: lakh(45), budgetMax: lakh(55), bhk: [1], timeline: '6_12_months', purpose: 'investment', contactPreference: 'email' });
  verify(e3.id, T - 2 * DAY + MIN);
  const l3 = qualify(e3.id, T - 2 * DAY + HOUR, ['Demo OTP verified', 'Investment purchase, 6–12 months']);
  const a6 = startAuction(s, at(T - 1 * DAY), l3.id);
  settleAuction(s, at(a6.endsAt + 1000, 'system'), a6.id);

  // E4 (Imran): Hadapsar Meadows → A5 cancelled when customer withdrew consent.
  const e4 = enquire('Imran Qureshi', T - 1 * DAY, { projectId: 'prj_7', budgetMin: lakh(70), budgetMax: lakh(88), bhk: [2], timeline: '3_6_months' });
  verify(e4.id, T - 1 * DAY + MIN);
  const l4 = qualify(e4.id, T - 1 * DAY + HOUR, ['Demo OTP verified', 'Requirement confirmed (demo)']);
  const a5 = startAuction(s, at(T - 6 * HOUR), l4.id);
  bid(a5.id, 'cp_2', 500, T - 6 * HOUR + MIN);
  withdrawConsent(s, at(T - 6 * HOUR + 3 * MIN, 'web'), e4.id);

  // E5 (Ananya again, a legitimate new enquiry): Baner Skyline → A1 LIVE.
  const e5 = enquire('Ananya Rao', T - 3 * HOUR, { projectId: 'prj_1', budgetMin: lakh(95), budgetMax: crore(1.2), bhk: [2, 3], timeline: '1_3_months', contactPreference: 'call', contactTime: 'evening', visitAvailability: 'Sunday afternoon', message: 'Please call after 6 pm, I am in office during the day.' });
  verify(e5.id, T - 3 * HOUR + MIN);
  resolveDuplicate(s, at(T - 2 * HOUR), e5.id, 'cleared', 'Different project and budget — legitimate repeat enquiry');
  const l5 = qualify(e5.id, T - 2 * HOUR + MIN, ['Demo OTP verified', 'Budget & BHK confirmed on call (demo)', 'Repeat customer — new requirement']);
  const a1 = startAuction(s, at(T - 2 * MIN), l5.id);
  bid(a1.id, 'cp_4', 500, T - 100_000);
  bid(a1.id, 'cp_2', 600, T - 70_000);

  // E6 (Priya): Hinjawadi Horizon → A2 LIVE, 30 min, no bids yet.
  const e6 = enquire('Priya Nair', T - 5 * HOUR, { projectId: 'prj_6', budgetMin: lakh(80), budgetMax: lakh(98), bhk: [2], timeline: 'immediate', purpose: 'self_use', contactPreference: 'whatsapp', contactTime: 'anytime' });
  verify(e6.id, T - 5 * HOUR + MIN);
  const l6 = qualify(e6.id, T - 4 * HOUR, ['Demo OTP verified', 'Relocating for work — immediate need (demo)']);
  startAuction(s, at(T - 1 * MIN), l6.id, { startPrice: rupees(500), increment: rupees(100), durationMs: 30 * MIN });

  // E7 (Aakash): qualified, ready to auction (Hinjawadi Hilltop).
  const e7 = enquire('Aakash Jain', T - 90 * MIN, { projectId: 'prj_5', budgetMin: lakh(60), budgetMax: lakh(80), bhk: [2], timeline: '1_3_months' });
  verify(e7.id, T - 89 * MIN);
  qualify(e7.id, T - 30 * MIN, ['Demo OTP verified', 'Budget & BHK confirmed on call (demo)']);

  // E8 (Neha): general enquiry, alternatives allowed → multi-project matching preview.
  const e8 = enquire('Neha Pawar', T - 70 * MIN, { projectId: undefined, allowAlternatives: true, preferredLocalities: ['Baner', 'Hinjawadi'], budgetMin: lakh(80), budgetMax: crore(1.3), bhk: [2, 3], timeline: '3_6_months', source: 'web:general-enquiry' });
  verify(e8.id, T - 69 * MIN);

  // E9 (Siddharth): Kharadi Riverwalk (developer approval needed for CP access).
  const e9 = enquire('Siddharth Menon', T - 50 * MIN, { projectId: 'prj_3', budgetMin: crore(1.1), budgetMax: crore(1.4), bhk: [2], timeline: '3_6_months', purpose: 'investment' });
  verify(e9.id, T - 49 * MIN);

  // E10 (Fatima): OTP not completed yet.
  enquire('Fatima Sheikh', T - 40 * MIN, { projectId: 'prj_1', budgetMin: lakh(90), budgetMax: crore(1.1), bhk: [2] });

  // E11 (Gaurav): rejected (unrealistic budget for project).
  const e11 = enquire('Gaurav Thakur', T - 2 * DAY, { projectId: 'prj_4', budgetMin: lakh(40), budgetMax: lakh(50), bhk: [4], timeline: 'exploring' });
  verify(e11.id, T - 2 * DAY + MIN);
  qualifyEnquiry(s, at(T - 2 * DAY + 3 * HOUR), e11.id, { result: 'rejected', checks: { ...okChecks, requirementsComplete: false }, evidence: ['Stated budget far below project price range'], internalNote: 'Customer confirmed they were just browsing (demo).' });

  // E12 (Rohit again): possible duplicate of his assigned Baner enquiry → flagged for review.
  const e12 = enquire('Rohit Mehta', T - 25 * MIN, { projectId: 'prj_8', budgetMin: crore(2), budgetMax: crore(2.5), bhk: [3], timeline: 'immediate' });
  verify(e12.id, T - 24 * MIN);

  // E14 (Karan): submitted twice in a row → second confirmed duplicate.
  const e14a = enquire('Karan Bedi', T - 8 * HOUR, { projectId: 'prj_6', budgetMin: lakh(90), budgetMax: crore(1.2), bhk: [3], timeline: '6_12_months' });
  verify(e14a.id, T - 8 * HOUR + MIN);
  const e14 = enquire('Karan Bedi', T - 8 * HOUR + 5 * MIN, { projectId: 'prj_6', budgetMin: lakh(90), budgetMax: crore(1.2), bhk: [3], timeline: '6_12_months' });
  verify(e14.id, T - 8 * HOUR + 6 * MIN);
  resolveDuplicate(s, at(T - 7 * HOUR), e14.id, 'confirmed', 'Same requirement submitted twice within minutes');
  must(s.enquiries, e14a.id, 'Enquiry'); // e14a remains in qualification queue

  // E15 (Lata): villa enquiry awaiting qualification.
  const e15 = enquire('Lata Deshpande', T - 15 * MIN, { projectId: 'prj_4', budgetMin: crore(1.8), budgetMax: crore(2.3), bhk: [3], timeline: '3_6_months', contactPreference: 'email', contactTime: 'morning', consentMarketing: true });
  verify(e15.id, T - 14 * MIN);

  // Clear seed-time noise: keep notifications but mark older ones read.
  for (const n of s.notifications) if (n.at < T - 2 * HOUR) n.read = true;
  return s;
}
