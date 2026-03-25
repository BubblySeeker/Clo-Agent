-- Add property_id to activities for linking tasks/activities to properties
ALTER TABLE activities ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activities_property_id ON activities(property_id);
