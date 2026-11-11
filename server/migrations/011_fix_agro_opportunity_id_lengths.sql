-- Migration 011: Fix AgroConnect opportunity ID lengths.

-- Temporarily remove the foreign key so both related columns
-- can be modified to the same length.

ALTER TABLE agro_opportunity_signups
DROP FOREIGN KEY fk_agro_signup_opportunity;

-- Increase the opportunity ID length.
ALTER TABLE agro_opportunities
MODIFY opportunity_id VARCHAR(50) NOT NULL;

-- Increase the signup ID length.
ALTER TABLE agro_opportunity_signups
MODIFY signup_id VARCHAR(50) NOT NULL;

-- Keep the related opportunity IDs compatible.
ALTER TABLE agro_opportunity_signups
MODIFY opportunity_id VARCHAR(50) NOT NULL;

-- Restore the foreign key.
ALTER TABLE agro_opportunity_signups
ADD CONSTRAINT fk_agro_signup_opportunity
FOREIGN KEY (opportunity_id)
REFERENCES agro_opportunities (opportunity_id)
ON DELETE CASCADE
ON UPDATE CASCADE;