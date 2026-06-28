import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { CONTRACT_ADDRESS } from "./chain";
import {
  Broadcast, Pulse, Crosshair, HourglassMedium, Stack, ChartBar,
  Graph, Lightning, Gavel, Coins, ShieldWarning, Trophy, Plus,
  ArrowsClockwise, Lock, X, FileText, SealCheck, Flag, Hourglass,
  CaretDown, ArrowRight, HandHeart, MagnifyingGlass, ClockCounterClockwise, ArrowLeft,
} from "@phosphor-icons/react";

import {
  ROUND_STATUS, PETITION_STATUS, TENSION_STATUS, CHALLENGE_STATUS,
  type PoolState, type ActiveRound, type Constants, type PetitionRow,
  type TensionLinkView, type ChallengeView, type LeaderboardEntry,
  type QfPreview, type QfBreakdown, type RoundSummary, type ProfileView,
  getPoolState, getActiveRound, getConstants, getRoundSummary,
  listPetitions, loadPetitions, listTensionLinks, loadTensionLinks,
  listChallenges, loadChallenges, getLeaderboardByReputation, getProfile,
  previewQfMatch, getPetitionQfBreakdown, getRegionDensity,
  registerPetitioner, filePetition, donateToPetition, adjudicateT1, adjudicateT2,
  detectTension, resolveTension, allocateRound, releaseTranche,
  challengePetition, resolveChallenge, startRound, closeRoundDonations,
  sealRound, finaliseRound, topUpActivePool, advanceEpoch, setAdmin,
  requiredBondWei, challengeBondWei, fmtGen, genToWei,
} from "./contractService";

type Hex = `0x${string}`;

// ── Tiny presentational helpers ─────────────────────────────────────────────
const short = (a: string) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "—");

function rulingClass(r: string): string {
  switch (r) {
    case "ELIGIBLE": return "tag tag-eligible";
    case "PARTIAL": return "tag tag-partial";
    case "OVERTURNED": return "tag tag-overturned";
    case "INELIGIBLE": return "tag tag-ineligible";
    default: return "tag tag-dim";
  }
}

// Animated ticking number (visibly ticks when value changes).
function Ticker({ value, className }: { value: string; className?: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setFlash(true);
      prev.current = value;
      const t = setTimeout(() => setFlash(false), 420);
      return () => clearTimeout(t);
    }
  }, [value]);
  return <span className={`ticker ${flash ? "ticker-flash" : ""} ${className ?? ""}`}>{value}</span>;
}

