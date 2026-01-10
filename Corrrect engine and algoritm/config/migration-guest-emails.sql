-- Migration: Guest Email Collection for Match Stats
-- Description: Creates table to store guest user emails and game statistics for marketing
-- Created: 2026-01-10

-- Create guest_emails table
CREATE TABLE IF NOT EXISTS guest_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    source TEXT DEFAULT 'game_stats',
    game_data JSONB,
    subscribed BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_guest_emails_created_at
ON guest_emails(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_emails_email
ON guest_emails(email);

CREATE INDEX IF NOT EXISTS idx_guest_emails_source
ON guest_emails(source);

-- Add constraint to prevent duplicate emails from same source within 24 hours
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_email_daily
ON guest_emails(email, source, (DATE(created_at)));

-- Add comment to table
COMMENT ON TABLE guest_emails IS 'Stores guest user email addresses collected from post-game stats sharing';

-- Add column comments
COMMENT ON COLUMN guest_emails.email IS 'Guest user email address';
COMMENT ON COLUMN guest_emails.source IS 'Source of email collection (game_stats, match_report, etc.)';
COMMENT ON COLUMN guest_emails.game_data IS 'JSON data containing game statistics and metadata';
COMMENT ON COLUMN guest_emails.subscribed IS 'Whether user is subscribed to marketing emails';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_guest_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_guest_emails_updated_at ON guest_emails;
CREATE TRIGGER trigger_update_guest_emails_updated_at
    BEFORE UPDATE ON guest_emails
    FOR EACH ROW
    EXECUTE FUNCTION update_guest_emails_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE guest_emails ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous users to insert their own emails
CREATE POLICY "Allow anonymous insert"
ON guest_emails
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow authenticated users to view all emails (admin access)
CREATE POLICY "Allow authenticated select"
ON guest_emails
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow service role full access (for Edge Functions)
CREATE POLICY "Allow service role all"
ON guest_emails
FOR ALL
TO service_role
USING (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT ON guest_emails TO anon;
GRANT SELECT ON guest_emails TO authenticated;
GRANT ALL ON guest_emails TO service_role;

-- Verification query (run this after migration to confirm)
-- SELECT COUNT(*) as total_emails,
--        COUNT(DISTINCT email) as unique_emails,
--        MAX(created_at) as latest_submission
-- FROM guest_emails;
