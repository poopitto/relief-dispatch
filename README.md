# Lifeline

Disaster-relief dispatch on [GenLayer](https://genlayer.com). Petitioners file evidence-backed relief requests, a two-tier LLM adjudicates each one under validator consensus, and a quadratic-funding pool matches donations into proof-gated, on-chain allocations.

## How it works

1. Open a round: the admin funds a matching pool and opens a donation window. Petitioners register once for an on-chain reputation profile.
2. File a petition: submit a region, title, and evidence with a GEN bond that scales with how many petitions already crowd that region.
3. Adjudicate: a fast T1 pass scores the affected population under validator consensus and rules ELIGIBLE, PARTIAL, or INELIGIBLE; borderline scores escalate to a T2 stress test.
4. Fund and allocate: donors contribute per petition, and the pool splits by quadratic weight — the square of summed per-donor roots, scaled by ruling tier, affected percentage, and vintage decay.
5. Release and contest: petitioners pull allocations in proof-backed tranches; a bonded challenge that downgrades a ruling overturns the petition, slashes the remainder, and pays the whistleblower a bounty.

## Architecture

```
backend/relief-dispatch.py   GenLayer Intelligent Contract (Python, runs on the GenVM)
frontend/                    React + Vite + TypeScript dashboard (genlayer-js)
```

Quadratic matching favours many small donors over a few large ones, and the LLM ruling only gates how the pool is split — never the donations themselves — so every petition, contribution, and tranche stays on-chain for the dashboard to audit.

## Live deployment

- **Network**: GenLayer Studionet (chain id 61999)
- **Contract**: `0xB2289703ea0fE1ffEC49cf4708bD002052F31d5a`
- **App**: https://poopitto.github.io/relief-dispatch/

## Run locally

```bash
cd frontend
npm install
npm run dev
npm run build
```

The committed `.env` holds the public Studionet config; no secrets are required. Copy `.env.example` to `.env.local` only to override.

## Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `VITE_CONTRACT_ADDRESS` | yes | Deployed ReliefDispatch contract on Studionet |
| `VITE_CHAIN_ID` | yes | GenLayer chain id (61999) |
| `VITE_RPC_URL` | yes | Studionet JSON-RPC endpoint |

## Deploy the contract

```bash
npx genlayer deploy --contract backend/relief-dispatch.py
```

## Contract methods (`ReliefDispatch`)

| Method | Type | Description |
|--------|------|-------------|
| `register_petitioner` | write | Register the caller as a petitioner with a starting reputation profile. |
| `start_round` | payable | Open a funding round and seed its matching pool with the sent GEN. |
| `close_round_donations` | write | Stop accepting donations on the active round. |
| `seal_round` | write | Lock the round's petition set ahead of allocation. |
| `finalise_round` | write | Close a round once allocation and releases are done. |
| `file_petition` | payable | File a petition with region, title, and evidence; bond scales with regional density. |
| `donate_to_petition` | payable | Contribute GEN to a petition and accrue its quadratic-funding weight. |
| `adjudicate_t1` | write | Run the fast T1 pass; score the affected population and set the ruling. |
| `adjudicate_t2` | write | Run the T2 deep stress test when a petition's score is borderline. |
| `detect_tension` | write | LLM-compare two petitions for duplication or contradiction. |
| `resolve_tension` | write | Resolve a flagged tension link and mark the winner. |
| `allocate_round` | write | Split the matching pool across eligible petitions by adjusted quadratic weight. |
| `release_tranche` | write | Release the next proof-backed tranche; the first release refunds the bond. |
| `challenge_petition` | payable | Post a bond to dispute an allocated petition. |
| `resolve_challenge` | write | Re-adjudicate a challenge; a downgrade overturns the petition and pays a bounty. |
| `advance_epoch` | write | Admin advances the epoch clock. |
| `set_admin` | write | Rotate the admin/keeper address. |
| `top_up_active_pool` | payable | Add GEN to the active round's matching pool. |
| `get_round` | view | Full round record with pool, totals, and petition ids. |
| `get_petition` | view | Full petition dossier: rulings, QF weight, allocation, and tranches. |
| `get_contribution` | view | A single donation record. |
| `get_tension_link` | view | A single tension link between two petitions. |
| `get_challenge` | view | A single challenge record. |
| `get_tranche` | view | A single release tranche with its proof summary. |
| `get_profile` | view | A petitioner's reputation and lifetime petition stats. |
| `get_active_round` | view | Summary of the current active round, if any. |
| `get_pool_state` | view | Epoch, active round, and aggregate pool totals. |
| `list_petitions_of` | view | Petition ids filed by an address. |
| `list_contributions_of` | view | Contribution ids made by an address. |
| `list_petitions_in_region` | view | Petition ids in a region cell. |
| `list_petition_tranches` | view | Tranche ids released for a petition. |
| `list_rounds` | view | All round ids. |
| `list_petitions` | view | All petition ids. |
| `list_tension_links` | view | All tension link ids. |
| `list_challenges` | view | All challenge ids. |
| `list_profiles` | view | All registered petitioner addresses. |
| `get_counts` | view | Compact counter string for the dashboard. |
| `preview_qf_match` | view | Predicted matching share for a petition before allocation. |
| `get_donor_total_for_petition` | view | One donor's summed contribution to one petition. |
| `get_vintage_decay` | view | Live vintage-decay factor (bps) for a petition's weight. |
| `get_round_summary` | view | Aggregate round snapshot: status and ruling histograms, totals. |
| `get_petition_qf_breakdown` | view | Per-donor breakdown of a petition's quadratic signal. |
| `get_tension_links_for_petition` | view | Every tension link involving a petition. |
| `get_region_density` | view | Petition density and required-bond preview for a region. |
| `get_leaderboard_by_reputation` | view | Top petitioner profiles by reputation. |
| `get_constants` | view | Every protocol constant for the UI and indexer. |

## License

MIT