function Stat({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}

function Toast({ msg, kind }: { msg: string; kind: "ok" | "err" | "info" }) {
  return <div className={`toast toast-${kind}`}>{msg}</div>;
}

// ── Live QF stacked bar (hero) ───────────────────────────────────────────────
function QfStackedBar({
  petitions, previews, onSelect,
}: {
  petitions: PetitionRow[];
  previews: Record<number, QfPreview>;
  onSelect: (id: number) => void;
}) {
  const segs = petitions
    .map((p) => {
      const pv = previews[p.id];
      const match = pv ? Number(BigInt(pv.predictedMatchWei) / 1_000_000_000_000n) : 0;
      return { id: p.id, title: p.title, ruling: p.finalRuling, match, predicted: pv?.predictedMatchWei ?? "0" };
    })
    .filter((s) => s.match > 0)
    .sort((a, b) => b.match - a.match);
  const total = segs.reduce((acc, s) => acc + s.match, 0);

  return (
    <div className="hero">
      <div className="hero-head">
        <div className="hero-title"><Broadcast size={18} weight="fill" /> LIVE MATCHING MARKET</div>
        <div className="hero-sub">predicted QF allocation if the round closed now · refresh 12s</div>
      </div>
      {total > 0 ? (
        <>
          <div className="qf-bar">
            {segs.map((s) => (
              <button
                key={s.id}
                className={`qf-seg qf-${(s.ruling || "dim").toLowerCase()}`}
                style={{ width: `${(s.match / total) * 100}%` }}
                title={`#${s.id} ${s.title} — ${fmtGen(s.predicted)} GEN`}
                onClick={() => onSelect(s.id)}
              >
                <span className="qf-seg-id">#{s.id}</span>
              </button>
            ))}
          </div>
          <div className="qf-legend">
            {segs.slice(0, 8).map((s) => (
              <button key={s.id} className="qf-legend-item" onClick={() => onSelect(s.id)}>
                <i className={`dot qf-${(s.ruling || "dim").toLowerCase()}`} />
                <span className="mono">#{s.id}</span>
                <span className="qf-legend-title">{s.title || "—"}</span>
                <span className="mono dim">{((s.match / total) * 100).toFixed(1)}%</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">No eligible weight yet — file & audit petitions, then donate to drive the market.</div>
      )}
    </div>
  );
}

// ── Tension chord diagram (1px SVG strokes, no fill) ─────────────────────────
function TensionChords({
  links, contradictionFloor, onPick,
}: {
  links: TensionLinkView[];
  contradictionFloor: number;
  onPick: (l: TensionLinkView) => void;
}) {
  const ids = useMemo(() => {
    const s = new Set<number>();
    links.forEach((l) => { s.add(l.petitionA); s.add(l.petitionB); });
    return Array.from(s);
  }, [links]);
  const R = 130, CX = 160, CY = 160;
  const pos = useMemo(() => {
    const m: Record<number, { x: number; y: number; a: number }> = {};
    ids.forEach((id, i) => {
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2;
      m[id] = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), a };
    });
    return m;
  }, [ids]);

  if (links.length === 0) {
    return <div className="empty">No tension scans yet. Run a scan on two same-region petitions.</div>;
  }
  return (
    <svg viewBox="0 0 320 320" className="chords" role="img" aria-label="tension chord diagram">
      <circle cx={CX} cy={CY} r={R} className="chord-ring" />
      {links.map((l) => {
        const a = pos[l.petitionA], b = pos[l.petitionB];
        if (!a || !b) return null;
        const contradiction = l.contradictionScore >= contradictionFloor;
        const cls = contradiction ? "chord-edge edge-contradiction" : "chord-edge edge-similarity";
        const w = 0.5 + (Math.max(l.similarityScore, l.contradictionScore) / 100) * 2;
        return (
          <path
            key={l.linkId}
            d={`M ${a.x} ${a.y} Q ${CX} ${CY} ${b.x} ${b.y}`}
            className={cls}
            strokeWidth={w}
            onClick={() => onPick(l)}
          />
        );
      })}
      {ids.map((id) => {
        const p = pos[id];
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={3} className="chord-node" />
            <text x={p.x + 6 * Math.cos(p.a)} y={p.y + 6 * Math.sin(p.a)} className="chord-label">#{id}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Vintage decay timeline ───────────────────────────────────────────────────
function VintageTimeline({
  petitions, currentEpoch, c,
}: {
  petitions: PetitionRow[];
  currentEpoch: number;
  c: Constants | null;
}) {
  if (!c || petitions.length === 0) {
    return <div className="empty">No petitions to plot.</div>;
  }
  const perEpoch = c.VINTAGE_BPS_PER_EPOCH;
  const floor = c.VINTAGE_FLOOR_BPS;
  const decayBps = (filed: number) => {
    if (currentEpoch <= filed) return 10000;
    const d = (currentEpoch - filed) * perEpoch;
    return Math.max(floor, 10000 - d);
  };
  const epochs = petitions.map((p) => p.filedEpoch);
  const minE = Math.min(...epochs, currentEpoch);
  const maxE = Math.max(...epochs, currentEpoch);
  const W = 560, H = 180, padL = 44, padR = 16, padT = 16, padB = 28;
  const xOf = (e: number) => padL + ((e - minE) / Math.max(1, maxE - minE)) * (W - padL - padR);
  const yOf = (bps: number) => padT + (1 - (bps - floor) / Math.max(1, 10000 - floor)) * (H - padT - padB);
  const floorY = yOf(floor);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="vintage" role="img" aria-label="vintage decay timeline">
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
      <line x1={padL} y1={floorY} x2={W - padR} y2={floorY} className="floor-line" />
      <text x={W - padR} y={floorY - 4} className="floor-label" textAnchor="end">
        VINTAGE_FLOOR {floor} bps
      </text>
      <text x={4} y={padT + 8} className="axis-label">10000</text>
      <text x={4} y={H - padB} className="axis-label">{floor}</text>
      {petitions.map((p) => {
        const bps = decayBps(p.filedEpoch);
        const x = xOf(p.filedEpoch), y = yOf(bps);
        return (
          <g key={p.id}>
            <line x1={x} y1={y} x2={x} y2={H - padB} className="vintage-stem" />
            <circle cx={x} cy={y} r={3.2} className={`vintage-dot v-${(p.finalRuling || "dim").toLowerCase()}`} />
            <text x={x} y={H - padB + 12} className="axis-label" textAnchor="middle">#{p.id}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── QF breakdown bars (√ donor_total math) ───────────────────────────────────
function QfBreakdownChart({ b }: { b: QfBreakdown }) {
  const donors = [...b.donorBreakdown].sort((a, z) => z.qfRoot - a.qfRoot);
  const maxRoot = Math.max(1, ...donors.map((d) => d.qfRoot));
  if (donors.length === 0) return <div className="empty">No donations yet.</div>;
  return (
    <div className="qfb">
      <div className="qfb-meta mono">
        Σ√d → (Σ√d)² = {b.qfWeightUnitsRecomputed.toLocaleString()} · donors {b.uniqueDonors}
      </div>
      {donors.map((d) => (
        <div key={d.donor} className="qfb-row">
          <span className="mono qfb-addr">{short(d.donor)}</span>
          <div className="qfb-track">
            <div className="qfb-fill" style={{ width: `${(d.qfRoot / maxRoot) * 100}%` }} />
          </div>
          <span className="mono qfb-root">√={d.qfRoot}</span>
          <span className="mono dim qfb-total">{fmtGen(d.totalWei)} GEN</span>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APP
// ════════════════════════════════════════════════════════════════════════════
type SortKey = "id" | "qf" | "match" | "t1" | "region";

// ── FAQ accordion item ───────────────────────────────────────────────────────
function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? "faq-open" : ""}`}>
      <button className="faq-q" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <CaretDown size={16} weight="bold" className="faq-caret" />
      </button>
      {open && <div className="faq-a">{children}</div>}
    </div>
  );
}

// ── Landing / situation-board cover (first screen) ───────────────────────────
function Landing({
  active, pool, constants, petitionCount, roundStatus, onEnter,
}: {
  active: ActiveRound | null;
  pool: PoolState | null;
  constants: Constants | null;
  petitionCount: number;
  roundStatus: string;
  onEnter: () => void;
}) {
  const decayPerEpoch = constants ? (constants.VINTAGE_BPS_PER_EPOCH / 100).toFixed(2) : "0.25";
  const decayFloor = constants ? (constants.VINTAGE_FLOOR_BPS / 100).toFixed(0) : "70";
  const dupFloor = constants?.TENSION_DUPLICATE_FLOOR ?? 70;
  const contraFloor = constants?.TENSION_CONTRADICTION_FLOOR ?? 40;
  const t2Lo = constants?.T2_TRIGGER_LOWER ?? 35;
  const t2Hi = constants?.T2_TRIGGER_UPPER ?? 75;
  const eligTr = constants?.ELIGIBLE_TRANCHES ?? 4;
  const partTr = constants?.PARTIAL_TRANCHES ?? 2;
  const trancheExpiry = constants?.TRANCHE_EXPIRY_EPOCHS ?? 12;
  const bountyPct = constants ? (constants.WHISTLEBLOWER_BOUNTY_BPS / 100).toFixed(0) : "40";
  const challengePct = constants ? (constants.CHALLENGE_BOND_BPS_OF_ALLOC / 100).toFixed(0) : "15";

  const steps = [
    {
      n: "01",
      icon: <FileText size={20} weight="fill" />,
      title: "FILE A RELIEF PETITION",
      body:
        "A registered petitioner opens a relief request inside the active, time-boxed round: title, region, and an on-chain evidence packet (satellite reads, official declarations, field reports). A GEN bond is posted — and it scales up with how many petitions already crowd the same region.",
    },
    {
      n: "02",
      icon: <HandHeart size={20} weight="fill" />,
      title: "DONORS CONTRIBUTE",
      body:
        "Anyone donates GEN to any petition while the round is open. The matching weight is quadratic — (Σ√dᵢ)² — so it sums the square root of each donor's total, then squares the sum. Many small, unique donors outweigh a single whale.",
    },
    {
      n: "03",
      icon: <MagnifyingGlass size={20} weight="fill" />,
      title: "AUDIT · TENSION SCAN · VINTAGE DECAY",
      body:
        `A two-tier LLM audit grades each petition (T1 fast scan; a mandatory deep T2 when the score lands in the suspect ${t2Lo}–${t2Hi} band). A cross-petition tension scan hunts same-region duplicates (similarity ≥ ${dupFloor}) and contradictions (≥ ${contraFloor}) — the winner absorbs weight, the loser keeps only 30%. Vintage decay then de-weights stale claims by ${decayPerEpoch}% per epoch, floored at ${decayFloor}%.`,
    },
    {
      n: "04",
      icon: <Coins size={20} weight="fill" />,
      title: "MATCH THE POOL · RELEASE TRANCHES",
      body:
        `When the round is sealed, allocate_round splits the matching pool pro-rata to qf_weight_adjusted = qf × affected_pct × tier_factor × vintage_decay. Funds don't dump at once — they release in tranches (${eligTr} for ELIGIBLE, ${partTr} for PARTIAL), each gated behind an on-chain proof_summary.`,
    },
  ];

  return (
    <div className="landing">
      <div className="scanline" aria-hidden />

      {/* top bar — ConnectButton stays reachable on the cover */}
      <header className="lp-topbar">
        <div className="brand">
          <Pulse size={22} weight="fill" className="brand-mark" />
          <div className="brand-text">
            <div className="brand-name">LIFELINE</div>
            <div className="brand-sub">RELIEF DISPATCH · QUADRATIC MATCHING MARKET</div>
          </div>
        </div>
        <div className="lp-topbar-right">
          <span className={`pill pill-${roundStatus.toLowerCase()}`}>{roundStatus}</span>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      {/* hero */}
      <section className="lp-hero">
        <div className="lp-hero-main">
          <div className="lp-kicker mono">
            <Broadcast size={13} weight="fill" /> SITUATION BOARD · DISASTER-RELIEF FUNDING MARKET
          </div>
          <h1 className="lp-title">
            FUND THE EMERGENCY,<br />NOT THE LOUDEST VOICE.
          </h1>
          <p className="lp-lede">
            Lifeline is a quadratic-funding matching market for humanitarian relief. Petitions compete
            inside timed rounds for a shared pool — but a crowd of small donors outweighs any single whale,
            an LLM evidence audit and a cross-petition tension scan strip out duplicates and contradictions,
            and a vintage-decay clock keeps stale claims from crowding out fresh disasters.
          </p>
          <div className="lp-cta-row">
            <button className="btn btn-primary lp-cta" onClick={onEnter}>
              ENTER THE WAR ROOM <ArrowRight size={16} weight="bold" />
            </button>
            <span className="lp-cta-note mono">live on GenLayer Studionet · testnet GEN only</span>
          </div>
        </div>

        {/* live board readout */}
        <aside className="lp-board">
          <div className="lp-board-head mono"><Lightning size={13} weight="fill" /> LIVE ROUND</div>
          <div className="lp-board-grid">
            <div className="lp-board-cell">
              <div className="lp-board-k mono">STATUS</div>
              <div className={`lp-board-v pill pill-${roundStatus.toLowerCase()}`}>{roundStatus}</div>
            </div>
            <div className="lp-board-cell">
              <div className="lp-board-k mono">EPOCH</div>
              <div className="lp-board-v mono">{pool?.currentEpoch ?? "—"}<span className="cursor">▮</span></div>
            </div>
            <div className="lp-board-cell">
              <div className="lp-board-k mono">MATCHING POOL</div>
              <div className="lp-board-v mono">{active?.hasActiveRound ? `${fmtGen(active.matchingPoolWei)} GEN` : "—"}</div>
            </div>
            <div className="lp-board-cell">
              <div className="lp-board-k mono">DONATIONS</div>
              <div className="lp-board-v mono">{active?.hasActiveRound ? `${fmtGen(active.totalContributionsWei)} GEN` : "—"}</div>
            </div>
            <div className="lp-board-cell">
              <div className="lp-board-k mono">PETITIONS</div>
              <div className="lp-board-v mono">{petitionCount}</div>
            </div>
            <div className="lp-board-cell">
              <div className="lp-board-k mono">TOTAL PAID</div>
              <div className="lp-board-v mono">{pool ? `${fmtGen(pool.totalPaidWei)} GEN` : "—"}</div>
            </div>
          </div>
        </aside>
      </section>

      {/* how it works */}
      <section className="lp-section">
        <div className="lp-section-head mono"><Crosshair size={14} weight="fill" /> HOW THE MARKET RUNS</div>
        <div className="lp-steps">
          {steps.map((s) => (
            <div key={s.n} className="lp-step">
              <div className="lp-step-top">
                <span className="lp-step-n mono">{s.n}</span>
                <span className="lp-step-icon">{s.icon}</span>
              </div>
              <div className="lp-step-title">{s.title}</div>
              <p className="lp-step-body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* mechanic strip */}
      <section className="lp-strip">
        <div className="lp-strip-item">
          <ChartBar size={18} weight="fill" />
          <div><span className="mono lp-strip-k">(Σ√dᵢ)²</span><div className="lp-strip-v">quadratic funding</div></div>
        </div>
        <div className="lp-strip-item">
          <Graph size={18} weight="fill" />
          <div><span className="mono lp-strip-k">dup ≥{dupFloor} · contra ≥{contraFloor}</span><div className="lp-strip-v">tension scan</div></div>
        </div>
        <div className="lp-strip-item">
          <ClockCounterClockwise size={18} weight="fill" />
          <div><span className="mono lp-strip-k">−{decayPerEpoch}%/epoch · floor {decayFloor}%</span><div className="lp-strip-v">vintage decay</div></div>
        </div>
        <div className="lp-strip-item">
          <ShieldWarning size={18} weight="fill" />
          <div><span className="mono lp-strip-k">{challengePct}% bond · {bountyPct}% bounty</span><div className="lp-strip-v">whistleblower challenge</div></div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section">
        <div className="lp-section-head mono"><Stack size={14} weight="fill" /> FIELD BRIEFING · FAQ</div>
        <div className="lp-faq">
          <FaqItem q="Are these real funds?">
            No. Lifeline runs entirely on GenLayer Studionet, a testnet. Every figure — petition bonds,
            donations, the matching pool, tranche payouts — is denominated in <b>test GEN</b> with no
            real-world value. Connect a testnet wallet and experiment freely; nothing here moves real money.
          </FaqItem>
          <FaqItem q="What does “quadratic funding” actually mean?">
            A petition's matching weight is <span className="mono">(Σ√dᵢ)²</span>: take the square root of
            each donor's total contribution, add those roots up, then square the sum. The result rewards the
            <i> breadth</i> of support over its raw size — fifty people giving a little will out-match one
            donor giving a lot. The shared pool is then split pro-rata to each petition's adjusted weight.
          </FaqItem>
          <FaqItem q="What does the tension scan detect?">
            An LLM reads pairs of petitions filed in the same region and scores two things: a
            <b> similarity score</b> (≥ {dupFloor} flags a likely duplicate filing) and a
            <b> contradiction score</b> (≥ {contraFloor} flags mutually exclusive claims — different
            casualty counts, damage extents, dates). When a link resolves, the better-corroborated petition
            wins and absorbs weight; the loser is demoted to 30% of its quadratic weight.
          </FaqItem>
          <FaqItem q="What is vintage decay?">
            Relief is time-sensitive, so older claims fade. Each petition loses {decayPerEpoch}% of its
            quadratic weight per epoch since it was filed — never dropping below a {decayFloor}% floor.
            This keeps a stale request from permanently crowding out a fresh emergency in the same pool.
          </FaqItem>
          <FaqItem q="How do tranches release?">
            Money never dumps in one shot. After allocation, an ELIGIBLE petition releases its grant across
            {" "}{eligTr} tranches and a PARTIAL one across {partTr}. Each release requires the petitioner to
            attach a <span className="mono">proof_summary</span> of execution; the first tranche also refunds
            the original bond. Leave it too long and the window expires after {trancheExpiry} epochs.
          </FaqItem>
          <FaqItem q="Who runs the rounds and the epoch clock?">
            The <b>admin / keeper</b> opens and funds each round, closes donations, seals it, runs
            allocation, finalises, and advances the epoch. Everything else is permissionless: anyone can
            donate, trigger T1/T2 audits, run tension scans, resolve links, or stake a {challengePct}% bond
            to challenge an allocation and earn a {bountyPct}% whistleblower bounty if it's overturned.
          </FaqItem>
        </div>
      </section>

      <section className="lp-foot-cta">
        <button className="btn btn-primary lp-cta" onClick={onEnter}>
          OPEN A PETITION <ArrowRight size={16} weight="bold" />
        </button>
      </section>

      <footer className="footer mono">
        LIFELINE · {short(CONTRACT_ADDRESS)} · quadratic-funding · two-tier audit · tension scan · vintage decay
      </footer>
    </div>
  );
}

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;

  const [pool, setPool] = useState<PoolState | null>(null);
  const [active, setActive] = useState<ActiveRound | null>(null);
  const [constants, setConstants] = useState<Constants | null>(null);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [petitions, setPetitions] = useState<PetitionRow[]>([]);
  const [links, setLinks] = useState<TensionLinkView[]>([]);
  const [challenges, setChallenges] = useState<ChallengeView[]>([]);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [previews, setPreviews] = useState<Record<number, QfPreview>>({});

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<QfBreakdown | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("match");

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" | "info" } | null>(null);

  const [showFile, setShowFile] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [keeperUnlocked, setKeeperUnlocked] = useState(false);
  const [pickedTension, setPickedTension] = useState<TensionLinkView | null>(null);

  // Landing gate: while !entered, show the situation-board cover.
  const [entered, setEntered] = useState(false);

  const notify = useCallback((msg: string, kind: "ok" | "err" | "info" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4200);
  }, []);

  const runTx = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (!acct) { notify("Connect a wallet first.", "err"); return; }
    setBusy(label);
    try { await fn(); notify(`${label} ✓`, "ok"); await refreshAll(); }
    catch (e: any) {
      const m = String(e?.message ?? e);
      notify(`${label} failed: ${m.replace("[EXPECTED]", "").slice(0, 140)}`, "err");
    } finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct, notify]);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    try {
      const [ps, ar] = await Promise.all([getPoolState(), getActiveRound()]);
      setPool(ps); setActive(ar);
      if (ar.hasActiveRound) {
        try { setSummary(await getRoundSummary(ar.roundId)); } catch { setSummary(null); }
      }
      const pids = await listPetitions();
      const rows = await loadPetitions(pids);
      rows.sort((a, b) => b.id - a.id);
      setPetitions(rows);
      const [lids, cids] = await Promise.all([listTensionLinks(), listChallenges()]);
      setLinks(await loadTensionLinks(lids));
      setChallenges(await loadChallenges(cids));
      setLeaders(await getLeaderboardByReputation(10));
    } catch {
      // refresh failures are non-fatal; the UI falls back to its last state
    }
  }, []);

  // Initial + constants
  useEffect(() => {
    getConstants().then(setConstants).catch(() => {});
    refreshAll();
  }, [refreshAll]);

  // Profile when connected
  useEffect(() => {
    if (acct) getProfile(acct).then(setProfile).catch(() => setProfile(null));
    else setProfile(null);
  }, [acct, petitions.length]);

  // Live QF preview refresh every 12s
  const refreshPreviews = useCallback(async () => {
    const ids = petitions.map((p) => p.id);
    if (ids.length === 0) return;
    const entries = await Promise.all(
      ids.map(async (id) => {
        try { return [id, await previewQfMatch(id)] as const; } catch { return null; }
      })
    );
    const next: Record<number, QfPreview> = {};
    for (const e of entries) if (e) next[e[0]] = e[1];
    setPreviews(next);
  }, [petitions]);

  useEffect(() => {
    refreshPreviews();
    const t = setInterval(refreshPreviews, 12_000);
    return () => clearInterval(t);
  }, [refreshPreviews]);

  // Detail breakdown
  useEffect(() => {
    if (selectedId == null) { setBreakdown(null); return; }
    getPetitionQfBreakdown(selectedId).then(setBreakdown).catch(() => setBreakdown(null));
  }, [selectedId, petitions.length]);

  const selected = useMemo(
    () => petitions.find((p) => p.id === selectedId) ?? null,
    [petitions, selectedId]
  );

  const sortedPetitions = useMemo(() => {
    const arr = [...petitions];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "qf": return Number(BigInt(b.qfWeightAdjusted) - BigInt(a.qfWeightAdjusted) > 0n ? 1 : -1);
        case "match": {
          const ma = previews[a.id]?.predictedMatchWei ?? "0";
          const mb = previews[b.id]?.predictedMatchWei ?? "0";
          return BigInt(mb) > BigInt(ma) ? 1 : BigInt(mb) < BigInt(ma) ? -1 : 0;
        }
        case "t1": return b.t1AffectedPct - a.t1AffectedPct;
        case "region": return a.region.localeCompare(b.region);
        default: return b.id - a.id;
      }
    });
    return arr;
  }, [petitions, sortKey, previews]);

  const roundStatus = active?.hasActiveRound ? ROUND_STATUS[active.status] ?? "—" : "NO ROUND";
  const countdown = active?.hasActiveRound && pool
    ? Math.max(0, active.endEpoch - pool.currentEpoch)
    : 0;

  const myPetitions = useMemo(
    () => (acct ? petitions.filter((p) => p.petitioner.toLowerCase() === acct.toLowerCase()) : []),
    [petitions, acct]
  );

  // ── Landing screen (first screen) ──────────────────────────────────────────
  if (!entered) {
    return (
      <Landing
        active={active}
        pool={pool}
        constants={constants}
        petitionCount={active?.petitionCount ?? petitions.length}
        roundStatus={roundStatus}
        onEnter={() => setEntered(true)}
      />
    );
  }

  return (
    <div className="app">
      <div className="scanline" aria-hidden />
      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="brand">
          <Pulse size={22} weight="fill" className="brand-mark" />
          <div className="brand-text">
            <div className="brand-name">LIFELINE</div>
            <div className="brand-sub">RELIEF DISPATCH · QUADRATIC MATCHING MARKET</div>
          </div>
        </div>
        <div className="topbar-status">
          <span className={`pill pill-${roundStatus.toLowerCase()}`}>{roundStatus}</span>
          <span className="countdown mono">
            EPOCH {pool?.currentEpoch ?? "—"} · T-<Ticker value={String(countdown)} />
            <span className="cursor">▮</span>
          </span>
        </div>
        <div className="topbar-actions">
          <button
            className="btn btn-back"
            onClick={() => setEntered(false)}
            title="return to the briefing / situation board"
          >
            <ArrowLeft size={15} weight="bold" /> BRIEFING
          </button>
          <button className="btn btn-ghost" onClick={() => refreshAll()} title="refresh">
            <ArrowsClockwise size={16} />
          </button>
          <button
            className={`btn btn-ghost ${keeperUnlocked ? "active" : ""}`}
            onClick={() => setKeeperUnlocked((v) => !v)}
            title="keeper console (admin-enforced on-chain)"
          >
            <Lock size={16} /> KEEPER
          </button>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      {/* ── HERO: live QF stacked bar (full bleed) ──────────────────────── */}
      <QfStackedBar petitions={petitions} previews={previews} onSelect={setSelectedId} />

      {/* ── DASHBOARD STATS ─────────────────────────────────────────────── */}
      <section className="grid-stats">
        <Stat label="MATCHING POOL" mono value={<>{active ? fmtGen(active.matchingPoolWei) : "—"} <small>GEN</small></>} />
        <Stat label="POOL REMAINING" mono value={<Ticker value={active ? fmtGen(active.matchingPoolRemainingWei) : "—"} />} />
        <Stat label="DONATIONS" mono value={<><Ticker value={active ? fmtGen(active.totalContributionsWei) : "—"} /> <small>GEN</small></>} />
        <Stat label="PETITIONS" mono value={active?.petitionCount ?? petitions.length} />
        <Stat label="TOTAL PAID" mono value={pool ? `${fmtGen(pool.totalPaidWei)} GEN` : "—"} />
        <Stat label="BOUNTIES PAID" mono value={pool ? `${fmtGen(pool.totalBountyPaidWei)} GEN` : "—"} />
      </section>

      {/* ── STATUS HISTOGRAM ────────────────────────────────────────────── */}
      {summary && (
        <section className="panel">
          <div className="panel-head"><ChartBar size={16} weight="fill" /> PETITION STATUS — ROUND #{summary.roundId}</div>
          <div className="hist">
            {Object.entries(summary.statusHistogram).filter(([, n]) => n > 0).map(([k, n]) => (
              <div key={k} className="hist-bar">
                <div className="hist-fill" style={{ height: `${Math.min(100, n * 20)}%` }} />
                <div className="hist-n mono">{n}</div>
                <div className="hist-k">{k}</div>
              </div>
            ))}
            {Object.values(summary.statusHistogram).every((n) => n === 0) && (
              <div className="empty">No petitions in this round yet.</div>
            )}
          </div>
        </section>
      )}

      {/* ── ACTION BAR ──────────────────────────────────────────────────── */}
      <section className="actionbar">
        <button className="btn" disabled={!isConnected || busy != null}
          onClick={() => runTx("Register petitioner", () => registerPetitioner(acct!))}>
          <Plus size={15} /> REGISTER
        </button>
        <button className="btn btn-primary" disabled={!isConnected}
          onClick={() => setShowFile(true)}>
          <FileText size={15} /> FILE PETITION
        </button>
        {profile && (
          <span className="rep mono">
            REP {profile.reputationScore}/{constants?.REPUTATION_MAX ?? 1000} ·
            filed {profile.petitionsFiled} · eligible {profile.petitionsEligible}
          </span>
        )}
      </section>

      <div className="layout">
        {/* ── LEFT: petition list ───────────────────────────────────────── */}
        <section className="panel petlist">
          <div className="panel-head">
            <Stack size={16} weight="fill" /> PETITIONS
            <div className="sortbar">
              {(["match", "qf", "t1", "region", "id"] as SortKey[]).map((k) => (
                <button key={k} className={`chip ${sortKey === k ? "chip-on" : ""}`} onClick={() => setSortKey(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="table">
            <div className="tr th">
              <span>#</span><span>TITLE</span><span>REGION</span><span>T1/T2</span>
              <span>QF ADJ</span><span>PRED MATCH</span><span>RULING</span>
            </div>
            {sortedPetitions.length === 0 && <div className="empty">No petitions filed.</div>}
            {sortedPetitions.map((p) => {
              const pv = previews[p.id];
              return (
                <button key={p.id} className={`tr ${selectedId === p.id ? "tr-sel" : ""}`} onClick={() => setSelectedId(p.id)}>
                  <span className="mono">{p.id}</span>
                  <span className="td-title">{p.title || "—"}</span>
                  <span className="mono dim">{p.region}</span>
                  <span className="mono">{p.t1AffectedPct}{p.t2AffectedPct ? `/${p.t2AffectedPct}` : ""}</span>
                  <span className="mono">{Number(p.qfWeightAdjusted).toLocaleString()}</span>
                  <span className="mono">{pv ? fmtGen(pv.predictedMatchWei) : "—"}</span>
                  <span><i className={rulingClass(p.finalRuling)}>{p.finalRuling || PETITION_STATUS[p.status]}</i></span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── RIGHT: detail rail ────────────────────────────────────────── */}
        <aside className="panel detail">
          {selected ? (
            <PetitionDetail
              p={selected}
              preview={previews[selected.id]}
              breakdown={breakdown}
              constants={constants}
              currentEpoch={pool?.currentEpoch ?? 0}
              acct={acct}
              busy={busy}
              isMine={!!acct && selected.petitioner.toLowerCase() === acct.toLowerCase()}
              onDonate={(wei) => runTx("Donate", () => donateToPetition(acct!, selected.id, wei))}
              onT1={() => runTx("Adjudicate T1", () => adjudicateT1(acct!, selected.id))}
              onT2={() => runTx("Adjudicate T2", () => adjudicateT2(acct!, selected.id))}
              onRelease={(proof) => runTx("Release tranche", () => releaseTranche(acct!, selected.id, proof))}
              onChallenge={(rat, wei) => runTx("Challenge", () => challengePetition(acct!, selected.id, rat, wei))}
            />
          ) : (
            <div className="empty">Select a petition to inspect its QF math, vintage, tensions and tranches.</div>
          )}
        </aside>
      </div>

      {/* ── TENSION + VINTAGE ───────────────────────────────────────────── */}
      <div className="layout">
        <section className="panel">
          <div className="panel-head"><Graph size={16} weight="fill" /> TENSION SCAN — SAME-REGION CONTRADICTION GRAPH</div>
          <div className="chord-wrap">
            <TensionChords
              links={links}
              contradictionFloor={constants?.TENSION_CONTRADICTION_FLOOR ?? 40}
              onPick={setPickedTension}
            />
            <div className="chord-side">
              <div className="legend-row"><i className="line edge-contradiction" /> contradiction</div>
              <div className="legend-row"><i className="line edge-similarity" /> similarity / duplicate</div>
              <TensionPicker petitions={petitions} disabled={!isConnected || busy != null}
                onDetect={(a, b) => runTx("Detect tension", () => detectTension(acct!, a, b))} />
              {pickedTension && (
                <div className="tension-detail">
                  <div className="td-line mono">LINK #{pickedTension.linkId} · {TENSION_STATUS[pickedTension.status]}</div>
                  <div className="td-line mono">A#{pickedTension.petitionA} ↔ B#{pickedTension.petitionB}</div>
                  <div className="td-line mono">sim {pickedTension.similarityScore} · contra {pickedTension.contradictionScore}</div>
                  {pickedTension.winner > 0 && <div className="td-line mono">winner #{pickedTension.winner}</div>}
                  <div className="td-rationale">{pickedTension.rationale || "—"}</div>
                  {pickedTension.status === 0 && (
                    <button className="btn btn-sm" disabled={!isConnected || busy != null}
                      onClick={() => runTx("Resolve tension", () => resolveTension(acct!, pickedTension.linkId))}>
                      <Lightning size={14} /> RESOLVE
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><HourglassMedium size={16} weight="fill" /> VINTAGE DECAY TIMELINE</div>
          <VintageTimeline petitions={petitions} currentEpoch={pool?.currentEpoch ?? 0} c={constants} />
        </section>
      </div>

      {/* ── TRANCHE FLOW + CHALLENGES + LEADERBOARD ─────────────────────── */}
      <div className="layout layout-3">
        <section className="panel">
          <div className="panel-head"><Coins size={16} weight="fill" /> MY TRANCHE RELEASES</div>
          {myPetitions.length === 0 && <div className="empty">No petitions filed by this wallet.</div>}
          {myPetitions.map((p) => (
            <div key={p.id} className="tranche-card">
              <div className="tranche-head mono">#{p.id} {p.title}</div>
              <div className="tranche-steps">
                {Array.from({ length: Math.max(p.tranchesTotal, 1) }).map((_, i) => (
                  <span key={i} className={`step ${i < p.tranchesReleased ? "step-on" : ""}`}>{i + 1}</span>
                ))}
              </div>
              <div className="mono dim">
                {p.tranchesReleased}/{p.tranchesTotal} released · {fmtGen(p.releasedWei)}/{fmtGen(p.allocationWei)} GEN
              </div>
              {p.proofs.length > 0 && <div className="proof mono">last proof: {p.proofs[p.proofs.length - 1]}</div>}
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-head"><ShieldWarning size={16} weight="fill" /> CHALLENGES</div>
          {challenges.length === 0 && <div className="empty">No challenges filed.</div>}
          {challenges.map((c) => (
            <div key={c.challengeId} className="chal-card">
              <div className="mono">
                #{c.challengeId} → petition #{c.petitionId} ·
                <i className={`tag ${c.status === 1 ? "tag-eligible" : c.status === 2 ? "tag-ineligible" : "tag-dim"}`}>
                  {CHALLENGE_STATUS[c.status]}
                </i>
              </div>
              <div className="mono dim">bond {fmtGen(c.bondWei)} · bounty {fmtGen(c.bountyPaidWei)} GEN</div>
              <div className="td-rationale">{c.rationale}</div>
              {c.status === 0 && (
                <button className="btn btn-sm" disabled={!isConnected || busy != null}
                  onClick={() => runTx("Resolve challenge", () => resolveChallenge(acct!, c.challengeId))}>
                  <Gavel size={14} /> RESOLVE
                </button>
              )}
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-head"><Trophy size={16} weight="fill" /> PREDICTOR LEADERBOARD</div>
          {leaders.length === 0 && <div className="empty">No registered petitioners.</div>}
          <div className="lb">
            {leaders.map((l, i) => (
              <div key={l.address} className="lb-row">
                <span className="mono lb-rank">{i + 1}</span>
                <span className="mono">{short(l.address)}</span>
                <span className="mono lb-rep">{l.reputationScore}</span>
                <span className="mono dim">{l.petitionsEligible}✓ {l.petitionsOverturned}✗</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── FILE PETITION DRAWER ────────────────────────────────────────── */}
      {showFile && (
        <FileDrawer
          busy={busy != null}
          disabled={!isConnected}
          onClose={() => setShowFile(false)}
          onSubmit={async (f) => {
            await runTx("File petition", () => filePetition(acct!, f).then(() => {}));
            setShowFile(false);
          }}
        />
      )}

      {/* ── KEEPER / ADMIN DRAWER ───────────────────────────────────────── */}
      {keeperUnlocked && (
        <button className="admin-fab btn btn-primary" onClick={() => setShowAdmin(true)}>
          <SealCheck size={16} /> KEEPER CONSOLE
        </button>
      )}
      {showAdmin && (
        <AdminDrawer
          busy={busy != null}
          disabled={!isConnected}
          activeRoundId={active?.roundId ?? 0}
          onClose={() => setShowAdmin(false)}
          onStart={(off, wei) => runTx("Start round", () => startRound(acct!, off, wei).then(() => {}))}
          onClose1={() => runTx("Close donations", () => closeRoundDonations(acct!))}
          onSeal={() => runTx("Seal round", () => sealRound(acct!))}
          onAllocate={(rid) => runTx("Allocate round", () => allocateRound(acct!, rid))}
          onFinalise={(rid) => runTx("Finalise round", () => finaliseRound(acct!, rid))}
          onTopUp={(wei) => runTx("Top up pool", () => topUpActivePool(acct!, wei))}
          onAdvance={() => runTx("Advance epoch", () => advanceEpoch(acct!))}
          onSetAdmin={(a) => runTx("Set admin", () => setAdmin(acct!, a))}
        />
      )}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
      {busy && <div className="busybar"><span className="mono">{busy}…</span></div>}

      <footer className="footer mono">
        LIFELINE · {short(CONTRACT_ADDRESS)} · quadratic-funding · two-tier audit · tension scan · vintage decay
      </footer>
    </div>
  );
}

// ── Petition detail rail ─────────────────────────────────────────────────────
function PetitionDetail({
  p, preview, breakdown, constants, currentEpoch, acct, busy, isMine,
  onDonate, onT1, onT2, onRelease, onChallenge,
}: {
  p: PetitionRow;
  preview?: QfPreview;
  breakdown: QfBreakdown | null;
  constants: Constants | null;
  currentEpoch: number;
  acct?: Hex;
  busy: string | null;
  isMine: boolean;
  onDonate: (wei: bigint) => void;
  onT1: () => void;
  onT2: () => void;
  onRelease: (proof: string) => void;
  onChallenge: (rationale: string, wei: bigint) => void;
}) {
  const [donateGen, setDonateGen] = useState("0.01");
  const [proof, setProof] = useState("");
  const [chalRat, setChalRat] = useState("");
  const disabled = !acct || busy != null;

  const decayBps = useMemo(() => {
    if (!constants) return 10000;
    if (currentEpoch <= p.filedEpoch) return 10000;
    const d = (currentEpoch - p.filedEpoch) * constants.VINTAGE_BPS_PER_EPOCH;
    return Math.max(constants.VINTAGE_FLOOR_BPS, 10000 - d);
  }, [constants, currentEpoch, p.filedEpoch]);

  const chalBond = challengeBondWei(BigInt(p.allocationWei || "0"));

  return (
    <div className="detail-body">
      <div className="detail-top">
        <div className="mono dim">PETITION #{p.id} · {PETITION_STATUS[p.status]}</div>
        <h3 className="detail-title">{p.title || "—"}</h3>
        <div className="mono dim">{p.region} · by {short(p.petitioner)} · filed @ epoch {p.filedEpoch}</div>
        <div className="detail-tags">
          <i className={rulingClass(p.finalRuling || p.t1Ruling)}>{p.finalRuling || p.t1Ruling || "UNAUDITED"}</i>
          {p.t2Required && <i className="tag tag-dim">T2 REQUIRED</i>}
          {p.tensionWinner && <i className="tag tag-eligible">TENSION WINNER</i>}
          {p.tensionLoser && <i className="tag tag-ineligible">TENSION LOSER</i>}
        </div>
      </div>

      <div className="detail-grid">
        <Stat label="T1 / T2 PCT" mono value={`${p.t1AffectedPct} / ${p.t2AffectedPct || "—"}`} />
        <Stat label="FINAL PCT" mono value={p.finalAffectedPct} />
        <Stat label="UNIQUE DONORS" mono value={p.uniqueDonors} />
        <Stat label="QF WEIGHT" mono value={Number(p.qfWeightUnits).toLocaleString()} />
        <Stat label="QF ADJUSTED" mono value={Number(p.qfWeightAdjusted).toLocaleString()} />
        <Stat label="VINTAGE DECAY" mono value={`${(decayBps / 100).toFixed(2)}%`} />
        <Stat label="ALLOCATION" mono value={`${fmtGen(p.allocationWei)} GEN`} />
        <Stat label="PRED MATCH" mono value={preview ? `${fmtGen(preview.predictedMatchWei)} GEN` : "—"} />
      </div>

      {(p.t1Rationale || p.t2Rationale) && (
        <div className="rationale">
          {p.t1Rationale && <p><b>T1:</b> {p.t1Rationale}</p>}
          {p.t2Rationale && <p><b>T2:</b> {p.t2Rationale}</p>}
        </div>
      )}

      <div className="panel-head sm"><ChartBar size={14} /> QF DONOR BREAKDOWN (√ donor_total)</div>
      {breakdown && breakdown.petitionId === p.id
        ? <QfBreakdownChart b={breakdown} />
        : <div className="empty">loading…</div>}

      {/* Actions */}
      <div className="detail-actions">
        <div className="action-row">
          <input className="inp mono" value={donateGen} onChange={(e) => setDonateGen(e.target.value)} placeholder="GEN" />
          <button className="btn btn-sm btn-primary" disabled={disabled}
            onClick={() => onDonate(genToWei(donateGen))}>
            <Coins size={14} /> DONATE
          </button>
        </div>
        <div className="action-row">
          <button className="btn btn-sm" disabled={disabled || p.status !== 0} onClick={onT1}>
            <Pulse size={14} /> AUDIT T1
          </button>
          <button className="btn btn-sm" disabled={disabled || p.status !== 1 || (!p.t2Required && !isMine)} onClick={onT2}>
            <Crosshair size={14} /> AUDIT T2
          </button>
        </div>
        {isMine && (p.status === 5 || p.status === 6) && (
          <div className="action-col">
            <input className="inp mono" value={proof} onChange={(e) => setProof(e.target.value)} placeholder="proof summary (required)" />
            <button className="btn btn-sm btn-primary" disabled={disabled || proof.trim().length < 1}
              onClick={() => onRelease(proof)}>
              <Hourglass size={14} /> RELEASE TRANCHE {p.tranchesReleased + 1}/{p.tranchesTotal}
            </button>
          </div>
        )}
        {(p.status === 5 || p.status === 6) && !isMine && (
          <div className="action-col">
            <input className="inp" value={chalRat} onChange={(e) => setChalRat(e.target.value)} placeholder="challenge rationale" />
            <div className="mono dim">min bond {fmtGen(chalBond.toString())} GEN (15% of allocation)</div>
            <button className="btn btn-sm btn-danger" disabled={disabled || chalRat.trim().length < 1}
              onClick={() => onChallenge(chalRat, chalBond)}>
              <Flag size={14} /> CHALLENGE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tension picker helper ────────────────────────────────────────────────────
function TensionPicker({
  petitions, disabled, onDetect,
}: {
  petitions: PetitionRow[];
  disabled: boolean;
  onDetect: (a: number, b: number) => void;
}) {
  const [a, setA] = useState<number | "">("");
  const [b, setB] = useState<number | "">("");
  const sameRegion = useMemo(() => {
    if (a === "" || b === "") return true;
    const pa = petitions.find((x) => x.id === a);
    const pb = petitions.find((x) => x.id === b);
    return !!pa && !!pb && pa.regionKey === pb.regionKey;
  }, [a, b, petitions]);
  return (
    <div className="picker">
      <select className="inp mono" value={a} onChange={(e) => setA(e.target.value === "" ? "" : Number(e.target.value))}>
        <option value="">petition A</option>
        {petitions.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.region}</option>)}
      </select>
      <select className="inp mono" value={b} onChange={(e) => setB(e.target.value === "" ? "" : Number(e.target.value))}>
        <option value="">petition B</option>
        {petitions.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.region}</option>)}
      </select>
      {!sameRegion && <div className="mono err-text">different region — scan will revert</div>}
      <button className="btn btn-sm" disabled={disabled || a === "" || b === "" || a === b}
        onClick={() => onDetect(Number(a), Number(b))}>
        <Crosshair size={14} /> DETECT
      </button>
    </div>
  );
}

// ── File petition drawer ─────────────────────────────────────────────────────
function FileDrawer({
  busy, disabled, onClose, onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onSubmit: (f: { title: string; region: string; evidence: string; bondWei: bigint }) => void;
}) {
  const [title, setTitle] = useState("");
  const [region, setRegion] = useState("");
  const [evidence, setEvidence] = useState("");
  const [bondGen, setBondGen] = useState("0.005");
  const [requiredWei, setRequiredWei] = useState<bigint>(0n);
  const [density, setDensity] = useState<number>(0);

  useEffect(() => {
    if (!region.trim()) { setRequiredWei(0n); setDensity(0); return; }
    const t = setTimeout(() => {
      getRegionDensity(region.trim())
        .then((d) => { setRequiredWei(BigInt(d.requiredBondWei)); setDensity(d.density); })
        .catch(() => { setRequiredWei(requiredBondWei(0)); });
    }, 400);
    return () => clearTimeout(t);
  }, [region]);

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span><FileText size={16} weight="fill" /> FILE PETITION</span>
          <button className="btn btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label className="fld">TITLE
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={96} />
        </label>
        <label className="fld">REGION
          <input className="inp" value={region} onChange={(e) => setRegion(e.target.value)} maxLength={80} />
        </label>
        {region.trim() && (
          <div className="mono dim">region density {density} · required bond {fmtGen(requiredWei.toString())} GEN</div>
        )}
        <label className="fld">EVIDENCE (≥30 chars; satellite / declarations / field reports)
          <textarea className="inp ta" value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={6} maxLength={6000} />
        </label>
        <label className="fld">BOND (GEN)
          <input className="inp mono" value={bondGen} onChange={(e) => setBondGen(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={disabled || busy || title.trim().length < 1 || region.trim().length < 1 || evidence.trim().length < 30}
          onClick={() => onSubmit({ title, region, evidence, bondWei: genToWei(bondGen) })}>
          <FileText size={15} /> SUBMIT PETITION
        </button>
      </div>
    </div>
  );
}

// ── Admin / keeper drawer ────────────────────────────────────────────────────
function AdminDrawer({
  busy, disabled, activeRoundId, onClose,
  onStart, onClose1, onSeal, onAllocate, onFinalise, onTopUp, onAdvance, onSetAdmin,
}: {
  busy: boolean;
  disabled: boolean;
  activeRoundId: number;
  onClose: () => void;
  onStart: (offset: number, wei: bigint) => void;
  onClose1: () => void;
  onSeal: () => void;
  onAllocate: (rid: number) => void;
  onFinalise: (rid: number) => void;
  onTopUp: (wei: bigint) => void;
  onAdvance: () => void;
  onSetAdmin: (addr: string) => void;
}) {
  const [offset, setOffset] = useState("4");
  const [poolGen, setPoolGen] = useState("1");
  const [topUpGen, setTopUpGen] = useState("0.5");
  const [rid, setRid] = useState(String(activeRoundId));
  const [newAdmin, setNewAdmin] = useState("");
  const d = disabled || busy;

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span><SealCheck size={16} weight="fill" /> KEEPER CONSOLE</span>
          <button className="btn btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="mono dim warn">admin-only operations — non-admin txs revert on-chain.</div>

        <div className="admin-block">
          <div className="admin-title">START ROUND</div>
          <div className="action-row">
            <input className="inp mono" value={offset} onChange={(e) => setOffset(e.target.value)} placeholder="end offset" />
            <input className="inp mono" value={poolGen} onChange={(e) => setPoolGen(e.target.value)} placeholder="pool GEN" />
            <button className="btn btn-sm btn-primary" disabled={d}
              onClick={() => onStart(Number(offset) || 1, genToWei(poolGen))}>START</button>
          </div>
        </div>

        <div className="admin-block">
          <div className="admin-title">ROUND CONTROL</div>
          <div className="action-row wrap">
            <button className="btn btn-sm" disabled={d} onClick={onClose1}>CLOSE DONATIONS</button>
            <button className="btn btn-sm" disabled={d} onClick={onSeal}>SEAL</button>
            <button className="btn btn-sm" disabled={d} onClick={onAdvance}>ADVANCE EPOCH</button>
          </div>
          <div className="action-row">
            <input className="inp mono" value={rid} onChange={(e) => setRid(e.target.value)} placeholder="round id" />
            <button className="btn btn-sm" disabled={d} onClick={() => onAllocate(Number(rid) || 0)}>ALLOCATE</button>
            <button className="btn btn-sm" disabled={d} onClick={() => onFinalise(Number(rid) || 0)}>FINALISE</button>
          </div>
        </div>

        <div className="admin-block">
          <div className="admin-title">TOP UP POOL</div>
          <div className="action-row">
            <input className="inp mono" value={topUpGen} onChange={(e) => setTopUpGen(e.target.value)} placeholder="GEN" />
            <button className="btn btn-sm btn-primary" disabled={d} onClick={() => onTopUp(genToWei(topUpGen))}>TOP UP</button>
          </div>
        </div>

        <div className="admin-block">
          <div className="admin-title">ROTATE ADMIN</div>
          <div className="action-row">
            <input className="inp mono" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} placeholder="0x…" />
            <button className="btn btn-sm btn-danger" disabled={d || !newAdmin.startsWith("0x")}
              onClick={() => onSetAdmin(newAdmin)}>SET ADMIN</button>
          </div>
        </div>
      </div>
    </div>
  );
}
