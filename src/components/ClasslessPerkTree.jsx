import { describeLuck, heroLuck } from "../combat/luck";
import { CANONICAL_NODES, purchaseClasslessNode } from "../combat/classlessProgression";
import { IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS } from "../combat/classlessAbilities";
import Spellbook from "./Spellbook";

// Nodes that put a new button on the hero's battle card.
const SPECIAL_MOVE_NODES = new Set(IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS);
const SPELL_NODES = new Set(["A1", "A3", "A3a"]);

const REASONS = {
  invalid_progression: "Progression data is invalid",
  already_owned: "Already owned",
  phase_gated: "Unavailable — system pending",
  effect_pending: "Unavailable — effect pending",
  level_required: "Hero level required",
  prerequisite_required: "Prerequisite required",
  tier_iii_mastery_cap: "Two Tier III nodes already owned",
  insufficient_ap: "Not enough AP",
  unknown_node: "Unknown node",
};

const BLOCKED_NODE_REASONS = {
  C2a: "Unavailable — canonical range unspecified",
};

const EFFECT_LABELS = {
  V1: "+8% direct weapon damage (active)",
  V2: "+10% follow-through damage (active)",
  V2a: "+4% consecutive-hit damage per stack (active)",
  V3: "Active · 20s cooldown · 160% weapon damage plus 40% to one adjacent enemy (active)",
  V3a: "Active · 30s cooldown · nearby allies gain 15% attack speed for 6s (active)",
  W1: "+8% maximum HP (active)",
  W2: "−6% incoming damage (active)",
  W2a: "1.5% maximum HP per second below half HP (active)",
  P1: "+8 percentage points critical chance (active)",
  P2: "First hit marks target for 5s; +10% damage while marked (active)",
  P2a: "+20 percentage points critical damage (active)",
  P3: "Active · 22s cooldown · 180% weapon damage; +25% below 35% target HP (active)",
  P3a: "Active · 18s cooldown · 200% weapon damage below 40% target HP; cooldown refreshes on kill (active)",
  S1: "+5% attack speed (active)",
  S2: "8% direct-attack evasion (active)",
  S3: "+25% first hit after 3 seconds idle (active)",
  W3a: "25% damage reduction below 25% HP (active)",
  T1: "+5% active cooldown reduction (active)",
  T2: "15% slow on first hit every 8 seconds (active)",
  T3: "+8% damage to targets controlled by this hero, lingering for 4 seconds after control (active)",
  T3a: "5% mitigation aura within 5 units; shares the 30% reduction cap (active)",
  C1: "+8% damage to targets hit by an active ability (active)",
  C2: "First ability hit every 10 seconds marks for 4 seconds; next allied hit adds 20% of this hero's attack (active)",
  H1: "2% direct-hit lifesteal (active)",
  F1: "+15 percentage points critical damage (active)",
  A1: "Unlocks mana and spell casting; Arcane Bolt; +8% arcane damage (active)",
  A2: "Choose an element and learn its spells; +10% damage with your elements (active)",
  A2a: "Elemental bolts jump to 2 more foes for 40% (active)",
  A3: "Spell · 20s cooldown · 175% arcane bolt (active)",
  A3a: "Spell · 25s cooldown · lands after 2s on up to 5 foes for 180% (active)",
  F2a: "Once per fight at death's door: Drink or Ultra Crit, chosen in slow motion (active)",
  N1: "1% maximum HP regeneration every 3s after 5s without damage (active)",
  I1: "8% evasion at full HP (active)",
  I2: "15% chance to create a one-hit decoy (active)",
  N2: "Root the next target every 12 seconds (active)",
};

