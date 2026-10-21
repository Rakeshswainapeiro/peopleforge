-- 0015 — Criterion thresholds (R1-05, slice S11a). Data dictionary: docs/database/core-schema.md.
-- A criterion may pass on a measured value: `pass_rule` (reserved since 0001) holds
-- {"kind": "manual"} or {"kind": "threshold", "operator": "gte"|"lte", "value": "3.5",
-- "unit": "rating"|…}; the API validates the shape. Each employee's measured value is stored
-- encrypted like the justification (ADR-008): a rating or attendance figure is appraisal data.
-- Additive and instant: a nullable column and a CHECK that every existing row already meets.

ALTER TABLE increments.criterion
  ADD CONSTRAINT criterion_pass_rule_kind_check
  CHECK (pass_rule ->> 'kind' IN ('manual', 'threshold'));

-- Ciphertext of the measured value (decimal string); NULL when the criterion has no threshold
-- or no value was entered yet.
ALTER TABLE increments.criterion_result ADD COLUMN measured_value bytea;
