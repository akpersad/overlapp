import Link from "next/link";
import { notFound } from "next/navigation";

import { LocalTime } from "@/components/LocalTime";
import { requireUser } from "@/lib/auth";
import {
  cancelProposal,
  lockProposal,
  nudgeProposal,
} from "@/lib/actions/proposals";
import { createClient } from "@/lib/supabase/server";
import { btnDanger, btnPrimary, btnSecondary, card } from "@/lib/ui";
import { RespondForm } from "./respond-form";

type Result = {
  option_id: string;
  starts_at: string;
  ends_at: string;
  yes_count: number;
  maybe_count: number;
  no_count: number;
  available_count: number;
  response_count: number;
  total_members: number;
  quorum: number;
  meets_quorum: boolean;
};

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const { id, proposalId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, group_id, title, description, status, created_by, final_option, pinned_tz")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal || proposal.group_id !== id) notFound();

  const { data: me } = await supabase
    .from("group_members")
    .select("role, status")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me || me.status !== "active") notFound();

  const isManager =
    proposal.created_by === user.id ||
    me.role === "owner" ||
    me.role === "admin";

  const { data: resultRows } = await supabase.rpc("proposal_results", {
    p_proposal_id: proposalId,
  });
  const results = (resultRows ?? []) as Result[];

  const { data: myResponses } = await supabase
    .from("proposal_responses")
    .select("option_id, response")
    .eq("proposal_id", proposalId)
    .eq("user_id", user.id);
  const initialResponses = Object.fromEntries(
    (myResponses ?? []).map((r) => [r.option_id, r.response]),
  );

  const isOpen = proposal.status === "open";
  const isLocked = proposal.status === "locked";
  const respondedCount = results[0]?.response_count ?? 0;
  const totalMembers = results[0]?.total_members ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/groups/${id}`}
          className="text-sm text-ink-muted hover:underline"
        >
          ← Back to group
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-h1 text-ink">
            {proposal.title}
          </h1>
          <StatusBadge status={proposal.status} />
        </div>
        {proposal.description && (
          <p className="text-ink-muted">
            {proposal.description}
          </p>
        )}
        {proposal.pinned_tz && (
          <p className="text-xs text-ink-muted">Times pinned to {proposal.pinned_tz}.</p>
        )}
      </div>

      {/* Respond — members mark availability while the proposal is open. */}
      {isOpen && (
        <section className={card}>
          <h2 className="mb-3 text-h3 text-ink">
            Your availability
          </h2>
          <RespondForm
            groupId={id}
            proposalId={proposalId}
            options={results.map((r) => ({
              id: r.option_id,
              starts_at: r.starts_at,
              ends_at: r.ends_at,
            }))}
            initialResponses={initialResponses}
          />
        </section>
      )}

      {/* Results — overlap tally per option. */}
      <section className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Overlap{" "}
          <span className="text-body-sm font-normal text-ink-subtle tabular">
            ({respondedCount}/{totalMembers} responded)
          </span>
        </h2>
        <ul className="flex flex-col gap-2">
          {results.map((r) => {
            const isFinal = proposal.final_option === r.option_id;
            return (
              <li
                key={r.option_id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                  isFinal
                    ? "border-av-5 bg-av-5/10"
                    : r.meets_quorum
                      ? "border-honey-300"
                      : "border-border"
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-ink tabular">
                    <LocalTime iso={r.starts_at} /> –{" "}
                    <LocalTime iso={r.ends_at} withDate={false} />
                  </span>
                  <span className="text-xs text-ink-muted tabular">
                    {r.yes_count} yes · {r.maybe_count} maybe · {r.no_count} no
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {isFinal && (
                    <span className="rounded-full bg-av-5 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Chosen
                    </span>
                  )}
                  {!isFinal && r.meets_quorum && (
                    <span className="rounded-full bg-honey-50 px-2 py-0.5 text-[10px] font-medium text-honey-900 tabular">
                      Works ({r.available_count}/{r.quorum})
                    </span>
                  )}
                  {isManager && isOpen && (
                    <form action={lockProposal}>
                      <input type="hidden" name="proposal_id" value={proposalId} />
                      <input type="hidden" name="option_id" value={r.option_id} />
                      <input type="hidden" name="group_id" value={id} />
                      <button className={`${btnPrimary} !py-1 !text-xs`}>
                        Lock this
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isLocked && (
        <p className="text-sm text-av-5">
          ✓ Locked. Members who opted in have it on their calendar.
        </p>
      )}

      {/* Manager controls */}
      {isManager && isOpen && (
        <section className={card}>
          <h2 className="mb-3 text-h3 text-ink">
            Manage proposal
          </h2>
          <div className="flex flex-wrap gap-3">
            <form action={nudgeProposal}>
              <input type="hidden" name="proposal_id" value={proposalId} />
              <input type="hidden" name="group_id" value={id} />
              <button className={btnSecondary}>Nudge non-responders</button>
            </form>
            <form action={cancelProposal}>
              <input type="hidden" name="proposal_id" value={proposalId} />
              <input type="hidden" name="group_id" value={id} />
              <button className={btnDanger}>Cancel proposal</button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-honey-50 text-honey-900",
    locked: "bg-av-5 text-white",
    cancelled: "bg-surface-sunken text-ink-muted",
    draft: "bg-surface-sunken text-ink-muted",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? styles.draft
      }`}
    >
      {status}
    </span>
  );
}