export default function ClasslessPerkTree({ hero, onPurchase, onAllocate, onLearnElement, onClose }) {
  if (!hero || hero.cls || !hero.combat || !hero.progression) return null;
  const owned = new Set(hero.progression.ownedNodeIds || []);
  const branches = [...new Set(CANONICAL_NODES.map((node) => node.branch))];

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-black/85 p-3" data-testid="classless-perk-tree">
      <section className="mx-auto max-w-3xl rounded-xl border border-cyan-400/40 bg-[#080b12] p-3 text-slate-100">
        <header className="flex items-center gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-black text-lg text-cyan-200">{hero.identity?.name || "Hero"} · UNIVERSAL PERKS</h2>
            <p className="font-mono-g text-[10px] text-slate-300" data-testid="classless-progression-balance">
              Level {hero.progression.level} · {hero.progression.xp} XP · {hero.progression.ap} AP · {owned.size} nodes owned
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 rounded border border-white/15 px-3 font-mono-g text-xs" data-testid="classless-perk-close">CLOSE</button>
        </header>
        <p className="py-3 font-mono-g text-[10px] text-yellow-200" data-testid="classless-perk-effects-notice">
          Only effects marked active are purchasable and wired to combat. Pending nodes cannot spend AP.
        </p>
        <section className="mb-4 rounded border border-cyan-400/20 p-3" aria-label="Allocate stat points">
          <div className="mb-2 font-mono-g text-[10px] text-cyan-100">STAT POINTS · {hero.progression.sp} SP</div>
          <p className="mb-2 font-mono-g text-[9px] text-slate-400">Attack, Defense, and Agility feed current combat stats. Intelligence powers spells (Arcana): more mana, stronger spells, and casts that land more often. Luck never adds damage or HP: it tilts the odds, in battle and on the road.</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(hero.combat.stats).map(([stat, value]) => (
              <button key={stat} type="button" disabled={hero.progression.sp <= 0}
                onClick={() => onAllocate?.(stat)} data-testid={`classless-allocate-${stat}`}
                className="min-h-10 rounded border border-white/15 px-2 text-left font-mono-g text-[10px] text-slate-100 disabled:opacity-40">
                {stat.toUpperCase()} · {value} · +1
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono-g text-[9px] text-emerald-200" data-testid="luck-effects">
            LUCK {heroLuck(hero)}: {describeLuck(heroLuck(hero)).join(" · ")}
          </p>
        </section>
        <Spellbook hero={hero} onLearnElement={onLearnElement} />
        <div className="grid gap-3 sm:grid-cols-2">
          {branches.map((branch) => (
            <section key={branch} className="rounded-lg border border-white/10 p-2" aria-label={`${branch} perks`}>
              <h3 className="mb-2 font-display font-bold text-sm text-cyan-100">{branch}</h3>
              <div className="space-y-1.5">
                {CANONICAL_NODES.filter((node) => node.branch === branch).map((node) => {
                  const result = purchaseClasslessNode(hero, node.id);
                  const isOwned = owned.has(node.id);
                  const label = isOwned ? "OWNED" : result.ok ? "PURCHASE" :
                    BLOCKED_NODE_REASONS[node.id] || REASONS[result.reason] || "Unavailable";
                  return (
                    <div key={node.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.025] p-2" data-testid={`classless-node-${node.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono-g text-xs font-bold text-slate-100">
                          {node.name} · {node.id} · Tier {node.tier}
                          {SPECIAL_MOVE_NODES.has(node.id) && <span className="ml-1 text-yellow-300" data-testid="special-move-node">★ Special move</span>}
                          {SPELL_NODES.has(node.id) && <span className="ml-1 text-fuchsia-300">✦ Spell</span>}
                        </div>
                        <div className="font-mono-g text-[9px] text-slate-400">
                          {node.apCost} AP · Level {node.minLevel}
                          {node.prerequisites.length ? ` · Requires ${node.prerequisites.join(" or ")}` : " · No prerequisite"}
                        </div>
                        <div className={`font-mono-g text-[9px] ${EFFECT_LABELS[node.id] ? "text-emerald-300" : "text-amber-300"}`}>
                          {EFFECT_LABELS[node.id] ? node.description :
                            node.id === "C2a" ? `Effect pending — canonical range unspecified. ${node.description}` :
                              `Effect pending — ${node.description}`}
                        </div>
                        {node.gated && <div className="font-mono-g text-[9px] text-yellow-300">Unavailable — system pending</div>}
                      </div>
                      <button type="button" disabled={!result.ok} onClick={() => onPurchase?.(node.id)}
                        aria-label={`${node.id}: ${label}`} data-testid={`classless-node-purchase-${node.id}`}
                        className="min-h-10 min-w-24 rounded border border-cyan-400/30 px-2 font-mono-g text-[9px] text-cyan-100 disabled:border-white/10 disabled:text-slate-500">
                        {label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
