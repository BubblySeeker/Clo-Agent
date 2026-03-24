-- Add agent's personal phone number for two-leg bridge calling
ALTER TABLE twilio_config ADD COLUMN personal_phone TEXT;
