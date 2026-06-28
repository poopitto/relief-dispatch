import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

// ── Lifecycle label tables (kept verbatim with the contract enums) ───────────
export const ROUND_STATUS = ["OPEN", "DONATIONS_CLOSED", "SEALED", "ALLOCATED", "FINALISED"] as const;
export const PETITION_STATUS = [
  "FILED",          // 0
  "AUDITED_T1",     // 1
  "AUDITED_T2",     // 2
  "TENSION_FLAGGED",// 3
  "TENSION_RESOLVED",// 4
  "ALLOCATED",      // 5
  "RELEASING",      // 6
  "RELEASED",       // 7
  "REJECTED",       // 8
  "CHALLENGED",     // 9
  "OVERTURNED",     // 10
] as const;
export const TENSION_STATUS = ["DETECTED", "RESOLVED", "DISMISSED"] as const;
export const CHALLENGE_STATUS = ["OPEN", "SUCCEEDED", "FAILED"] as const;

export type Ruling =
  | "ELIGIBLE"
  | "PARTIAL"
  | "INELIGIBLE"
  | "DUPLICATE_CLAIM"
  | "CONTRADICTED_BY_PEER"
  | "CHALLENGED"
  | "OVERTURNED"
  | "";

// ── Domain types ─────────────────────────────────────────────────────────---
export interface RoundView {
  roundId: number;
  status: number;
  startEpoch: number;
  endEpoch: number;
  matchingPoolWei: string;
  matchingPoolRemainingWei: string;
  totalContributionsWei: string;
  totalQfWeight: string;
  petitionIds: number[];
  sealedEpoch: number;
  allocatedEpoch: number;
  finalisedEpoch: number;
}

export interface ActiveRound {
  hasActiveRound: boolean;
  roundId: number;
  status: number;
  startEpoch: number;
  endEpoch: number;
  matchingPoolWei: string;
  matchingPoolRemainingWei: string;
  totalContributionsWei: string;
  petitionCount: number;
}

export interface PoolState {
  currentEpoch: number;
  activeRoundSet: boolean;
  activeRoundId: number;
  activePoolWei: string;
  totalPaidWei: string;
  totalSlashedWei: string;
  totalBountyPaidWei: string;
}

export interface PetitionView {
  petitionId: number;
  roundId: number;
  petitioner: string;
  region: string;
  regionKey: string;
  title: string;
  evidence: string;
  bond: string;
  filedEpoch: number;
  status: number;
  t1AffectedPct: number;
  t1Ruling: Ruling;
  t1Rationale: string;
  t1AuditedEpoch: number;
  t2AffectedPct: number;
  t2Ruling: Ruling;
  t2Rationale: string;
  t2AuditedEpoch: number;
  t2Required: boolean;
  finalAffectedPct: number;
  finalRuling: Ruling;
  tensionMaxScore: number;
  tensionLinks: number[];
  tensionWinner: boolean;
  tensionLoser: boolean;
  contributionIds: number[];
  uniqueDonors: number;
  rawDonationsWei: string;
  qfWeightUnits: string;
  qfWeightAdjusted: string;
  allocationWei: string;
  releasedWei: string;
  tranchesTotal: number;
  tranchesReleased: number;
  tranchesLastEpoch: number;
  proofs: string[];
  challengeId: number;
  challengeOpen: boolean;
}
export interface PetitionRow extends PetitionView { id: number; }

export interface ContributionView {
  contributionId: number;
  petitionId: number;
  donor: string;
  amountWei: string;
  epoch: number;
  qfRootUnits: string;
}

export interface TensionLinkView {
  linkId: number;
  petitionA: number;
  petitionB: number;
  similarityScore: number;
  contradictionScore: number;
  status: number;
  winner: number;
  rationale: string;
  detectedEpoch: number;
  resolvedEpoch: number;
}

export interface ChallengeView {
  challengeId: number;
  petitionId: number;
  challenger: string;
  bondWei: string;
  rationale: string;
  openedEpoch: number;
  status: number;
  bountyPaidWei: string;
  newAffectedPct: number;
  newRuling: Ruling;
}

export interface TrancheView {
  trancheId: number;
  petitionId: number;
  index: number;
  amountWei: string;
  releasedEpoch: number;
  proofSummary: string;
}

export interface ProfileView {
  address: string;
  reputationScore: number;
  petitionsFiled: number;
  petitionsEligible: number;
  petitionsPartial: number;
  petitionsRejected: number;
  petitionsOverturned: number;
  totalReceivedWei: string;
  registeredEpoch: number;
}

