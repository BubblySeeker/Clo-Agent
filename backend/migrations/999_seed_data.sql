-- ============================================================
-- SAMPLE DATA SEED
-- Populates the CRM with realistic real estate agent data
-- Run AFTER all migrations. Safe to re-run (uses ON CONFLICT DO NOTHING).
-- ============================================================

BEGIN;

-- We need a demo agent user. This uses a fixed UUID so re-runs are idempotent.
-- When you sign in with Clerk, user_sync middleware will create your real user;
-- this demo user lets you see data immediately.
INSERT INTO users (id, clerk_id, email, name, dashboard_layout, settings)
VALUES (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'demo_clerk_id_001',
    'matt@cloagent.com',
    'Matt Faust',
    '{"widgets":["metrics","pipeline","activities","followUps"]}',
    '{"commission_rate":3.0,"notifications":{"email":true,"push":true,"deals":true,"tasks":true}}'
)
ON CONFLICT (id) DO NOTHING;

-- Set RLS context so subsequent inserts pass policy checks
SET LOCAL app.current_agent_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ============================================================
-- CONTACT FOLDERS
-- ============================================================
INSERT INTO contact_folders (id, agent_id, name) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'VIP Clients'),
    ('f0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'First-Time Buyers'),
    ('f0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Investors'),
    ('f0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sellers')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONTACTS (20 realistic contacts)
-- ============================================================
INSERT INTO contacts (id, agent_id, first_name, last_name, email, phone, source, folder_id, created_at) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sarah', 'Chen', 'sarah.chen@gmail.com', '(415) 555-0101', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '45 days'),
    ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Marcus', 'Johnson', 'marcus.j@outlook.com', '(415) 555-0102', 'zillow', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '38 days'),
    ('c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emily', 'Rodriguez', 'emily.rod@yahoo.com', '(510) 555-0103', 'open_house', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '30 days'),
    ('c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'James', 'Park', 'jpark@techcorp.com', '(650) 555-0104', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '60 days'),
    ('c0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Olivia', 'Thompson', 'olivia.t@gmail.com', '(408) 555-0105', 'website', NULL, NOW() - INTERVAL '25 days'),
    ('c0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'David', 'Kim', 'dkim@investment.co', '(415) 555-0106', 'referral', 'f0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '90 days'),
    ('c0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Jessica', 'Williams', 'jwilliams@lawfirm.com', '(510) 555-0107', 'cold_call', NULL, NOW() - INTERVAL '15 days'),
    ('c0000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Robert', 'Garcia', 'rgarcia@email.com', '(650) 555-0108', 'zillow', 'f0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '50 days'),
    ('c0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'Amanda', 'Patel', 'amanda.patel@startup.io', '(408) 555-0109', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '20 days'),
    ('c0000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'Michael', 'Brown', 'mbrown@contractor.net', '(415) 555-0110', 'open_house', 'f0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '70 days'),
    ('c0000000-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lisa', 'Nakamura', 'lisa.n@design.co', '(510) 555-0111', 'website', NULL, NOW() - INTERVAL '10 days'),
    ('c0000000-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', 'Daniel', 'Martinez', 'dmartinez@company.com', '(650) 555-0112', 'referral', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '35 days'),
    ('c0000000-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rachel', 'Lee', 'rachel.lee@finance.com', '(408) 555-0113', 'zillow', 'f0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '55 days'),
    ('c0000000-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001', 'Kevin', 'O''Brien', 'kobrien@realty.com', '(415) 555-0114', 'cold_call', NULL, NOW() - INTERVAL '5 days'),
    ('c0000000-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001', 'Priya', 'Sharma', 'priya.s@techstartup.com', '(510) 555-0115', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '42 days'),
    ('c0000000-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000001', 'Thomas', 'Wilson', 'twilson@retired.net', '(650) 555-0116', 'open_house', 'f0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '80 days'),
    ('c0000000-0000-0000-0000-000000000017', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sophia', 'Nguyen', 'sophia.ng@hospital.org', '(408) 555-0117', 'website', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '18 days'),
    ('c0000000-0000-0000-0000-000000000018', 'aaaaaaaa-0000-0000-0000-000000000001', 'Brandon', 'Taylor', 'btaylor@sales.com', '(415) 555-0118', 'referral', 'f0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '28 days'),
    ('c0000000-0000-0000-0000-000000000019', 'aaaaaaaa-0000-0000-0000-000000000001', 'Michelle', 'Davis', 'mdavis@teacher.edu', '(510) 555-0119', 'zillow', NULL, NOW() - INTERVAL '12 days'),
    ('c0000000-0000-0000-0000-000000000020', 'aaaaaaaa-0000-0000-0000-000000000001', 'Andrew', 'Foster', 'afoster@architect.com', '(650) 555-0120', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '65 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- BUYER PROFILES (10 contacts have buyer profiles)
-- ============================================================
INSERT INTO buyer_profiles (id, contact_id, budget_min, budget_max, bedrooms, bathrooms, locations, must_haves, deal_breakers, property_type, pre_approved, pre_approval_amount, timeline, notes) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 800000, 1200000, 3, 2.0, ARRAY['Pacific Heights', 'Marina', 'Cow Hollow'], ARRAY['Garage', 'Updated kitchen', 'In-unit laundry'], ARRAY['Ground floor', 'No parking'], 'condo', true, 1100000, '3 months', 'Relocating from NYC for tech job. Prefers modern finishes.'),
    ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 500000, 750000, 2, 1.0, ARRAY['Oakland', 'Berkeley', 'Emeryville'], ARRAY['Near BART', 'Pet-friendly'], ARRAY['HOA over $500'], 'condo', true, 700000, '6 months', 'First-time buyer, works in tech. Flexible on location.'),
    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 600000, 900000, 3, 2.0, ARRAY['Fremont', 'Union City', 'Newark'], ARRAY['Good schools', 'Backyard', 'Quiet street'], ARRAY['Busy road', 'No garage'], 'single_family', false, NULL, '2 months', 'Young family, expecting second child. Schools are top priority.'),
    ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 400000, 600000, 1, 1.0, ARRAY['South San Francisco', 'Daly City'], ARRAY['Gym in building', 'View'], ARRAY['Basement unit'], 'condo', true, 550000, '4 months', 'Single professional, wants investment property that appreciates.'),
    ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', 1500000, 2500000, 4, 3.0, ARRAY['Atherton', 'Palo Alto', 'Menlo Park'], ARRAY['Pool', 'Home office', 'Wine cellar'], ARRAY['Near highway'], 'single_family', true, 2200000, '6 months', 'Partner at law firm. Wants luxury home for entertaining.'),
    ('b0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', 900000, 1400000, 3, 2.5, ARRAY['SoMa', 'Mission Bay', 'Dogpatch'], ARRAY['Rooftop', 'Smart home', 'EV charging'], ARRAY['Street noise', 'No doorman'], 'condo', true, 1300000, '1 month', 'Startup founder, just had exit. Ready to buy quickly.'),
    ('b0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000012', 350000, 550000, 2, 1.5, ARRAY['Hayward', 'San Leandro', 'Castro Valley'], ARRAY['Updated bathroom', 'Parking'], ARRAY['Flood zone'], 'townhouse', false, NULL, '8 months', 'Saving for down payment. Wants to stop renting by end of year.'),
    ('b0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000017', 700000, 1000000, 3, 2.0, ARRAY['Walnut Creek', 'Pleasant Hill', 'Concord'], ARRAY['Close to hospital', 'Garage', 'Quiet neighborhood'], ARRAY['Long commute', 'Fixer-upper'], 'single_family', true, 950000, '3 months', 'ER nurse, needs short commute to John Muir Medical Center.'),
    ('b0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000019', 450000, 650000, 2, 2.0, ARRAY['San Mateo', 'Foster City', 'Redwood City'], ARRAY['Good schools', 'Community pool'], ARRAY['No AC'], 'condo', true, 600000, '5 months', 'Teacher moving closer to school. Needs family-friendly area.'),
    ('b0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000020', 1200000, 1800000, 4, 3.0, ARRAY['Mill Valley', 'Sausalito', 'Tiburon'], ARRAY['Architectural character', 'Natural light', 'Views'], ARRAY['Cookie-cutter', 'No character'], 'single_family', true, 1700000, '4 months', 'Architect wants a home with design merit. Will renovate if bones are good.')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PROPERTIES (15 listings)
-- ============================================================
INSERT INTO properties (id, agent_id, address, city, state, zip, price, bedrooms, bathrooms, sqft, property_type, status, listing_type, mls_id, description, year_built, lot_size) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2847 Pacific Ave', 'San Francisco', 'CA', '94115', 1150000, 3, 2.0, 1650, 'condo', 'active', 'sale', 'SF-20240101', 'Stunning Pacific Heights condo with bay views. Recently renovated kitchen with quartz countertops, hardwood floors throughout. In-unit washer/dryer, 1-car garage.', 1925, NULL),
    ('e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '1523 Oak St', 'Oakland', 'CA', '94612', 685000, 2, 1.0, 1100, 'condo', 'active', 'sale', 'OAK-20240015', 'Modern loft-style condo in Uptown Oakland. 2 blocks from 19th St BART. Open floor plan, high ceilings, pet-friendly building with rooftop deck.', 2018, NULL),
    ('e0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '4210 Mission Blvd', 'Fremont', 'CA', '94539', 875000, 3, 2.0, 1800, 'single_family', 'active', 'sale', 'FRE-20240022', 'Charming single-family in Mission San Jose. Top-rated schools (API 950+). Large backyard with mature fruit trees. Updated kitchen and baths.', 1978, 6500.00),
    ('e0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '88 King St #2105', 'San Francisco', 'CA', '94107', 1050000, 2, 2.0, 1250, 'condo', 'active', 'sale', 'SF-20240033', 'Luxurious Mission Bay condo in The Infinity. Floor-to-ceiling windows, chef kitchen, smart home features. Building has pool, gym, 24hr concierge. 1 parking + storage.', 2008, NULL),
    ('e0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '755 Lakeview Dr', 'Palo Alto', 'CA', '94306', 2350000, 4, 3.0, 2800, 'single_family', 'active', 'sale', 'PA-20240044', 'Elegant Palo Alto home on tree-lined street. 4BR/3BA with dedicated home office, pool, and wine room. Minutes to Stanford and University Ave shops.', 1965, 8200.00),
    ('e0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', '320 Elm St', 'San Mateo', 'CA', '94401', 595000, 2, 2.0, 1050, 'condo', 'active', 'sale', 'SM-20240055', 'Updated San Mateo condo near downtown. Community pool, assigned parking. Close to Hillsdale Mall and Caltrain. Perfect for young families or commuters.', 1990, NULL),
    ('e0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '1645 Pine Ridge Rd', 'Mill Valley', 'CA', '94941', 1650000, 4, 3.0, 2400, 'single_family', 'active', 'sale', 'MV-20240066', 'Architectural gem in Mill Valley. Walls of glass, vaulted ceilings, and stunning Mt. Tam views. Open floor plan flows to wraparound deck. Natural light paradise.', 1972, 11000.00),
    ('e0000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', '500 Castro St #302', 'San Francisco', 'CA', '94114', 525000, 1, 1.0, 680, 'condo', 'active', 'sale', 'SF-20240077', 'Bright Castro 1BR with south-facing exposure. Updated kitchen, in-unit laundry, building gym. Walk to everything — Muni, shops, restaurants.', 2001, NULL),
    ('e0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', '2200 Pleasant Hill Rd', 'Pleasant Hill', 'CA', '94523', 825000, 3, 2.0, 1650, 'single_family', 'active', 'sale', 'PH-20240088', 'Move-in ready Pleasant Hill home. Remodeled kitchen, hardwood floors, 2-car garage. Large flat backyard. 10 min to BART, close to John Muir Hospital.', 1985, 7000.00),
    ('e0000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', '4455 Foothill Blvd', 'Hayward', 'CA', '94542', 480000, 2, 1.5, 1200, 'townhouse', 'active', 'sale', 'HW-20240099', 'Well-maintained Hayward townhome. 2BR/1.5BA with attached garage. Community has pool and playground. Near Cal State East Bay campus.', 1995, 2500.00),
    ('e0000000-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', '120 Shoreline Dr', 'Sausalito', 'CA', '94965', 1475000, 3, 2.5, 1900, 'condo', 'pending', 'sale', 'SAU-20240110', 'Waterfront Sausalito condo with Golden Gate views. Open living space, chef kitchen, private deck. Boat slip available. Ferry commute to SF.', 2015, NULL),
    ('e0000000-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', '3900 Broadway', 'Oakland', 'CA', '94611', 1250000, 4, 2.5, 2200, 'single_family', 'sold', 'sale', 'OAK-20240121', 'Craftsman beauty in Rockridge. Original details lovingly preserved. Chef kitchen, landscaped garden, detached studio. Walk to College Ave shops.', 1915, 5800.00),
    ('e0000000-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', '789 The Alameda', 'San Jose', 'CA', '95126', 750000, 3, 2.0, 1450, 'single_family', 'active', 'sale', 'SJ-20240132', 'Charming San Jose bungalow near The Alameda. 3BR/2BA, hardwood floors, updated systems. Detached 2-car garage could be ADU. Great neighborhood.', 1948, 5200.00),
    ('e0000000-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001', '1800 Market St #410', 'San Francisco', 'CA', '94102', 435000, 1, 1.0, 620, 'condo', 'active', 'sale', 'SF-20240143', 'South-facing Market St studio+ with alcove bedroom. Modern building, gym, rooftop. Steps to Whole Foods, Castro, and Church St Muni. Ideal starter or pied-à-terre.', 2016, NULL),
    ('e0000000-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001', '55 Corte Madera Ave', 'Mill Valley', 'CA', '94941', 1800000, 3, 2.5, 2100, 'single_family', 'active', 'sale', 'MV-20240154', 'Midcentury modern masterpiece. Post-and-beam construction, walls of glass, cathedral ceilings. Wraparound redwood deck with panoramic views. Design lovers dream.', 1958, 9500.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DEALS (12 deals across different stages)
-- ============================================================
-- We need deal_stage IDs, so we'll reference by name using subqueries
INSERT INTO deals (id, contact_id, agent_id, stage_id, property_id, title, value, notes, created_at) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Touring'), 'e0000000-0000-0000-0000-000000000001', 'Sarah Chen — Pacific Heights Condo', 1150000, 'Very interested after second showing. Wants to bring her partner for a third visit.', NOW() - INTERVAL '14 days'),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Contacted'), 'e0000000-0000-0000-0000-000000000002', 'Marcus Johnson — Oakland Condo', 685000, 'Sent listings, scheduled call for Thursday.', NOW() - INTERVAL '7 days'),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Offer'), 'e0000000-0000-0000-0000-000000000003', 'Emily Rodriguez — Fremont Family Home', 875000, 'Submitted offer at $860K. Seller countered at $870K. Discussing with client.', NOW() - INTERVAL '20 days'),
    ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Under Contract'), NULL, 'James Park — Sunnyvale Townhouse', 950000, 'Contingencies cleared. Closing scheduled for April 15th. Lender confirmed funding.', NOW() - INTERVAL '30 days'),
    ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Lead'), 'e0000000-0000-0000-0000-000000000008', 'Olivia Thompson — Castro Starter', 525000, 'New lead from website. Interested in Castro area. Pre-approved.', NOW() - INTERVAL '3 days'),
    ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Closed'), 'e0000000-0000-0000-0000-000000000012', 'David Kim — Rockridge Investment', 1250000, 'Closed successfully! Client plans to renovate and rent. Commission: $37,500.', NOW() - INTERVAL '85 days'),
    ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Touring'), 'e0000000-0000-0000-0000-000000000005', 'Jessica Williams — Palo Alto Luxury', 2350000, 'Showed 3 properties last weekend. Client loves the Lakeview Dr house. Second showing Tuesday.', NOW() - INTERVAL '10 days'),
    ('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Lead'), NULL, 'Robert Garcia — Home Sale', 1100000, 'Wants to sell 4BR in Noe Valley. Need to schedule listing appointment.', NOW() - INTERVAL '8 days'),
    ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Offer'), 'e0000000-0000-0000-0000-000000000004', 'Amanda Patel — Mission Bay Condo', 1050000, 'Aggressive offer at asking price. Multiple offer situation. Response expected tomorrow.', NOW() - INTERVAL '5 days'),
    ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Closed'), NULL, 'Michael Brown — Daly City Flip', 680000, 'Closed Feb 1. Investor property, bought below market. 3BR/2BA fixer-upper.', NOW() - INTERVAL '60 days'),
    ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Under Contract'), 'e0000000-0000-0000-0000-000000000011', 'Priya Sharma — Sausalito Waterfront', 1475000, 'Under contract. Inspection passed. Appraisal scheduled next week.', NOW() - INTERVAL '18 days'),
    ('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000001', (SELECT id FROM deal_stages WHERE name = 'Lost'), NULL, 'Thomas Wilson — Downtown Condo', 890000, 'Lost to competing offer. Client went $50K over ask. May re-engage for other properties.', NOW() - INTERVAL '40 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ACTIVITIES (40+ across all types)
-- ============================================================
INSERT INTO activities (id, contact_id, deal_id, agent_id, type, body, created_at, due_date, priority, completed_at) VALUES
    -- Calls
    ('ac000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Initial discovery call. Sarah is relocating from NYC for a PM role at Stripe. Looking for 3BR condo in Pacific Heights or Marina. Budget $800K-$1.2M. Pre-approved through Chase.', NOW() - INTERVAL '40 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Follow-up call after first showing at 2847 Pacific. She loves the unit but wants to see the garage. Scheduling third visit with her partner flying in from NYC.', NOW() - INTERVAL '10 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Intro call. Marcus found listing on Zillow. First-time buyer, works at Salesforce. Wants to be near BART for commute. Budget flexible up to $750K.', NOW() - INTERVAL '6 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Closing coordination call. James confirmed wire transfer scheduled for April 12. Title company has all docs. Smooth closing expected.', NOW() - INTERVAL '3 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Jessica wants to revisit Lakeview Dr property. Discussing whether pool maintenance is worth it. She works 60+ hr weeks. Suggesting pool service recommendations.', NOW() - INTERVAL '2 days', NULL, NULL, NULL),

    -- Emails
    ('ac000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Sent curated list of 5 Pacific Heights condos matching criteria. Highlighted 2847 Pacific Ave as top pick — matches her must-haves perfectly.', NOW() - INTERVAL '35 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Sent counter-offer analysis to Emily. Recommended accepting at $870K — only $10K above our offer and well within budget. School rating analysis attached.', NOW() - INTERVAL '4 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Sent offer package for 88 King St. Amanda''s offer: $1,050,000 all-cash, 14-day close, no contingencies. Strong position in multiple offer situation.', NOW() - INTERVAL '4 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000011', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Welcome email sent to Lisa. Introduced myself and shared current market overview for the areas she''s interested in. Asked about her timeline and preferences.', NOW() - INTERVAL '9 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Sent inspection report summary to Priya. Everything looks good — minor items only. Recommended moving forward without repair requests to keep seller happy.', NOW() - INTERVAL '5 days', NULL, NULL, NULL),

    -- Notes
    ('ac000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'note', 'David wants to add 2 more investment properties this year. Interested in Oakland/Berkeley multi-family. Budget $1.5-2M per property. Follow up in Q2.', NOW() - INTERVAL '80 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'note', 'Robert''s Noe Valley home: 4BR/2.5BA, ~2100 sqft, built 1920s. Needs staging. Comparable sales suggest $1.05-1.15M range. Schedule listing photos next week.', NOW() - INTERVAL '6 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'note', 'Michael closed on the Daly City flip. Plans: new kitchen ($30K), bathrooms ($20K), floors ($10K), paint ($5K). Target list price after reno: $850K. Timeline: 3 months.', NOW() - INTERVAL '55 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', 'note', 'Lost the downtown condo deal. Thomas was outbid by $50K — all-cash buyer. He took it well. Still interested in downsizing. Will send new listings in Nob Hill range.', NOW() - INTERVAL '38 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000020', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'note', 'Met Andrew at the AIA mixer. Architect, wants a mid-century modern in Marin. Very specific taste — needs "good bones." Budget $1.2-1.8M. Mill Valley or Sausalito preferred.', NOW() - INTERVAL '62 days', NULL, NULL, NULL),

    -- Showings
    ('ac000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'showing', 'Showed 2847 Pacific Ave to Sarah. She loved the kitchen reno and bay views. Concerned about street parking. Wants to come back with partner.', NOW() - INTERVAL '12 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'showing', 'Showed 4210 Mission Blvd. Emily and husband loved it. Kids ran straight to the backyard. School is 0.3mi away. They want to make an offer.', NOW() - INTERVAL '22 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'showing', 'Tour day with Jessica: showed 3 Palo Alto properties. She ranked them: 1) 755 Lakeview (loved pool + office) 2) 800 Waverley (nice but dated) 3) 345 Alma (too small).', NOW() - INTERVAL '8 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'showing', 'Showed 88 King St #2105 to Amanda. She said "I want it" within 5 minutes. Loved the smart home features and building amenities. Submitting offer today.', NOW() - INTERVAL '6 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000020', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'showing', 'Showed Andrew 1645 Pine Ridge Rd and 55 Corte Madera. He''s passionate about the Corte Madera mid-century. Wants to bring his design partner for a second look.', NOW() - INTERVAL '15 days', NULL, NULL, NULL),

    -- Tasks (with due dates and priorities)
    ('ac000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Schedule third showing at 2847 Pacific for Sarah + partner', NOW() - INTERVAL '2 days', CURRENT_DATE + INTERVAL '2 days', 'high', NULL),
    ('ac000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Send Marcus updated Oakland/Berkeley listing package', NOW() - INTERVAL '1 day', CURRENT_DATE + INTERVAL '1 day', 'medium', NULL),
    ('ac000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Follow up on counter-offer response from Emily', NOW() - INTERVAL '3 days', CURRENT_DATE, 'high', NULL),
    ('ac000000-0000-0000-0000-000000000024', 'c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Confirm wire transfer with James''s lender', NOW() - INTERVAL '5 days', CURRENT_DATE - INTERVAL '1 day', 'high', NOW() - INTERVAL '1 day'),
    ('ac000000-0000-0000-0000-000000000025', 'c0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Schedule listing photos for Robert''s Noe Valley home', NOW() - INTERVAL '4 days', CURRENT_DATE + INTERVAL '3 days', 'medium', NULL),
    ('ac000000-0000-0000-0000-000000000026', 'c0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Check on Amanda''s offer status — seller response expected today', NOW() - INTERVAL '1 day', CURRENT_DATE, 'high', NULL),
    ('ac000000-0000-0000-0000-000000000027', 'c0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Coordinate appraisal for Priya''s Sausalito unit', NOW() - INTERVAL '3 days', CURRENT_DATE + INTERVAL '4 days', 'medium', NULL),
    ('ac000000-0000-0000-0000-000000000028', 'c0000000-0000-0000-0000-000000000011', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Send Lisa personalized property recommendations', NOW() - INTERVAL '2 days', CURRENT_DATE + INTERVAL '1 day', 'low', NULL),
    ('ac000000-0000-0000-0000-000000000029', 'c0000000-0000-0000-0000-000000000014', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Qualify Kevin — determine budget, timeline, and preferences', NOW() - INTERVAL '4 days', CURRENT_DATE - INTERVAL '2 days', 'medium', NULL),
    ('ac000000-0000-0000-0000-000000000030', NULL, NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Update CRM with Q1 pipeline report for broker meeting', NOW() - INTERVAL '1 day', CURRENT_DATE + INTERVAL '5 days', 'low', NULL),
    -- Completed tasks
    ('ac000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Send David closing documents for Rockridge property', NOW() - INTERVAL '82 days', NOW() - INTERVAL '80 days', 'high', NOW() - INTERVAL '81 days'),
    ('ac000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'task', 'Order home inspection for Michael''s Daly City property', NOW() - INTERVAL '58 days', NOW() - INTERVAL '55 days', 'high', NOW() - INTERVAL '56 days'),

    -- More recent activities for a busy-looking feed
    ('ac000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000017', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Sophia called about Pleasant Hill listings. Needs to be within 15 min of John Muir Hospital for on-call shifts. 3BR/2BA, garage mandatory. Budget to $1M.', NOW() - INTERVAL '1 day', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000034', 'c0000000-0000-0000-0000-000000000018', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Brandon interested in multi-family investment. Sent him 3 Oakland duplexes in the $900K-$1.2M range. He wants to see cap rates and rental history.', NOW() - INTERVAL '2 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000035', 'c0000000-0000-0000-0000-000000000019', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'note', 'Michelle prefers Foster City for the schools (Audubon Elementary rated 9/10). Needs 2BR minimum, community amenities a plus. Budget tight — max $650K.', NOW() - INTERVAL '8 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000036', 'c0000000-0000-0000-0000-000000000012', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Daniel checking in on his saving progress. Now has $45K saved. Needs $55K more for 10% down on a $550K place. Targeting November to start looking seriously.', NOW() - INTERVAL '15 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000037', 'c0000000-0000-0000-0000-000000000013', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Sent Rachel CMA for her Sunset District home. Estimated value $1.05-1.15M based on recent comps. She wants to list in May after kitchen refresh.', NOW() - INTERVAL '20 days', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000038', 'c0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'showing', 'Second showing at 755 Lakeview Dr. Jessica brought her interior designer friend. Both impressed. She''s ready to write an offer. Discussing strategy tomorrow.', NOW() - INTERVAL '1 day', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000039', 'c0000000-0000-0000-0000-000000000020', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'call', 'Andrew confirmed budget is $1.2-1.8M. Loves the 55 Corte Madera listing. Wants to make an offer but at $1.65M (below asking). Discussing offer strategy.', NOW() - INTERVAL '1 day', NULL, NULL, NULL),
    ('ac000000-0000-0000-0000-000000000040', 'c0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Sent Olivia a market analysis for Castro condos under $600K. Three strong options identified. Scheduling showing for Saturday.', NOW() - INTERVAL '1 day', NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- AI PROFILES (5 contacts with generated summaries)
-- ============================================================
INSERT INTO ai_profiles (id, contact_id, summary) VALUES
    ('a0000000-0000-0000-0001-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Sarah Chen is a highly motivated buyer relocating from New York City to San Francisco for a senior PM role at Stripe. She has strong financial standing with a $1.1M pre-approval from Chase. Her priorities are clear: she wants a modern 3BR condo in Pacific Heights or Marina with in-unit laundry and parking. She is decisive but values her partner''s input — expect a joint decision. Timeline is tight (3 months) as she starts work in April. Best approach: curate only top-tier options that check all boxes, and be flexible with showing schedules around her travel.'),
    ('a0000000-0000-0000-0001-000000000002', 'c0000000-0000-0000-0000-000000000004', 'James Park is a methodical buyer — senior engineer at Google with a strong analytical approach to the home search. He researches extensively before tours and asks detailed questions about HOA finances, building maintenance history, and resale metrics. Already under contract for a Sunnyvale townhouse after a 3-month search. Low-maintenance communication style — prefers email with data attached. Likely to be a referral source given his large professional network in tech.'),
    ('a0000000-0000-0000-0001-000000000003', 'c0000000-0000-0000-0000-000000000006', 'David Kim is a seasoned real estate investor with a portfolio of 5+ Bay Area properties. He thinks in terms of cap rates, cash-on-cash returns, and appreciation potential rather than lifestyle amenities. Recently closed on a $1.25M Rockridge property and is already planning his next two acquisitions. Prefers off-market deals and is willing to move fast with all-cash offers. High-value client — maintain quarterly check-ins and flag any off-market opportunities in Oakland/Berkeley immediately.'),
    ('a0000000-0000-0000-0001-000000000004', 'c0000000-0000-0000-0000-000000000009', 'Amanda Patel is a recently-exited startup founder with significant liquidity and an aggressive timeline. She wants to deploy capital into real estate quickly and has shown a strong preference for new construction with smart home features. She makes fast decisions — toured 88 King St and submitted an all-cash offer within hours. Communication style is direct and brief; she values speed over hand-holding. High probability of multiple transactions as she builds a personal real estate portfolio.'),
    ('a0000000-0000-0000-0001-000000000005', 'c0000000-0000-0000-0000-000000000020', 'Andrew Foster is a practicing architect with very specific aesthetic preferences. He values design integrity over size or luxury finishes — "good bones" and natural light are his top criteria. Interested in mid-century modern homes in Marin County, particularly Mill Valley. He will likely want to renovate whatever he buys, so he''s comfortable with properties that need work. Highly engaged and knowledgeable about construction — treat him as a peer when discussing property potential. Will bring his design partner for second showings.')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONVERSATIONS & MESSAGES (2 sample conversations)
-- ============================================================
INSERT INTO conversations (id, contact_id, agent_id, title, created_at) VALUES
    ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sarah Chen property search', NOW() - INTERVAL '30 days'),
    ('c1000000-0000-0000-0000-000000000002', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'Pipeline review', NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES
    ('00000000-0000-0000-0001-000000000001', 'c1000000-0000-0000-0000-000000000001', 'user', 'What properties do we have that match Sarah Chen''s criteria?', NOW() - INTERVAL '30 days'),
    ('00000000-0000-0000-0001-000000000002', 'c1000000-0000-0000-0000-000000000001', 'assistant', 'Based on Sarah''s buyer profile, I found a great match: **2847 Pacific Ave** in Pacific Heights. It''s a 3BR/2BA condo listed at $1,150,000 — right in her budget range. Key matches: updated kitchen with quartz countertops, in-unit washer/dryer, and a 1-car garage. The bay views are a bonus she''ll love. I''d recommend scheduling a showing for this one as the top priority.', NOW() - INTERVAL '30 days' + INTERVAL '1 minute'),
    ('00000000-0000-0000-0001-000000000003', 'c1000000-0000-0000-0000-000000000002', 'user', 'Give me a quick summary of my pipeline — what''s hot right now?', NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0001-000000000004', 'c1000000-0000-0000-0000-000000000002', 'assistant', 'Here''s your pipeline snapshot:\n\n**Hot right now:**\n- **Amanda Patel** — All-cash offer on Mission Bay condo, waiting on seller response TODAY\n- **Emily Rodriguez** — Counter-offer at $870K for Fremont home, needs your decision\n- **Jessica Williams** — Ready to write offer on Palo Alto luxury home after second showing\n\n**Moving forward:**\n- **Priya Sharma** — Under contract in Sausalito, appraisal next week\n- **James Park** — Closing April 15, just confirming wire transfer\n\n**Need attention:**\n- **Marcus Johnson** — Contacted but need to schedule first showing\n- **Olivia Thompson & Robert Garcia** — New leads, need qualification\n\nTotal active pipeline: ~$10.3M across 12 deals. Two closings expected this month.', NOW() - INTERVAL '2 days' + INTERVAL '1 minute')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WORKFLOWS (3 automation workflows)
-- ============================================================
INSERT INTO workflows (id, agent_id, name, description, trigger_type, trigger_config, steps, enabled, created_at) VALUES
    ('00000000-0000-0000-0004-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'New Lead Welcome', 'Send welcome task and log initial outreach when a new contact is created', 'contact_created', '{}', '[{"type":"create_task","config":{"body":"Send welcome email and intro packet","priority":"high","due_days":1}},{"type":"wait","config":{"minutes":1}},{"type":"log_activity","config":{"type":"note","body":"Automated: New lead added to CRM. Welcome workflow initiated."}}]', true, NOW() - INTERVAL '60 days'),
    ('00000000-0000-0000-0004-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Offer Follow-Up', 'Create follow-up task when a deal moves to Offer stage', 'deal_stage_changed', '{"to_stage":"Offer"}', '[{"type":"create_task","config":{"body":"Follow up on offer status with listing agent","priority":"high","due_days":2}},{"type":"log_activity","config":{"type":"note","body":"Automated: Deal moved to Offer stage. Follow-up task created."}}]', true, NOW() - INTERVAL '45 days'),
    ('00000000-0000-0000-0004-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Post-Showing Check-in', 'Log reminder to check in after a showing is logged', 'activity_logged', '{"activity_type":"showing"}', '[{"type":"wait","config":{"minutes":1440}},{"type":"create_task","config":{"body":"Check in with client after showing — get feedback and next steps","priority":"medium","due_days":1}}]', true, NOW() - INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- Sample workflow runs
INSERT INTO workflow_runs (id, workflow_id, agent_id, trigger_data, status, current_step, step_results, started_at, completed_at) VALUES
    ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0004-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '{"contact_id":"c0000000-0000-0000-0000-000000000014","contact_name":"Kevin O''Brien"}', 'completed', 2, '[{"step":0,"status":"completed","result":"Task created"},{"step":1,"status":"completed","result":"Waited 1 minutes"},{"step":2,"status":"completed","result":"Activity logged"}]', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '2 minutes'),
    ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0004-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '{"deal_id":"d0000000-0000-0000-0000-000000000003","deal_title":"Emily Rodriguez — Fremont Family Home","to_stage":"Offer"}', 'completed', 1, '[{"step":0,"status":"completed","result":"Task created"},{"step":1,"status":"completed","result":"Activity logged"}]', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days' + INTERVAL '1 minute'),
    ('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0004-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '{"activity_id":"ac000000-0000-0000-0000-000000000038","contact_name":"Jessica Williams"}', 'running', 0, '[{"step":0,"status":"running","result":"Waiting 1440 minutes"}]', NOW() - INTERVAL '1 day', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PORTAL SETTINGS + TOKENS (2 contacts have portal access)
-- ============================================================
INSERT INTO portal_settings (id, agent_id, show_deal_value, show_activities, show_properties, welcome_message, agent_phone, agent_email)
VALUES (
    '00000000-0000-0000-0002-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    false,
    true,
    true,
    'Welcome to your personalized client portal! Here you can track your home search progress, view properties, and see our timeline together. Feel free to reach out anytime.',
    '(415) 555-0100',
    'matt@cloagent.com'
)
ON CONFLICT DO NOTHING;

INSERT INTO portal_tokens (id, contact_id, agent_id, token, expires_at, last_used_at) VALUES
    ('00000000-0000-0000-0003-000000000001', 'c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'demo_portal_token_sarah_chen_2024', NOW() + INTERVAL '25 days', NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0003-000000000002', 'c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'demo_portal_token_james_park_2024', NOW() + INTERVAL '20 days', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- DONE
-- ============================================================
-- Summary:
--   1 demo agent user (Matt Faust)
--   4 contact folders
--   20 contacts across all sources
--   10 buyer profiles with realistic preferences
--   15 properties across the Bay Area
--   12 deals in all 7 pipeline stages
--   40 activities (calls, emails, notes, showings, tasks)
--   5 AI-generated contact profiles
--   2 conversations with messages
--   3 workflows with sample runs
--   Portal settings + 2 portal tokens
