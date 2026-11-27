// Seat Allocation & Lookup Service (owner: Mohamed Attallah): HTTP layer.
// Validates input, calls allocationService, chooses the status code, and writes audit events.
const allocationService = require('../services/allocationService');
const { audit } = require('../services/audit');
const { sendError, toId } = require('../utils/errors');

const SEAT_LABEL = /^[A-Za-z]{1,2}[0-9]{1,2}$/;   // e.g. C7, AB12

// Turns ServiceError into the right answer; anything else goes to the central 500 handler.
function handle(res, next, error) {
  if (error instanceof allocationService.ServiceError) {
    return sendError(res, error.status, error.code, error.message, error.details);
  }
  return next(error);
}

function examIdFrom(req, res) {
  const examId = toId(req.params.examId);
  if (!examId) sendError(res, 400, 'VALIDATION_ERROR', 'Exam id must be a positive whole number.');
  return examId;
}

// POST /api/exams/:examId/allocation   body: { "spacing": true|false } (optional, default false)
async function run(req, res, next) {
  try {
    const examId = examIdFrom(req, res);
    if (!examId) return;
    const body = req.body || {};
    if (body.spacing !== undefined && typeof body.spacing !== 'boolean') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'spacing must be true or false.');
    }
    const result = await allocationService.runAllocation(examId, { spacing: body.spacing === true });
    await audit(req, 'ALLOCATION_RUN', `exam ${examId}: ${result.studentsSeated} seated`, 'success');
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof allocationService.ServiceError && error.status === 409) {
      await audit(req, 'ALLOCATION_RUN', `exam ${req.params.examId}: ${error.code}`, 'failed');
    }
    handle(res, next, error);
  }
}

// GET /api/exams/:examId/allocation?hallId=2&student=S2026
async function view(req, res, next) {
  try {
    const examId = examIdFrom(req, res);
    if (!examId) return;
    let hallId = null;
    if (req.query.hallId !== undefined && req.query.hallId !== '') {
      hallId = toId(req.query.hallId);
      if (!hallId) return sendError(res, 400, 'VALIDATION_ERROR', 'hallId must be a positive whole number.');
    }
    const student = typeof req.query.student === 'string' ? req.query.student.trim() : '';
    if (student.length > 60) return sendError(res, 400, 'VALIDATION_ERROR', 'Search text is too long (max 60).');
    res.status(200).json(await allocationService.getAllocation(examId, { hallId, student }));
  } catch (error) {
    handle(res, next, error);
  }
}

// PATCH /api/allocations/:assignmentId   body: { "hallId": 2, "seatLabel": "C7" }
async function move(req, res, next) {
  try {
    const assignmentId = toId(req.params.assignmentId);
    if (!assignmentId) return sendError(res, 400, 'VALIDATION_ERROR', 'Assignment id must be a positive whole number.');
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
    }
    const { hallId, seatLabel } = req.body || {};
    const hall = toId(hallId);
    if (!hall) return sendError(res, 400, 'VALIDATION_ERROR', 'hallId must be a positive whole number.');
    if (typeof seatLabel !== 'string' || !SEAT_LABEL.test(seatLabel.trim())) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'seatLabel must look like C7 (row letter + seat number).');
    }
    const result = await allocationService.moveStudent(assignmentId, { hallId: hall, seatLabel: seatLabel.trim() });
    await audit(req, 'STUDENT_MOVED', `exam ${result.examId}: ${result.studentCode} -> ${result.seat}`, 'success');
    res.status(200).json(result);
  } catch (error) {
    handle(res, next, error);
  }
}

// POST /api/exams/:examId/allocation/publish
async function publish(req, res, next) {
  try {
    const examId = examIdFrom(req, res);
    if (!examId) return;
    const result = await allocationService.publishAllocation(examId);
    await audit(req, 'ALLOCATION_PUBLISHED', `exam ${examId}`, 'success');
    res.status(200).json(result);
  } catch (error) {
    handle(res, next, error);
  }
}

// DELETE /api/exams/:examId/allocation
async function clear(req, res, next) {
  try {
    const examId = examIdFrom(req, res);
    if (!examId) return;
    await allocationService.clearAllocation(examId);
    await audit(req, 'ALLOCATION_CLEARED', `exam ${examId}`, 'success');
    res.status(204).end();
  } catch (error) {
    handle(res, next, error);
  }
}

// GET /api/allocations/overview
async function overview(req, res, next) {
  try {
    res.status(200).json(await allocationService.listOverview());
  } catch (error) {
    handle(res, next, error);
  }
}

// GET /api/me/seats  (student: own seats only, id taken from the session)
async function mySeats(req, res, next) {
  try {
    res.status(200).json(await allocationService.getMySeats(req.user.id));
  } catch (error) {
    handle(res, next, error);
  }
}

// GET /api/me/proctor-halls  (proctor: own assignments only)
async function myProctorHalls(req, res, next) {
  try {
    res.status(200).json(await allocationService.getMyProctorHalls(req.user.id));
  } catch (error) {
    handle(res, next, error);
  }
}

// GET /api/exams/:examId/halls/:hallId/seat-map
async function seatMap(req, res, next) {
  try {
    const examId = examIdFrom(req, res);
    if (!examId) return;
    const hallId = toId(req.params.hallId);
    if (!hallId) return sendError(res, 400, 'VALIDATION_ERROR', 'Hall id must be a positive whole number.');
    res.status(200).json(await allocationService.getSeatMap(examId, hallId, req.user));
  } catch (error) {
    if (error instanceof allocationService.ServiceError && error.status === 403) {
      await audit(req, 'ACCESS_DENIED', `seat-map exam ${req.params.examId} hall ${req.params.hallId}`, 'denied');
    }
    handle(res, next, error);
  }
}

module.exports = { run, view, move, publish, clear, overview, mySeats, myProctorHalls, seatMap };