export interface QfPreview {
  petitionId: number;
  myQfWeightAdjusted: number;
  roundTotalWeight: number;
  roundPoolRemainingWei: string;
  predictedMatchWei: string;
}

export interface DonorTotal {
  petitionId: number;
  donor: string;
  totalWei: string;
  contributionCount: number;
  qfRootUnits: number;
}

export interface VintageDecay {
  petitionId: number;
  filedEpoch: number;
  currentEpoch: number;
  decayBps: number;
  decayFloorBps: number;
  decayPerEpochBps: number;
}

export interface RoundSummary {
  roundId: number;
  status: number;
  petitionCount: number;
  statusHistogram: Record<string, number>;
  rulingHistogram: Record<string, number>;
  matchingPoolWei: string;
  matchingPoolRemainingWei: string;
  totalContributionsWei: string;
  totalAllocationWei: string;
  totalReleasedWei: string;
  uniqueDonorsCount: number;
  sealedEpoch: number;
  allocatedEpoch: number;
  finalisedEpoch: number;
}

export interface QfBreakdownDonor {
  donor: string;
  totalWei: string;
  qfUnits: number;
  qfRoot: number;
}
export interface QfBreakdown {
  petitionId: number;
  uniqueDonors: number;
  rawDonationsWei: string;
  qfWeightUnitsRecomputed: number;
  qfWeightUnitsStored: string;
  qfWeightAdjustedStored: string;
  donorBreakdown: QfBreakdownDonor[];
}

export interface RegionDensity {
  region: string;
  regionKey: string;
  density: number;
  minBondWei: string;
  requiredBondWei: string;
}

export interface LeaderboardEntry {
  address: string;
  reputationScore: number;
  petitionsFiled: number;
  petitionsEligible: number;
  petitionsOverturned: number;
  totalReceivedWei: string;
}

export interface Constants {
  ELIGIBLE_FLOOR: number;
  PARTIAL_FLOOR: number;
  AFFECTED_TOL: number;
  T2_DELTA_TOL: number;
  T2_TRIGGER_LOWER: number;
  T2_TRIGGER_UPPER: number;
  TENSION_TOL: number;
  TENSION_DUPLICATE_FLOOR: number;
  TENSION_CONTRADICTION_FLOOR: number;
  VINTAGE_BPS_PER_EPOCH: number;
  VINTAGE_FLOOR_BPS: number;
  QF_UNIT_WEI: string;
  QF_MAX_DONORS_PER_PETITION: number;
  MIN_BOND_WEI: string;
  DENSITY_NUMER: number;
  DENSITY_DENOM: number;
  CHALLENGE_BOND_BPS_OF_ALLOC: number;
  WHISTLEBLOWER_BOUNTY_BPS: number;
  ROUND_MIN_DURATION_EPOCHS: number;
  ROUND_MAX_PETITIONS: number;
  TRANCHE_EXPIRY_EPOCHS: number;
  ELIGIBLE_TRANCHES: number;
  PARTIAL_TRANCHES: number;
  REPUTATION_MAX: number;
  INITIAL_REPUTATION: number;
  REP_GAIN_ELIGIBLE: number;
  REP_LOSS_OVERTURN: number;
}

export interface Counts {
  nextRoundId: number;
  nextPetitionId: number;
  nextContributionId: number;
  nextTensionId: number;
  nextChallengeId: number;
  eligibleCount: number;
  partialCount: number;
  rejectedCount: number;
  overturnedCount: number;
  bountyPaidCount: number;
  totalPaidWei: string;
  totalBountyPaidWei: string;
}

// ── Protocol constants mirrored client-side (density bond preview) ───────────
export const MIN_BOND_WEI = 5_000_000_000_000_000n; // 0.005 GEN
export const DENSITY_NUMER = 12n;
export const DENSITY_DENOM = 10n;
export const QF_UNIT_WEI = 10_000_000_000_000n; // 1e13 wei = 1 QF unit
export const CHALLENGE_BOND_BPS_OF_ALLOC = 1500n;

export function requiredBondWei(density: number): bigint {
  const d = BigInt(Math.max(0, Math.floor(density)));
  return (MIN_BOND_WEI * (DENSITY_DENOM + d * DENSITY_NUMER)) / DENSITY_DENOM;
}
export function challengeBondWei(allocationWei: bigint): bigint {
  return (allocationWei * CHALLENGE_BOND_BPS_OF_ALLOC) / 10_000n;
}

