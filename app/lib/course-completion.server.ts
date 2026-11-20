import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
} from "~/db/schema";

/**
 * A Course is Completed for a Student when every one of its Lessons is
 * completed; Quizzes do not count (see GLOSSARY.md). Records the date on the
 * Enrollment the first time that becomes true, and never moves it after.
 */
export function recordCourseCompletion(userId: number, courseId: number) {
  const lessonIds = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);

  if (lessonIds.length === 0) return;

  const completed = db
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

  if ((completed?.count ?? 0) < lessonIds.length) return;

  db.update(enrollments)
    .set({ completedAt: new Date().toISOString() })
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, courseId),
        isNull(enrollments.completedAt)
      )
    )
    .run();
}
