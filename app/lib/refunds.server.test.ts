import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

const testDb = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("~/db", () => ({
  get db() {
    return testDb.current;
  },
}));

import {
  approveRefundRequest,
  checkRefundWindow,
  createRefundRequest,
  declineRefundRequest,
  getRefundOffer,
  MAX_WATCH_TIME_SECONDS,
  type RefundWindowFacts,
} from "./refunds.server";

describe("checkRefundWindow", () => {
  const open: RefundWindowFacts = {
    purchasedAt: new Date(2026, 0, 1, 23, 0).toISOString(),
    now: new Date(2026, 0, 2, 9, 0),
    watchTimeSeconds: 0,
    completedLessonCount: 0,
    lessonCount: 10,
    hasRefundRequest: false,
    hasClaimedSeat: false,
  };

  it("is open right after a Purchase", () => {
    expect(checkRefundWindow(open)).toEqual({
      open: true,
      lastDayInWindow: "2026-01-15",
    });
  });

  it("stays open for the whole fourteenth day, counted in calendar days", () => {
    expect(
      checkRefundWindow({ ...open, now: new Date(2026, 0, 15, 23, 59) }).open
    ).toBe(true);
    expect(
      checkRefundWindow({ ...open, now: new Date(2026, 0, 16, 0, 1) }).open
    ).toBe(false);
  });

  it("closes once Watch Time reaches two hours", () => {
    expect(
      checkRefundWindow({ ...open, watchTimeSeconds: MAX_WATCH_TIME_SECONDS })
        .open
    ).toBe(false);
  });

  it("closes once half the Lessons are completed", () => {
    expect(
      checkRefundWindow({ ...open, completedLessonCount: 4 }).open
    ).toBe(true);
    expect(
      checkRefundWindow({ ...open, completedLessonCount: 5 }).open
    ).toBe(false);
  });

  it("allows only one Refund Request per Purchase, even after a decline", () => {
    expect(checkRefundWindow({ ...open, hasRefundRequest: true }).open).toBe(
      false
    );
  });

  it("closes a Purchase of Seats once any Seat is Claimed", () => {
    expect(checkRefundWindow({ ...open, hasClaimedSeat: true }).open).toBe(
      false
    );
  });
});

function setup() {
  const db = createTestDb();
  testDb.current = db;
  const base = seedBaseData(db);

  const admin = db
    .insert(schema.users)
    .values({
      name: "Admin",
      email: "admin@example.com",
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();

  db.update(schema.courses)
    .set({ price: 10000 })
    .where(eq(schema.courses.id, base.course.id))
    .run();

  // Bought at a PPP price, then the list price changed: a Refund is still
  // the amount actually paid.
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 7000,
      country: "US",
    })
    .returning()
    .get();

  db.insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();

  const enrollment = () =>
    db
      .select()
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.userId, base.user.id),
          eq(schema.enrollments.courseId, base.course.id)
        )
      )
      .get();

  return { db, ...base, admin, purchase, enrollment };
}

describe("refund requests", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("offers back the amount actually paid, not the list price", () => {
    const offer = getRefundOffer(ctx.user.id, ctx.course.id);

    expect(offer).toMatchObject({ open: true, amount: 7000 });
  });

  it("refunds the amount paid and ends the Enrollment when approved", () => {
    const request = createRefundRequest(ctx.purchase.id, "Not for me.");

    const approved = approveRefundRequest(request.id, ctx.admin.id);

    expect(approved).toMatchObject({
      status: schema.RefundRequestStatus.Approved,
      amountRefunded: 7000,
      resolvedByUserId: ctx.admin.id,
    });
    expect(ctx.enrollment()).toBeUndefined();
  });

  it("keeps the Enrollment and refunds nothing when declined", () => {
    const request = createRefundRequest(ctx.purchase.id, "Not for me.");

    const declined = declineRefundRequest(request.id, ctx.admin.id);

    expect(declined).toMatchObject({
      status: schema.RefundRequestStatus.Declined,
      amountRefunded: null,
    });
    expect(ctx.enrollment()).toBeDefined();
  });

  it("treats a decline as final", () => {
    const request = createRefundRequest(ctx.purchase.id, "Not for me.");
    declineRefundRequest(request.id, ctx.admin.id);

    expect(getRefundOffer(ctx.user.id, ctx.course.id).open).toBe(false);
    expect(approveRefundRequest(request.id, ctx.admin.id)).toBeNull();
  });

  it("will not approve a Purchase of Seats once a Seat has been Claimed", () => {
    const team = ctx.db.insert(schema.teams).values({}).returning().get();
    ctx.db
      .insert(schema.seats)
      .values({
        teamId: team.id,
        courseId: ctx.course.id,
        purchaseId: ctx.purchase.id,
        code: "SEAT-1",
      })
      .run();
    const request = createRefundRequest(ctx.purchase.id, "Team changed plans.");

    ctx.db
      .update(schema.seats)
      .set({ claimedByUserId: ctx.instructor.id, claimedAt: "2026-01-02" })
      .run();

    expect(approveRefundRequest(request.id, ctx.admin.id)).toBeNull();
  });
});