// ── Clients ──────────────────────────────────────────────────────────────--
function readClient() { return createClient({ chain: studionet, account: createAccount() }); }
function writeClient(account: Hex) { return createClient({ chain: studionet, account }); }

async function waitAccepted(client: any, hash: Hex) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS);
  });
  try {
    await Promise.race([
      client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }),
      timeout,
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

// ── Defensive parsing helpers ────────────────────────────────────────────---
function pick(obj: any, key: string, idx: number): any {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) return obj[idx];
  if (typeof obj === "object" && key in obj) return obj[key];
  return undefined;
}
function numArr(v: any): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x) || 0);
}
function strArr(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}
function asStr(v: any, fallback = "0"): string {
  if (v == null) return fallback;
  return String(v);
}

async function writeTx(account: Hex, functionName: string, args: any[], value: bigint): Promise<Hex> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName,
    args,
    value,
  })) as Hex;
  await waitAccepted(wc, h);
  return h;
}

async function read(functionName: string, args: any[] = []): Promise<any> {
  return readClient().readContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName,
    args,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// WRITES
// ════════════════════════════════════════════════════════════════════════════
export async function registerPetitioner(account: Hex): Promise<void> {
  await writeTx(account, "register_petitioner", [], 0n);
}

export async function startRound(account: Hex, endEpochOffset: number, poolWei: bigint): Promise<number> {
  await writeTx(account, "start_round", [endEpochOffset], poolWei);
  const c = await getCounts();
  return c.nextRoundId - 1;
}

export async function closeRoundDonations(account: Hex): Promise<void> {
  await writeTx(account, "close_round_donations", [], 0n);
}

export async function sealRound(account: Hex): Promise<void> {
  await writeTx(account, "seal_round", [], 0n);
}

export async function finaliseRound(account: Hex, roundId: number): Promise<void> {
  await writeTx(account, "finalise_round", [roundId], 0n);
}

export async function topUpActivePool(account: Hex, valueWei: bigint): Promise<void> {
  await writeTx(account, "top_up_active_pool", [], valueWei);
}

export async function filePetition(
  account: Hex,
  f: { title: string; region: string; evidence: string; bondWei: bigint }
): Promise<number> {
  await writeTx(account, "file_petition", [f.title.trim(), f.region.trim(), f.evidence.trim()], f.bondWei);
  const c = await getCounts();
  return c.nextPetitionId - 1;
}

export async function donateToPetition(account: Hex, petitionId: number, valueWei: bigint): Promise<void> {
  await writeTx(account, "donate_to_petition", [petitionId], valueWei);
}

export async function adjudicateT1(account: Hex, petitionId: number): Promise<void> {
  await writeTx(account, "adjudicate_t1", [petitionId], 0n);
}

export async function adjudicateT2(account: Hex, petitionId: number): Promise<void> {
  await writeTx(account, "adjudicate_t2", [petitionId], 0n);
}

export async function detectTension(account: Hex, aId: number, bId: number): Promise<void> {
  await writeTx(account, "detect_tension", [aId, bId], 0n);
}

export async function resolveTension(account: Hex, linkId: number): Promise<void> {
  await writeTx(account, "resolve_tension", [linkId], 0n);
}

export async function allocateRound(account: Hex, roundId: number): Promise<void> {
  await writeTx(account, "allocate_round", [roundId], 0n);
}

export async function releaseTranche(account: Hex, petitionId: number, proofSummary: string): Promise<void> {
  await writeTx(account, "release_tranche", [petitionId, proofSummary.trim()], 0n);
}

export async function challengePetition(account: Hex, petitionId: number, rationale: string, bondWei: bigint): Promise<void> {
  await writeTx(account, "challenge_petition", [petitionId, rationale.trim()], bondWei);
}

export async function resolveChallenge(account: Hex, challengeId: number): Promise<void> {
  await writeTx(account, "resolve_challenge", [challengeId], 0n);
}

export async function advanceEpoch(account: Hex): Promise<void> {
  await writeTx(account, "advance_epoch", [], 0n);
}

export async function setAdmin(account: Hex, newAdmin: string): Promise<void> {
  await writeTx(account, "set_admin", [newAdmin], 0n);
}

// ════════════════════════════════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════════════════════════════════
export async function getRound(roundId: number): Promise<RoundView> {
  const r: any = await read("get_round", [roundId]);
  return {
    roundId: Number(pick(r, "round_id", 0) ?? roundId),
    status: Number(pick(r, "status", 1) ?? 0),
    startEpoch: Number(pick(r, "start_epoch", 2) ?? 0),
    endEpoch: Number(pick(r, "end_epoch", 3) ?? 0),
    matchingPoolWei: asStr(pick(r, "matching_pool_wei", 4)),
    matchingPoolRemainingWei: asStr(pick(r, "matching_pool_remaining_wei", 5)),
    totalContributionsWei: asStr(pick(r, "total_contributions_wei", 6)),
    totalQfWeight: asStr(pick(r, "total_qf_weight", 7)),
    petitionIds: numArr(pick(r, "petition_ids", 8)),
    sealedEpoch: Number(pick(r, "sealed_epoch", 9) ?? 0),
    allocatedEpoch: Number(pick(r, "allocated_epoch", 10) ?? 0),
    finalisedEpoch: Number(pick(r, "finalised_epoch", 11) ?? 0),
  };
}

export async function getActiveRound(): Promise<ActiveRound> {
  const r: any = await read("get_active_round", []);
  return {
    hasActiveRound: Boolean(pick(r, "has_active_round", 0) ?? false),
    roundId: Number(pick(r, "round_id", 1) ?? 0),
    status: Number(pick(r, "status", 2) ?? 0),
    startEpoch: Number(pick(r, "start_epoch", 3) ?? 0),
    endEpoch: Number(pick(r, "end_epoch", 4) ?? 0),
    matchingPoolWei: asStr(pick(r, "matching_pool_wei", 5)),
    matchingPoolRemainingWei: asStr(pick(r, "matching_pool_remaining_wei", 6)),
    totalContributionsWei: asStr(pick(r, "total_contributions_wei", 7)),
    petitionCount: Number(pick(r, "petition_count", 8) ?? 0),
  };
}

export async function getPoolState(): Promise<PoolState> {
  const r: any = await read("get_pool_state", []);
  return {
    currentEpoch: Number(pick(r, "current_epoch", 0) ?? 0),
    activeRoundSet: Boolean(pick(r, "active_round_set", 1) ?? false),
    activeRoundId: Number(pick(r, "active_round_id", 2) ?? 0),
    activePoolWei: asStr(pick(r, "active_pool_wei", 3)),
    totalPaidWei: asStr(pick(r, "total_paid_wei", 4)),
    totalSlashedWei: asStr(pick(r, "total_slashed_wei", 5)),
    totalBountyPaidWei: asStr(pick(r, "total_bounty_paid_wei", 6)),
  };
}

export async function getPetition(petitionId: number): Promise<PetitionView> {
  const p: any = await read("get_petition", [petitionId]);
  return {
    petitionId: Number(pick(p, "petition_id", 0) ?? petitionId),
    roundId: Number(pick(p, "round_id", 1) ?? 0),
    petitioner: String(pick(p, "petitioner", 2) ?? ""),
    region: String(pick(p, "region", 3) ?? ""),
    regionKey: String(pick(p, "region_key", 4) ?? ""),
    title: String(pick(p, "title", 5) ?? ""),
    evidence: String(pick(p, "evidence", 6) ?? ""),
    bond: asStr(pick(p, "bond", 7)),
    filedEpoch: Number(pick(p, "filed_epoch", 8) ?? 0),
    status: Number(pick(p, "status", 9) ?? 0),
    t1AffectedPct: Number(pick(p, "t1_affected_pct", 10) ?? 0),
    t1Ruling: String(pick(p, "t1_ruling", 11) ?? "") as Ruling,
    t1Rationale: String(pick(p, "t1_rationale", 12) ?? ""),
    t1AuditedEpoch: Number(pick(p, "t1_audited_epoch", 13) ?? 0),
    t2AffectedPct: Number(pick(p, "t2_affected_pct", 14) ?? 0),
    t2Ruling: String(pick(p, "t2_ruling", 15) ?? "") as Ruling,
    t2Rationale: String(pick(p, "t2_rationale", 16) ?? ""),
    t2AuditedEpoch: Number(pick(p, "t2_audited_epoch", 17) ?? 0),
    t2Required: Boolean(pick(p, "t2_required", 18) ?? false),
    finalAffectedPct: Number(pick(p, "final_affected_pct", 19) ?? 0),
    finalRuling: String(pick(p, "final_ruling", 20) ?? "") as Ruling,
    tensionMaxScore: Number(pick(p, "tension_max_score", 21) ?? 0),
    tensionLinks: numArr(pick(p, "tension_links", 22)),
    tensionWinner: Boolean(pick(p, "tension_winner", 23) ?? false),
    tensionLoser: Boolean(pick(p, "tension_loser", 24) ?? false),
    contributionIds: numArr(pick(p, "contribution_ids", 25)),
    uniqueDonors: Number(pick(p, "unique_donors", 26) ?? 0),
    rawDonationsWei: asStr(pick(p, "raw_donations_wei", 27)),
    qfWeightUnits: asStr(pick(p, "qf_weight_units", 28)),
    qfWeightAdjusted: asStr(pick(p, "qf_weight_adjusted", 29)),
    allocationWei: asStr(pick(p, "allocation_wei", 30)),
    releasedWei: asStr(pick(p, "released_wei", 31)),
    tranchesTotal: Number(pick(p, "tranches_total", 32) ?? 0),
    tranchesReleased: Number(pick(p, "tranches_released", 33) ?? 0),
    tranchesLastEpoch: Number(pick(p, "tranches_last_epoch", 34) ?? 0),
    proofs: strArr(pick(p, "proofs", 35)),
    challengeId: Number(pick(p, "challenge_id", 36) ?? 0),
    challengeOpen: Boolean(pick(p, "challenge_open", 37) ?? false),
  };
}

export async function getContribution(contributionId: number): Promise<ContributionView> {
  const c: any = await read("get_contribution", [contributionId]);
  return {
    contributionId: Number(pick(c, "contribution_id", 0) ?? contributionId),
    petitionId: Number(pick(c, "petition_id", 1) ?? 0),
    donor: String(pick(c, "donor", 2) ?? ""),
    amountWei: asStr(pick(c, "amount_wei", 3)),
    epoch: Number(pick(c, "epoch", 4) ?? 0),
    qfRootUnits: asStr(pick(c, "qf_root_units", 5)),
  };
}

export async function getTensionLink(linkId: number): Promise<TensionLinkView> {
  const l: any = await read("get_tension_link", [linkId]);
  return mapTensionLink(l, linkId);
}

function mapTensionLink(l: any, fallbackId = 0): TensionLinkView {
  return {
    linkId: Number(pick(l, "link_id", 0) ?? fallbackId),
    petitionA: Number(pick(l, "petition_a", 1) ?? 0),
    petitionB: Number(pick(l, "petition_b", 2) ?? 0),
    similarityScore: Number(pick(l, "similarity_score", 3) ?? 0),
    contradictionScore: Number(pick(l, "contradiction_score", 4) ?? 0),
    status: Number(pick(l, "status", 5) ?? 0),
    winner: Number(pick(l, "winner", 6) ?? 0),
    rationale: String(pick(l, "rationale", 7) ?? ""),
    detectedEpoch: Number(pick(l, "detected_epoch", 8) ?? 0),
    resolvedEpoch: Number(pick(l, "resolved_epoch", 9) ?? 0),
  };
}

export async function getChallenge(challengeId: number): Promise<ChallengeView> {
  const c: any = await read("get_challenge", [challengeId]);
  return {
    challengeId: Number(pick(c, "challenge_id", 0) ?? challengeId),
    petitionId: Number(pick(c, "petition_id", 1) ?? 0),
    challenger: String(pick(c, "challenger", 2) ?? ""),
    bondWei: asStr(pick(c, "bond_wei", 3)),
    rationale: String(pick(c, "rationale", 4) ?? ""),
    openedEpoch: Number(pick(c, "opened_epoch", 5) ?? 0),
    status: Number(pick(c, "status", 6) ?? 0),
    bountyPaidWei: asStr(pick(c, "bounty_paid_wei", 7)),
    newAffectedPct: Number(pick(c, "new_affected_pct", 8) ?? 0),
    newRuling: String(pick(c, "new_ruling", 9) ?? "") as Ruling,
  };
}

export async function getTranche(trancheId: number): Promise<TrancheView> {
  const t: any = await read("get_tranche", [trancheId]);
  return {
    trancheId: Number(pick(t, "tranche_id", 0) ?? trancheId),
    petitionId: Number(pick(t, "petition_id", 1) ?? 0),
    index: Number(pick(t, "index", 2) ?? 0),
    amountWei: asStr(pick(t, "amount_wei", 3)),
    releasedEpoch: Number(pick(t, "released_epoch", 4) ?? 0),
    proofSummary: String(pick(t, "proof_summary", 5) ?? ""),
  };
}

export async function getProfile(addrHex: string): Promise<ProfileView | null> {
  try {
    const p: any = await read("get_profile", [addrHex]);
    return {
      address: String(pick(p, "address", 0) ?? addrHex),
      reputationScore: Number(pick(p, "reputation_score", 1) ?? 0),
      petitionsFiled: Number(pick(p, "petitions_filed", 2) ?? 0),
      petitionsEligible: Number(pick(p, "petitions_eligible", 3) ?? 0),
      petitionsPartial: Number(pick(p, "petitions_partial", 4) ?? 0),
      petitionsRejected: Number(pick(p, "petitions_rejected", 5) ?? 0),
      petitionsOverturned: Number(pick(p, "petitions_overturned", 6) ?? 0),
      totalReceivedWei: asStr(pick(p, "total_received_wei", 7)),
      registeredEpoch: Number(pick(p, "registered_epoch", 8) ?? 0),
    };
  } catch {
    return null;
  }
}

export async function listPetitionsOf(addrHex: string): Promise<number[]> {
  return numArr(await read("list_petitions_of", [addrHex]));
}
export async function listContributionsOf(addrHex: string): Promise<number[]> {
  return numArr(await read("list_contributions_of", [addrHex]));
}
export async function listPetitionsInRegion(region: string): Promise<number[]> {
  return numArr(await read("list_petitions_in_region", [region]));
}
export async function listPetitionTranches(petitionId: number): Promise<number[]> {
  return numArr(await read("list_petition_tranches", [petitionId]));
}
export async function listRounds(): Promise<number[]> {
  return numArr(await read("list_rounds", []));
}
export async function listPetitions(): Promise<number[]> {
  return numArr(await read("list_petitions", []));
}
export async function listTensionLinks(): Promise<number[]> {
  return numArr(await read("list_tension_links", []));
}
export async function listChallenges(): Promise<number[]> {
  return numArr(await read("list_challenges", []));
}
export async function listProfiles(): Promise<string[]> {
  return strArr(await read("list_profiles", []));
}

export async function getCounts(): Promise<Counts> {
  const r: any = await read("get_counts", []);
  const p = String(r).split("||");
  const n = (i: number) => Number(p[i]) || 0;
  return {
    nextRoundId: n(0),
    nextPetitionId: n(1),
    nextContributionId: n(2),
    nextTensionId: n(3),
    nextChallengeId: n(4),
    eligibleCount: n(5),
    partialCount: n(6),
    rejectedCount: n(7),
    overturnedCount: n(8),
    bountyPaidCount: n(9),
    totalPaidWei: p[10] ?? "0",
    totalBountyPaidWei: p[11] ?? "0",
  };
}

export async function previewQfMatch(petitionId: number): Promise<QfPreview> {
  const r: any = await read("preview_qf_match", [petitionId]);
  return {
    petitionId: Number(pick(r, "petition_id", 0) ?? petitionId),
    myQfWeightAdjusted: Number(pick(r, "my_qf_weight_adjusted", 1) ?? 0),
    roundTotalWeight: Number(pick(r, "round_total_weight", 2) ?? 0),
    roundPoolRemainingWei: asStr(pick(r, "round_pool_remaining_wei", 3)),
    predictedMatchWei: asStr(pick(r, "predicted_match_wei", 4)),
  };
}

export async function getDonorTotalForPetition(petitionId: number, donorHex: string): Promise<DonorTotal> {
  const r: any = await read("get_donor_total_for_petition", [petitionId, donorHex]);
  return {
    petitionId: Number(pick(r, "petition_id", 0) ?? petitionId),
    donor: String(pick(r, "donor", 1) ?? donorHex),
    totalWei: asStr(pick(r, "total_wei", 2)),
    contributionCount: Number(pick(r, "contribution_count", 3) ?? 0),
    qfRootUnits: Number(pick(r, "qf_root_units", 4) ?? 0),
  };
}

export async function getVintageDecay(petitionId: number): Promise<VintageDecay> {
  const r: any = await read("get_vintage_decay", [petitionId]);
  return {
    petitionId: Number(pick(r, "petition_id", 0) ?? petitionId),
    filedEpoch: Number(pick(r, "filed_epoch", 1) ?? 0),
    currentEpoch: Number(pick(r, "current_epoch", 2) ?? 0),
    decayBps: Number(pick(r, "decay_bps", 3) ?? 0),
    decayFloorBps: Number(pick(r, "decay_floor_bps", 4) ?? 0),
    decayPerEpochBps: Number(pick(r, "decay_per_epoch_bps", 5) ?? 0),
  };
}

export async function getRoundSummary(roundId: number): Promise<RoundSummary> {
  const r: any = await read("get_round_summary", [roundId]);
  const sh = pick(r, "status_histogram", 3) ?? {};
  const rh = pick(r, "ruling_histogram", 4) ?? {};
  const toRec = (o: any): Record<string, number> => {
    const out: Record<string, number> = {};
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) out[k] = Number(o[k]) || 0;
    }
    return out;
  };
  return {
    roundId: Number(pick(r, "round_id", 0) ?? roundId),
    status: Number(pick(r, "status", 1) ?? 0),
    petitionCount: Number(pick(r, "petition_count", 2) ?? 0),
    statusHistogram: toRec(sh),
    rulingHistogram: toRec(rh),
    matchingPoolWei: asStr(pick(r, "matching_pool_wei", 5)),
    matchingPoolRemainingWei: asStr(pick(r, "matching_pool_remaining_wei", 6)),
    totalContributionsWei: asStr(pick(r, "total_contributions_wei", 7)),
    totalAllocationWei: asStr(pick(r, "total_allocation_wei", 8)),
    totalReleasedWei: asStr(pick(r, "total_released_wei", 9)),
    uniqueDonorsCount: Number(pick(r, "unique_donors_count", 10) ?? 0),
    sealedEpoch: Number(pick(r, "sealed_epoch", 11) ?? 0),
    allocatedEpoch: Number(pick(r, "allocated_epoch", 12) ?? 0),
    finalisedEpoch: Number(pick(r, "finalised_epoch", 13) ?? 0),
  };
}

