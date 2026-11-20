import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  purchases,
  refundRequests,
  RefundRequestStatus,
  seats,
  videoWatchEvents,
} from "~/db/schema";

// ─── Refunds ───
// Vocabulary (see GLOSSARY.md): a Buyer makes a Refund Request inside the
// Refund Window; an Admin approves or declines it. Only an approved request
// is a Refund, which returns the amount paid and ends the Enrollment.

export const REFUND_WINDOW_DAYS = 14;
export const MAX_WATCH_TIME_SECONDS = 2 * 60 * 60;
/** The Refund Window closes once this share of Lessons is completed. */
export const MAX_COMPLETED_LESSON_SHARE = 0.5;

/**
 * A date as a calendar day. The window is counted in whole days, not hours —
 * someone who buys at 23:00 still gets the whole of their fourteenth day.
 */
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAt: string): string {
  const deadline = new Date(purchasedAt);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

export type RefundWindowFacts = {
  purchasedAt: string;
  now: Date;
  watchTimeSeconds: number;
  completedLessonCount: number;
  lessonCount: number;
  hasRefundRequest: boolean;
  hasClaimedSeat: boolean;
};

export type RefundWindowResult =
  | { open: true; lastDayInWindow: string }
  | { open: false; reason: string };

/**
 * Is the Refund Window open for this Purchase? The single statement of the
 * rule — both the course page and the request action ask this.
 */
export function checkRefundWindow(facts: RefundWindowFacts): RefundWindowResult {
  if (facts.hasRefundRequest) {
    return {
      open: false,
      reason: "This purchase already has a refund request.",
    };
  }

  if (facts.hasClaimedSeat) {
    return {
      open: false,
      reason: "A purchase of seats cannot be refunded once a seat is claimed.",
    };
  }

  const today = calendarDay(facts.now);
  const lastDayInWindow = lastDayOfRefundWindow(facts.purchasedAt);
  if (today > lastDayInWindow) {
    return {
      open: false,
      reason: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    };
  }

  if (facts.watchTimeSeconds >= MAX_WATCH_TIME_SECONDS) {
    return {
      open: false,
      reason: "You have watched too much of this course to get a refund.",
    };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= MAX_COMPLETED_LESSON_SHARE
  ) {
    return {
      open: false,
      reason: "You have completed too much of this course to get a refund.",
    };
  }

  return { open: true, lastDayInWindow };
}

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

/**
 * Watch Time: the furthest point reached in each Lesson's video, added up
 * across the given Lessons.
 */
export function getWatchTimeSeconds(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return row?.count ?? 0;
}

function hasRefundRequest(purchaseId: number) {
  return !!db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(eq(refundRequests.purchaseId, purchaseId))
    .get();
}

function hasClaimedSeat(purchaseId: number) {
  return !!db
    .select({ id: seats.id })
    .from(seats)
    .where(and(eq(seats.purchaseId, purchaseId), isNotNull(seats.claimedAt)))
    .get();
}

export type RefundOffer =
  | {
      open: true;
      purchaseId: number;
      /** A Refund is always the amount actually paid. */
      amount: number;
      lastDayInWindow: string;
    }
  | { open: false; reason: string };

/** What a Buyer may ask back for their latest Purchase of a Course. */
export function getRefundOffer(
  userId: number,
  courseId: number,
  now = new Date()
): RefundOffer {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) {
    return { open: false, reason: "You have not bought this course." };
  }

  const lessonIds = getLessonIdsForCourse(courseId);
  const result = checkRefundWindow({
    purchasedAt: purchase.createdAt,
    now,
    watchTimeSeconds: getWatchTimeSeconds(userId, lessonIds),
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    lessonCount: lessonIds.length,
    hasRefundRequest: hasRefundRequest(purchase.id),
    hasClaimedSeat: hasClaimedSeat(purchase.id),
  });

  if (!result.open) return result;

  return {
    open: true,
    purchaseId: purchase.id,
    amount: purchase.amountPaid,
    lastDayInWindow: result.lastDayInWindow,
  };
}

export function createRefundRequest(purchaseId: number, reason: string) {
  return db
    .insert(refundRequests)
    .values({ purchaseId, reason, status: RefundRequestStatus.Pending })
    .returning()
    .get();
}

function getPendingRefundRequest(refundRequestId: number) {
  return db
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.id, refundRequestId),
        eq(refundRequests.status, RefundRequestStatus.Pending)
      )
    )
    .get();
}

/**
 * An Admin approves a Refund Request, making it a Refund: the amount paid goes
 * back, the Buyer's Enrollment ends, and any unclaimed Seats the Purchase
 * bought can no longer be Claimed.
 */
export function approveRefundRequest(refundRequestId: number, adminId: number) {
  const request = getPendingRefundRequest(refundRequestId);
  if (!request) return null;

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, request.purchaseId))
    .get();
  if (!purchase) return null;

  // A Seat may have been Claimed after the request was made. A Purchase of
  // Seats is all-or-nothing, so it can no longer be refunded.
  if (hasClaimedSeat(purchase.id)) return null;

  return db.transaction((tx) => {
    tx.delete(enrollments)
      .where(
        and(
          eq(enrollments.userId, purchase.userId),
          eq(enrollments.courseId, purchase.courseId)
        )
      )
      .run();

    tx.delete(seats).where(eq(seats.purchaseId, purchase.id)).run();

    return tx
      .update(refundRequests)
      .set({
        status: RefundRequestStatus.Approved,
        amountRefunded: purchase.amountPaid,
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: adminId,
      })
      .where(eq(refundRequests.id, request.id))
      .returning()
      .get();
  });
}

/** An Admin declines a Refund Request. A decline is final. */
export function declineRefundRequest(refundRequestId: number, adminId: number) {
  const request = getPendingRefundRequest(refundRequestId);
  if (!request) return null;

  return db
    .update(refundRequests)
    .set({
      status: RefundRequestStatus.Declined,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: adminId,
    })
    .where(eq(refundRequests.id, request.id))
    .returning()
    .get();
}
