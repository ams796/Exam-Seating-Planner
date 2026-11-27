# How the Hall and Exam services connect to Seat Allocation

The Seat Allocation & Lookup Service (Mohamed Attallah) reads the tables the other two services write:

| Table | Written by | Read by Seat Allocation for |
|---|---|---|
| `halls`, `seats` | Hall & Seat Layout (Mohamed Rishi) | which seats exist, blocked seats, grid size for the seat map |
| `exams`, `exam_halls` (with `position`) | Exam & Enrolment (Nour) | which halls an exam uses and the order to fill them |
| `enrollments` | Exam & Enrolment (Nour) | which students need a seat |
| `proctor_assignments` | Exam & Enrolment (Nour) | which proctor may open which seat map |

Seat Allocation writes `seat_assignments` and the `allocation_status` / `spacing` columns of `exams`.

## Changes must flow back (Phase 1 feedback)

Call these functions from `backend/services/allocationService.js` in your controllers.

### Hall & Seat Layout Service (Mohamed Rishi)

**Blocking a seat** – call before you set `status = 'blocked'`:

```js
const allocationService = require('../services/allocationService');

const result = await allocationService.relocateFromSeat(seatId);
if (!result.ok) {
  return sendError(res, 409, 'SEAT_IN_USE',
    'This seat is used and the hall has no free seat to move the student to.', result.unplaced);
}
// now block the seat; result.moved lists students that were moved (put it in the response / audit log)
```

**Changing a hall's rows/columns** – call before you add or delete seats:

```js
const check = await allocationService.prepareHallResize(hallId);
if (!check.ok) {
  return sendError(res, 409, 'HALL_IN_PUBLISHED_PLAN',
    `Cannot resize: published seating plans use this hall (${check.publishedExams.join(', ')}).`);
}
// draft plans using the hall were cleared (check.clearedDrafts); safe to resize now
```

Deleting a hall: the database already refuses it while an exam uses the hall (`exam_halls` is `ON DELETE RESTRICT`), and a seat with a student on it cannot be deleted (`seat_assignments.seat_id` is `RESTRICT`). Catch error code `23503` and answer 409.

### Exam & Enrolment Service (Nour)

After rescheduling an exam, changing its halls, or importing/editing its student list:

```js
await allocationService.markAllocationOutdated(examId);
// a published plan goes back to draft: students stop seeing it until the admin checks and re-publishes.
// Publishing is refused (409 ALLOCATION_OUTDATED) until the allocation is re-run if the student list changed.
```

When adding halls to an exam, save `position` (1 = filled first).