export async function getPetitionQfBreakdown(petitionId: number): Promise<QfBreakdown> {
  const r: any = await read("get_petition_qf_breakdown", [petitionId]);
  const raw = pick(r, "donor_breakdown", 6);
  const donors: QfBreakdownDonor[] = Array.isArray(raw)
    ? raw.map((d: any) => ({
        donor: String(pick(d, "donor", 0) ?? ""),
        totalWei: asStr(pick(d, "total_wei", 1)),
        qfUnits: Number(pick(d, "qf_units", 2) ?? 0),
        qfRoot: Number(pick(d, "qf_root", 3) ?? 0),
      }))
    : [];
  return {
    petitionId: Number(pick(r, "petition_id", 0) ?? petitionId),
    uniqueDonors: Number(pick(r, "unique_donors", 1) ?? 0),
    rawDonationsWei: asStr(pick(r, "raw_donations_wei", 2)),
    qfWeightUnitsRecomputed: Number(pick(r, "qf_weight_units_recomputed", 3) ?? 0),
    qfWeightUnitsStored: asStr(pick(r, "qf_weight_units_stored", 4)),
    qfWeightAdjustedStored: asStr(pick(r, "qf_weight_adjusted_stored", 5)),
    donorBreakdown: donors,
  };
}

export async function getTensionLinksForPetition(petitionId: number): Promise<TensionLinkView[]> {
  const r: any = await read("get_tension_links_for_petition", [petitionId]);
  if (!Array.isArray(r)) return [];
  return r.map((l: any) => mapTensionLink(l));
}

