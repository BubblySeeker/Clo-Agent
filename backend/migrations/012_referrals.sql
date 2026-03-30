-- Referral network: tracks who referred whom
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    referrer_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referrer_id, referred_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referrals_agent_isolation ON referrals
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE INDEX idx_referrals_agent ON referrals(agent_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);

-- Add referred_by to contacts
ALTER TABLE contacts ADD COLUMN referred_by UUID REFERENCES contacts(id) ON DELETE SET NULL;
