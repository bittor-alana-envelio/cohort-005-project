import { useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/admin.refund-requests";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import {
  UserRole,
  RefundRequestStatus,
  courses,
  purchases,
  refundRequests,
  users,
} from "~/db/schema";
import { db } from "~/db";
import { desc, eq } from "drizzle-orm";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { formatPrice } from "~/lib/utils";
import {
  approveRefundRequest,
  declineRefundRequest,
} from "~/lib/refunds.server";

const refundRequestActionSchema = z.object({
  intent: z.enum(["approve", "decline"]),
  refundRequestId: z.coerce.number().int(),
});

async function requireAdminId(request: Request) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to manage refund requests.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can decide refund requests.", { status: 403 });
  }

  return currentUser.id;
}

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Approve or decline refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminId(request);

  const rows = db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      reason: refundRequests.reason,
      requestedAt: refundRequests.requestedAt,
      resolvedAt: refundRequests.resolvedAt,
      amountRefunded: refundRequests.amountRefunded,
      amountPaid: purchases.amountPaid,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      buyerName: users.name,
      buyerEmail: users.email,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .orderBy(desc(refundRequests.requestedAt))
    .all();

  return {
    pending: rows.filter((r) => r.status === RefundRequestStatus.Pending),
    decided: rows.filter((r) => r.status !== RefundRequestStatus.Pending),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const adminId = await requireAdminId(request);

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundRequestActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { intent, refundRequestId } = parsed.data;
  const decided =
    intent === "approve"
      ? approveRefundRequest(refundRequestId, adminId)
      : declineRefundRequest(refundRequestId, adminId);

  if (!decided) {
    throw data(
      intent === "approve"
        ? "This refund request can no longer be approved."
        : "This refund request can no longer be declined.",
      { status: 409 }
    );
  }

  return { success: true, intent };
}

type RefundRequestRow = Route.ComponentProps["loaderData"]["pending"][number];

function PendingRow({ refundRequest }: { refundRequest: RefundRequestRow }) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("success" in fetcher.data) {
      toast.success(
        fetcher.data.intent === "approve"
          ? "Refund approved."
          : "Refund request declined."
      );
    } else if ("error" in fetcher.data) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/courses/${refundRequest.courseSlug}`}
            className="font-medium hover:underline"
          >
            {refundRequest.courseTitle}
          </Link>
          <p className="text-sm text-muted-foreground">
            {refundRequest.buyerName} ({refundRequest.buyerEmail}) ·{" "}
            {formatPrice(refundRequest.amountPaid)} · requested{" "}
            {new Date(refundRequest.requestedAt).toLocaleDateString()}
          </p>
        </div>
        <fetcher.Form method="post" className="flex gap-2">
          <input
            type="hidden"
            name="refundRequestId"
            value={refundRequest.id}
          />
          <Button
            type="submit"
            name="intent"
            value="approve"
            size="sm"
            disabled={isSubmitting}
          >
            Approve refund
          </Button>
          <Button
            type="submit"
            name="intent"
            value="decline"
            size="sm"
            variant="outline"
            disabled={isSubmitting}
          >
            Decline
          </Button>
        </fetcher.Form>
      </div>
      <p className="mt-3 text-sm">{refundRequest.reason}</p>
    </div>
  );
}

export default function AdminRefundRequests({
  loaderData,
}: Route.ComponentProps) {
  const { pending, decided } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Approving a request refunds the amount paid and ends the Buyer&apos;s
          enrollment. A decline is final.
        </p>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Pending</h2>
      {pending.length === 0 ? (
        <Card className="mb-8">
          <CardContent className="py-8 text-center">
            <ReceiptText className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">No pending refund requests.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-8 space-y-3">
          {pending.map((refundRequest) => (
            <PendingRow key={refundRequest.id} refundRequest={refundRequest} />
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Decided</h2>
          <div className="space-y-2">
            {decided.map((refundRequest) => (
              <div
                key={refundRequest.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <span>
                  {refundRequest.courseTitle} · {refundRequest.buyerName}
                </span>
                <span className="text-muted-foreground">
                  {refundRequest.status === RefundRequestStatus.Approved
                    ? `Refunded ${formatPrice(refundRequest.amountRefunded ?? 0)}`
                    : "Declined"}
                  {refundRequest.resolvedAt &&
                    ` · ${new Date(refundRequest.resolvedAt).toLocaleDateString()}`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refund requests.";

  if (isRouteErrorResponse(error)) {
    title =
      error.status === 401
        ? "Sign in required"
        : error.status === 403
          ? "Access denied"
          : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
