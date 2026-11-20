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

import { recordCourseCompletion } from "./course-completion.server";

function setup() {
  const db = createTestDb();
  testDb.current = db;
  const base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();

  const lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );

  db.insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();

  const completeLesson = (lessonId: number) =>
    db
      .insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId,
        status: schema.LessonProgressStatus.Completed,
        completedAt: new Date().toISOString(),
      })
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

  return { ...base, lessonIds, completeLesson, enrollment };
}

describe("recordCourseCompletion", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("leaves the Course not Completed while a Lesson is still open", () => {
    ctx.completeLesson(ctx.lessonIds[0]);

    recordCourseCompletion(ctx.user.id, ctx.course.id);

    expect(ctx.enrollment()?.completedAt).toBeNull();
  });

  it("marks the Course Completed once every Lesson is completed", () => {
    ctx.lessonIds.forEach(ctx.completeLesson);

    recordCourseCompletion(ctx.user.id, ctx.course.id);

    expect(ctx.enrollment()?.completedAt).not.toBeNull();
  });

  it("keeps the first completion date when called again", () => {
    ctx.lessonIds.forEach(ctx.completeLesson);
    recordCourseCompletion(ctx.user.id, ctx.course.id);
    const first = ctx.enrollment()?.completedAt;

    recordCourseCompletion(ctx.user.id, ctx.course.id);

    expect(ctx.enrollment()?.completedAt).toBe(first);
  });
});