export async function getRegionDensity(region: string): Promise<RegionDensity> {
  const r: any = await read("get_region_density", [region]);
  return {
    region: String(pick(r, "region", 0) ?? region),
    regionKey: String(pick(r, "region_key", 1) ?? ""),
    density: Number(pick(r, "density", 2) ?? 0),
    minBondWei: asStr(pick(r, "min_bond_wei", 3)),
    requiredBondWei: asStr(pick(r, "required_bond_wei", 4)),
  };
}

export async function getLeaderboardByReputation(topN: number): Promise<LeaderboardEntry[]> {
  const r: any = await read("get_leaderboard_by_reputation", [topN]);
  if (!Array.isArray(r)) return [];
  return r.map((e: any) => ({
    address: String(pick(e, "address", 0) ?? ""),
    reputationScore: Number(pick(e, "reputation_score", 1) ?? 0),
    petitionsFiled: Number(pick(e, "petitions_filed", 2) ?? 0),
    petitionsEligible: Number(pick(e, "petitions_eligible", 3) ?? 0),
    petitionsOverturned: Number(pick(e, "petitions_overturned", 4) ?? 0),
    totalReceivedWei: asStr(pick(e, "total_received_wei", 5)),
  }));
}

export async function getConstants(): Promise<Constants> {
  const r: any = await read("get_constants", []);
  const n = (k: string) => Number(pick(r, k, 0) ?? 0);
  return {
    ELIGIBLE_FLOOR: n("ELIGIBLE_FLOOR"),
    PARTIAL_FLOOR: n("PARTIAL_FLOOR"),
    AFFECTED_TOL: n("AFFECTED_TOL"),
    T2_DELTA_TOL: n("T2_DELTA_TOL"),
    T2_TRIGGER_LOWER: n("T2_TRIGGER_LOWER"),
    T2_TRIGGER_UPPER: n("T2_TRIGGER_UPPER"),
    TENSION_TOL: n("TENSION_TOL"),
    TENSION_DUPLICATE_FLOOR: n("TENSION_DUPLICATE_FLOOR"),
    TENSION_CONTRADICTION_FLOOR: n("TENSION_CONTRADICTION_FLOOR"),
    VINTAGE_BPS_PER_EPOCH: n("VINTAGE_BPS_PER_EPOCH"),
    VINTAGE_FLOOR_BPS: n("VINTAGE_FLOOR_BPS"),
    QF_UNIT_WEI: asStr(pick(r, "QF_UNIT_WEI", 0)),
    QF_MAX_DONORS_PER_PETITION: n("QF_MAX_DONORS_PER_PETITION"),
    MIN_BOND_WEI: asStr(pick(r, "MIN_BOND_WEI", 0)),
    DENSITY_NUMER: n("DENSITY_NUMER"),
    DENSITY_DENOM: n("DENSITY_DENOM"),
    CHALLENGE_BOND_BPS_OF_ALLOC: n("CHALLENGE_BOND_BPS_OF_ALLOC"),
    WHISTLEBLOWER_BOUNTY_BPS: n("WHISTLEBLOWER_BOUNTY_BPS"),
    ROUND_MIN_DURATION_EPOCHS: n("ROUND_MIN_DURATION_EPOCHS"),
    ROUND_MAX_PETITIONS: n("ROUND_MAX_PETITIONS"),
    TRANCHE_EXPIRY_EPOCHS: n("TRANCHE_EXPIRY_EPOCHS"),
    ELIGIBLE_TRANCHES: n("ELIGIBLE_TRANCHES"),
    PARTIAL_TRANCHES: n("PARTIAL_TRANCHES"),
    REPUTATION_MAX: n("REPUTATION_MAX"),
    INITIAL_REPUTATION: n("INITIAL_REPUTATION"),
    REP_GAIN_ELIGIBLE: n("REP_GAIN_ELIGIBLE"),
    REP_LOSS_OVERTURN: n("REP_LOSS_OVERTURN"),
  };
}

