-- Reverts 0015. Measured values are lost; criteria with a threshold become manual again
-- (their existing results stay as saved).
ALTER TABLE increments.criterion_result DROP COLUMN measured_value;
UPDATE increments.criterion SET pass_rule = '{"kind": "manual"}' WHERE pass_rule ->> 'kind' = 'threshold';
ALTER TABLE increments.criterion DROP CONSTRAINT criterion_pass_rule_kind_check;
