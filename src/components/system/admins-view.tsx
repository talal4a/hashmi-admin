"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, KeyRound, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import {
  ALL_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  permissionsForRole,
} from "@/lib/auth/permissions";
import { formatDate, formatRelative, initials } from "@/lib/utils/format";
import {
  changeRoleAction,
  inviteAdminAction,
  removeAdminAction,
  setAdminActiveAction,
} from "@/server/actions/admins";
import type { AdminUser, Role } from "@/types";

export function AdminsView({
  admins,
  currentUid,
  canWrite,
}: {
  admins: AdminUser[];
  currentUid: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ email: "", displayName: "", role: "order_manager" as Role });
  const [roleFor, setRoleFor] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState<Role>("order_manager");
  const [reason, setReason] = useState("");
  const [statusFor, setStatusFor] = useState<AdminUser | null>(null);
  const [removeFor, setRemoveFor] = useState<AdminUser | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, done: () => void) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? "Done");
        setReason("");
        done();
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader
            title="Admin users"
            subtitle="Access is granted by role; the server re-checks it on every request"
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setInviting(true)}>
                  <Plus className="size-4" />
                  Add admin
                </Button>
              ) : null
            }
          />
          {admins.length === 0 ? (
            <EmptyState title="No admins yet" icon={<ShieldCheck className="size-5" />} />
          ) : (
            <TableScroll>
              <Table className="min-w-[760px]">
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Role</Th>
                    <Th>Added</Th>
                    <Th>Last sign-in</Th>
                    <Th>Status</Th>
                    {canWrite ? <Th align="right">Actions</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <Tr key={admin.uid}>
                      <Td>
                        <span className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--hm-cyan-100)] text-[11px] font-bold text-[var(--hm-cyan-800)]">
                            {initials(admin.displayName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-[var(--hm-ink-900)]">
                              {admin.displayName}
                              {admin.uid === currentUid ? (
                                <Chip tone="cyan" className="ml-1.5">You</Chip>
                              ) : null}
                            </span>
                            <span className="block truncate text-[11.5px] text-[var(--hm-ink-500)]">
                              {admin.email}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <span title={ROLE_DESCRIPTIONS[admin.role]}>
                          <Chip tone={admin.role === "super_admin" ? "danger" : "navy"}>
                            {ROLE_LABELS[admin.role]}
                          </Chip>
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-[var(--hm-ink-500)]">
                        {formatDate(admin.createdAt)}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-[var(--hm-ink-500)]">
                        {admin.lastLoginAt ? formatRelative(admin.lastLoginAt) : "Never"}
                      </Td>
                      <Td>
                        <Chip tone={admin.active ? "success" : "neutral"}>
                          {admin.active ? "Active" : "Disabled"}
                        </Chip>
                      </Td>
                      {canWrite ? (
                        <Td align="right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRoleFor(admin);
                                setNewRole(admin.role);
                              }}
                            >
                              <KeyRound className="size-3.5" />
                              Role
                            </Button>
                            <button
                              type="button"
                              onClick={() => setStatusFor(admin)}
                              disabled={admin.uid === currentUid && admin.active}
                              aria-label={admin.active ? `Disable ${admin.displayName}` : `Enable ${admin.displayName}`}
                              title={admin.active ? "Disable access" : "Restore access"}
                              className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-ink-100)] hover:text-[var(--hm-ink-800)] disabled:opacity-40"
                            >
                              {admin.active ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveFor(admin)}
                              disabled={admin.active || admin.uid === currentUid}
                              aria-label={`Remove ${admin.displayName}`}
                              title={admin.active ? "Disable before removing" : "Remove"}
                              className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)] disabled:opacity-40"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          )}
        </Card>

        <Card>
          <CardHeader title="What each role can do" subtitle="The server enforces exactly this" />
          <CardBody className="flex flex-col gap-3.5">
            {ALL_ROLES.map((role) => (
              <div key={role}>
                <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--hm-ink-900)]">
                  {ROLE_LABELS[role]}
                  <span className="text-[11px] font-normal text-[var(--hm-ink-400)] tabular-nums">
                    {permissionsForRole(role).length} permissions
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--hm-ink-500)]">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Invite */}
      <Dialog
        open={inviting}
        onClose={() => setInviting(false)}
        title="Add an admin"
        description="They sign in with their own Firebase credentials — no password is set here."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setInviting(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                run(
                  () => inviteAdminAction(invite),
                  () => {
                    setInviting(false);
                    setInvite({ email: "", displayName: "", role: "order_manager" });
                  },
                )
              }
              loading={pending}
              disabled={!invite.email.trim() || !invite.displayName.trim()}
            >
              <UserPlus className="size-4" />
              Add admin
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="a-name" required>
            <Input
              id="a-name"
              value={invite.displayName}
              onChange={(e) => setInvite({ ...invite, displayName: e.target.value })}
              placeholder="Ayesha Khan"
            />
          </Field>
          <Field label="Work email" htmlFor="a-email" required hint="Must match their Firebase Auth account">
            <Input
              id="a-email"
              type="email"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              placeholder="ayesha@hashmimart.example"
            />
          </Field>
          <Field label="Role" htmlFor="a-role" hint={ROLE_DESCRIPTIONS[invite.role]}>
            <Select
              id="a-role"
              value={invite.role}
              onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>

      {/* Role change */}
      <Dialog
        open={roleFor !== null}
        onClose={() => setRoleFor(null)}
        title={`Change role — ${roleFor?.displayName ?? ""}`}
        description="Role changes are recorded in the audit log."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRoleFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                roleFor &&
                run(
                  () => changeRoleAction({ uid: roleFor.uid, role: newRole, reason }),
                  () => setRoleFor(null),
                )
              }
              loading={pending}
              disabled={!reason.trim() || newRole === roleFor?.role}
            >
              Change role
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="New role" htmlFor="a-newrole" hint={ROLE_DESCRIPTIONS[newRole]}>
            <Select
              id="a-newrole"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="a-reason" required>
            <Textarea
              id="a-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Moving to the fulfilment team"
            />
          </Field>
        </div>
      </Dialog>

      {/* Enable / disable */}
      <Dialog
        open={statusFor !== null}
        onClose={() => setStatusFor(null)}
        title={statusFor?.active ? `Disable ${statusFor.displayName}?` : `Restore ${statusFor?.displayName ?? ""}?`}
        description={
          statusFor?.active
            ? "They lose access immediately; their existing session stops working on its next request."
            : "They regain access with the same role."
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant={statusFor?.active ? "danger" : "primary"}
              onClick={() =>
                statusFor &&
                run(
                  () =>
                    setAdminActiveAction({
                      uid: statusFor.uid,
                      active: !statusFor.active,
                      reason,
                    }),
                  () => setStatusFor(null),
                )
              }
              loading={pending}
              disabled={!reason.trim()}
            >
              {statusFor?.active ? "Disable access" : "Restore access"}
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="a-statusreason" required>
          <Textarea
            id="a-statusreason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Left the company"
          />
        </Field>
      </Dialog>

      {/* Remove */}
      <Dialog
        open={removeFor !== null}
        onClose={() => setRemoveFor(null)}
        title={`Remove ${removeFor?.displayName ?? ""}?`}
        description="Their audit history is kept; only the admin record is deleted."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoveFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                removeFor &&
                run(
                  () => removeAdminAction(removeFor.uid, reason),
                  () => setRemoveFor(null),
                )
              }
              loading={pending}
              disabled={!reason.trim()}
            >
              Remove
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="a-removereason" required>
          <Textarea
            id="a-removereason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Offboarded three months ago"
          />
        </Field>
      </Dialog>
    </>
  );
}