// ── Aggregate loaders ────────────────────────────────────────────────────--
export async function loadPetitions(ids: number[], maxRows = 120): Promise<PetitionRow[]> {
  if (ids.length === 0) return [];
  const slice = ids.slice(-maxRows);
  const rows = await Promise.all(
    slice.map(async (id) => {
      try { const p = await getPetition(id); return { id, ...p }; } catch { return null; }
    })
  );
  return rows.filter((r): r is PetitionRow => r !== null);
}

export async function loadTensionLinks(ids: number[]): Promise<TensionLinkView[]> {
  if (ids.length === 0) return [];
  const rows = await Promise.all(
    ids.map(async (id) => {
      try { return await getTensionLink(id); } catch { return null; }
    })
  );
  return rows.filter((r): r is TensionLinkView => r !== null);
}

export async function loadChallenges(ids: number[]): Promise<ChallengeView[]> {
  if (ids.length === 0) return [];
  const rows = await Promise.all(
    ids.map(async (id) => {
      try { return await getChallenge(id); } catch { return null; }
    })
  );
  return rows.filter((r): r is ChallengeView => r !== null);
}

// ── wei formatting helpers ────────────────────────────────────────────────--
export function fmtGen(weiStr: string, digits = 4): string {
  let wei: bigint;
  try { wei = BigInt(weiStr || "0"); } catch { return "0"; }
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = wei % base;
  if (digits <= 0) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
}

export function genToWei(gen: string): bigint {
  const t = (gen || "").trim();
  if (!t || isNaN(Number(t))) return 0n;
  const [w, f = ""] = t.split(".");
  const frac = (f + "0".repeat(18)).slice(0, 18);
  return BigInt(w || "0") * 10n ** 18n + BigInt(frac || "0");
}
