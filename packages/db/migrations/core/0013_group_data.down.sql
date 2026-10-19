-- Reverts 0013. Every upload, record version and summary is lost: back up first in a shared
-- environment. The evidence-store objects of uploaded files are not deleted (retention).
DROP SCHEMA groupdata CASCADE;
