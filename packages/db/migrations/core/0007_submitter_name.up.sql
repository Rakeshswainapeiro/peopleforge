-- 0007 — Who submitted a request, as people read it (S4c, R1-07): "Submitted 15 Oct 2026, 11:14
-- by Priya Nair". The display name at the moment of submitting (from the identity provider);
-- submitted_by keeps the user ID. Earlier submissions have none and show without a name.
ALTER TABLE increments.increment_request
  ADD COLUMN submitted_by_name text CHECK (char_length(submitted_by_name) BETWEEN 1 AND 200);
