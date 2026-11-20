import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund-request";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import { createRefundRequest, getRefundOffer } from "~/lib/refunds.server";

const refundRequestParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundRequestActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

/**
 * The confirmation the Buyer gets in their inbox. There is no mail transport
 * wired up yet, so the built message goes to the server log.
 */
function buildRefundRequestEmail(input: {
  buyerName: string;
  buyerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.buyerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.buyerName},`,
      "",
      `We have your refund request for "${input.courseTitle}".`,
      `If it is approved, you will get back ${formatPrice(input.amount)}, the amount you paid.`,
      "",
      "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is decided.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundRequestParamsSchema);
  const course = db.select().from(courses).where(eq(courses.slug, slug)).get();

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const buyer = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!buyer) {
    throw data("User not found", { status: 404 });
  }

  const offer = getRefundOffer(currentUserId, course.id);

  if (!offer.open) {
    throw data(offer.reason, { status: 403 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundRequestActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  createRefundRequest(offer.purchaseId, parsed.data.reason);

  const email = buildRefundRequestEmail({
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    courseTitle: course.title,
    amount: offer.amount,
  });

  console.log(
    `[email] to=${email.to} subject=${email.subject}\n${email.body}`
  );

  return redirect("/settings");
}
