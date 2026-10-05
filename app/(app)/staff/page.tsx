import { requireRole } from "@/lib/security/session";
import { listBranches, listStaff } from "@/lib/queries";
import { Callout, PageHeader } from "@/components/ui";
import { InviteStaffForm, StaffRowEditor } from "@/components/staff-forms";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const session = await requireRole("admin");
  const [staff, branches] = await Promise.all([listStaff(), listBranches()]);

  return (
    <>
      <PageHeader
        title="Staff accounts"
        description="Roles decide who can record clinical entries and who can manage accounts."
      />

      <div className="mb-5">
        <Callout tone="info" title="How access works">
          Every account starts deactivated. Only an active administrator can
          create accounts, change roles, or reactivate access. Deactivating
          someone cuts off their access on their next request, even if their
          session is still open.
        </Callout>
      </div>

      <div className="flex flex-col gap-5">
        <section className="panel p-5">
          <h2 className="panel-title mb-4">
            Current staff ({staff.length})
          </h2>
          <div className="flex flex-col gap-5 divide-y divide-line">
            {staff.map((s) => (
              <div key={s.id} className="pt-5 first:pt-0">
                <StaffRowEditor
                  staff={s as never}
                  branches={branches}
                  isSelf={s.id === session.userId}
                />
              </div>
            ))}
          </div>
        </section>

        <InviteStaffForm branches={branches} />
      </div>
    </>
  );
}