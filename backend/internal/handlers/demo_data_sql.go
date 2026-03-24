package handlers

import "fmt"

// demoDataSQL returns the SQL statements to seed demo data for a given agent.
func demoDataSQL(agentID string) []string {
	a := agentID
	return []string{
		// Contact folders
		fmt.Sprintf(`INSERT INTO contact_folders (id, agent_id, name) VALUES
			('f0000000-0000-0000-0000-000000000001', '%s', 'VIP Clients'),
			('f0000000-0000-0000-0000-000000000002', '%s', 'First-Time Buyers'),
			('f0000000-0000-0000-0000-000000000003', '%s', 'Investors'),
			('f0000000-0000-0000-0000-000000000004', '%s', 'Sellers')
		ON CONFLICT DO NOTHING`, a, a, a, a),

		// Contacts
		fmt.Sprintf(`INSERT INTO contacts (id, agent_id, first_name, last_name, email, phone, source, folder_id, created_at) VALUES
			('c0000000-0000-0000-0000-000000000001', '%[1]s', 'Sarah', 'Chen', 'sarah.chen@gmail.com', '(415) 555-0101', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '45 days'),
			('c0000000-0000-0000-0000-000000000002', '%[1]s', 'Marcus', 'Johnson', 'marcus.j@outlook.com', '(415) 555-0102', 'zillow', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '38 days'),
			('c0000000-0000-0000-0000-000000000003', '%[1]s', 'Emily', 'Rodriguez', 'emily.rod@yahoo.com', '(510) 555-0103', 'open_house', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '30 days'),
			('c0000000-0000-0000-0000-000000000004', '%[1]s', 'James', 'Park', 'jpark@techcorp.com', '(650) 555-0104', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '60 days'),
			('c0000000-0000-0000-0000-000000000005', '%[1]s', 'Olivia', 'Thompson', 'olivia.t@gmail.com', '(408) 555-0105', 'website', NULL, NOW() - INTERVAL '25 days'),
			('c0000000-0000-0000-0000-000000000006', '%[1]s', 'David', 'Kim', 'dkim@investment.co', '(415) 555-0106', 'referral', 'f0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '90 days'),
			('c0000000-0000-0000-0000-000000000007', '%[1]s', 'Jessica', 'Williams', 'jwilliams@lawfirm.com', '(510) 555-0107', 'cold_call', NULL, NOW() - INTERVAL '15 days'),
			('c0000000-0000-0000-0000-000000000008', '%[1]s', 'Robert', 'Garcia', 'rgarcia@email.com', '(650) 555-0108', 'zillow', 'f0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '50 days'),
			('c0000000-0000-0000-0000-000000000009', '%[1]s', 'Amanda', 'Patel', 'amanda.patel@startup.io', '(408) 555-0109', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '20 days'),
			('c0000000-0000-0000-0000-000000000010', '%[1]s', 'Michael', 'Brown', 'mbrown@contractor.net', '(415) 555-0110', 'open_house', 'f0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '70 days'),
			('c0000000-0000-0000-0000-000000000011', '%[1]s', 'Lisa', 'Nakamura', 'lisa.n@design.co', '(510) 555-0111', 'website', NULL, NOW() - INTERVAL '10 days'),
			('c0000000-0000-0000-0000-000000000012', '%[1]s', 'Daniel', 'Martinez', 'dmartinez@company.com', '(650) 555-0112', 'referral', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '35 days'),
			('c0000000-0000-0000-0000-000000000013', '%[1]s', 'Rachel', 'Lee', 'rachel.lee@finance.com', '(408) 555-0113', 'zillow', 'f0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '55 days'),
			('c0000000-0000-0000-0000-000000000014', '%[1]s', 'Kevin', 'O''Brien', 'kobrien@realty.com', '(415) 555-0114', 'cold_call', NULL, NOW() - INTERVAL '5 days'),
			('c0000000-0000-0000-0000-000000000015', '%[1]s', 'Priya', 'Sharma', 'priya.s@techstartup.com', '(510) 555-0115', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '42 days'),
			('c0000000-0000-0000-0000-000000000016', '%[1]s', 'Thomas', 'Wilson', 'twilson@retired.net', '(650) 555-0116', 'open_house', 'f0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '80 days'),
			('c0000000-0000-0000-0000-000000000017', '%[1]s', 'Sophia', 'Nguyen', 'sophia.ng@hospital.org', '(408) 555-0117', 'website', 'f0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '18 days'),
			('c0000000-0000-0000-0000-000000000018', '%[1]s', 'Brandon', 'Taylor', 'btaylor@sales.com', '(415) 555-0118', 'referral', 'f0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '28 days'),
			('c0000000-0000-0000-0000-000000000019', '%[1]s', 'Michelle', 'Davis', 'mdavis@teacher.edu', '(510) 555-0119', 'zillow', NULL, NOW() - INTERVAL '12 days'),
			('c0000000-0000-0000-0000-000000000020', '%[1]s', 'Andrew', 'Foster', 'afoster@architect.com', '(650) 555-0120', 'referral', 'f0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '65 days')
		ON CONFLICT DO NOTHING`, a),

		// Buyer profiles
		fmt.Sprintf(`INSERT INTO buyer_profiles (id, contact_id, budget_min, budget_max, bedrooms, bathrooms, locations, must_haves, deal_breakers, property_type, pre_approved, pre_approval_amount, timeline, notes) VALUES
			('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 800000, 1200000, 3, 2.0, ARRAY['Pacific Heights','Marina','Cow Hollow'], ARRAY['Garage','Updated kitchen','In-unit laundry'], ARRAY['Ground floor','No parking'], 'condo', true, 1100000, '3 months', 'Relocating from NYC for tech job. Prefers modern finishes.'),
			('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 500000, 750000, 2, 1.0, ARRAY['Oakland','Berkeley','Emeryville'], ARRAY['Near BART','Pet-friendly'], ARRAY['HOA over $500'], 'condo', true, 700000, '6 months', 'First-time buyer, works in tech. Flexible on location.'),
			('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 600000, 900000, 3, 2.0, ARRAY['Fremont','Union City','Newark'], ARRAY['Good schools','Backyard','Quiet street'], ARRAY['Busy road','No garage'], 'single_family', false, NULL, '2 months', 'Young family, expecting second child. Schools are top priority.'),
			('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 400000, 600000, 1, 1.0, ARRAY['South San Francisco','Daly City'], ARRAY['Gym in building','View'], ARRAY['Basement unit'], 'condo', true, 550000, '4 months', 'Single professional, wants investment property.'),
			('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', 1500000, 2500000, 4, 3.0, ARRAY['Atherton','Palo Alto','Menlo Park'], ARRAY['Pool','Home office','Wine cellar'], ARRAY['Near highway'], 'single_family', true, 2200000, '6 months', 'Partner at law firm. Wants luxury home for entertaining.'),
			('b0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', 900000, 1400000, 3, 2.5, ARRAY['SoMa','Mission Bay','Dogpatch'], ARRAY['Rooftop','Smart home','EV charging'], ARRAY['Street noise','No doorman'], 'condo', true, 1300000, '1 month', 'Startup founder, just had exit. Ready to buy quickly.'),
			('b0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000012', 350000, 550000, 2, 1.5, ARRAY['Hayward','San Leandro','Castro Valley'], ARRAY['Updated bathroom','Parking'], ARRAY['Flood zone'], 'townhouse', false, NULL, '8 months', 'Saving for down payment. Wants to stop renting by end of year.'),
			('b0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000017', 700000, 1000000, 3, 2.0, ARRAY['Walnut Creek','Pleasant Hill','Concord'], ARRAY['Close to hospital','Garage','Quiet neighborhood'], ARRAY['Long commute','Fixer-upper'], 'single_family', true, 950000, '3 months', 'ER nurse, needs short commute to John Muir Medical Center.'),
			('b0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000019', 450000, 650000, 2, 2.0, ARRAY['San Mateo','Foster City','Redwood City'], ARRAY['Good schools','Community pool'], ARRAY['No AC'], 'condo', true, 600000, '5 months', 'Teacher moving closer to school. Needs family-friendly area.'),
			('b0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000020', 1200000, 1800000, 4, 3.0, ARRAY['Mill Valley','Sausalito','Tiburon'], ARRAY['Architectural character','Natural light','Views'], ARRAY['Cookie-cutter','No character'], 'single_family', true, 1700000, '4 months', 'Architect wants a home with design merit.')
		ON CONFLICT DO NOTHING`),

		// Properties
		fmt.Sprintf(`INSERT INTO properties (id, agent_id, address, city, state, zip, price, bedrooms, bathrooms, sqft, property_type, status, listing_type, mls_id, description, year_built, lot_size) VALUES
			('e0000000-0000-0000-0000-000000000001', '%[1]s', '2847 Pacific Ave', 'San Francisco', 'CA', '94115', 1150000, 3, 2.0, 1650, 'condo', 'active', 'sale', 'SF-20240101', 'Stunning Pacific Heights condo with bay views. Recently renovated kitchen, hardwood floors, in-unit washer/dryer, 1-car garage.', 1925, NULL),
			('e0000000-0000-0000-0000-000000000002', '%[1]s', '1523 Oak St', 'Oakland', 'CA', '94612', 685000, 2, 1.0, 1100, 'condo', 'active', 'sale', 'OAK-20240015', 'Modern loft-style condo in Uptown Oakland. 2 blocks from 19th St BART. Open floor plan, high ceilings, pet-friendly.', 2018, NULL),
			('e0000000-0000-0000-0000-000000000003', '%[1]s', '4210 Mission Blvd', 'Fremont', 'CA', '94539', 875000, 3, 2.0, 1800, 'single_family', 'active', 'sale', 'FRE-20240022', 'Charming single-family in Mission San Jose. Top-rated schools. Large backyard with mature fruit trees.', 1978, 6500.00),
			('e0000000-0000-0000-0000-000000000004', '%[1]s', '88 King St #2105', 'San Francisco', 'CA', '94107', 1050000, 2, 2.0, 1250, 'condo', 'active', 'sale', 'SF-20240033', 'Luxurious Mission Bay condo. Floor-to-ceiling windows, chef kitchen, smart home. Pool, gym, 24hr concierge.', 2008, NULL),
			('e0000000-0000-0000-0000-000000000005', '%[1]s', '755 Lakeview Dr', 'Palo Alto', 'CA', '94306', 2350000, 4, 3.0, 2800, 'single_family', 'active', 'sale', 'PA-20240044', 'Elegant Palo Alto home. 4BR/3BA with home office, pool, and wine room. Minutes to Stanford.', 1965, 8200.00),
			('e0000000-0000-0000-0000-000000000006', '%[1]s', '320 Elm St', 'San Mateo', 'CA', '94401', 595000, 2, 2.0, 1050, 'condo', 'active', 'sale', 'SM-20240055', 'Updated San Mateo condo near downtown. Community pool, assigned parking. Close to Caltrain.', 1990, NULL),
			('e0000000-0000-0000-0000-000000000007', '%[1]s', '1645 Pine Ridge Rd', 'Mill Valley', 'CA', '94941', 1650000, 4, 3.0, 2400, 'single_family', 'active', 'sale', 'MV-20240066', 'Architectural gem. Walls of glass, vaulted ceilings, stunning Mt. Tam views. Natural light paradise.', 1972, 11000.00),
			('e0000000-0000-0000-0000-000000000008', '%[1]s', '500 Castro St #302', 'San Francisco', 'CA', '94114', 525000, 1, 1.0, 680, 'condo', 'active', 'sale', 'SF-20240077', 'Bright Castro 1BR. Updated kitchen, in-unit laundry, building gym. Walk to everything.', 2001, NULL),
			('e0000000-0000-0000-0000-000000000009', '%[1]s', '2200 Pleasant Hill Rd', 'Pleasant Hill', 'CA', '94523', 825000, 3, 2.0, 1650, 'single_family', 'active', 'sale', 'PH-20240088', 'Move-in ready. Remodeled kitchen, hardwood floors, 2-car garage. 10 min to BART.', 1985, 7000.00),
			('e0000000-0000-0000-0000-000000000010', '%[1]s', '4455 Foothill Blvd', 'Hayward', 'CA', '94542', 480000, 2, 1.5, 1200, 'townhouse', 'active', 'sale', 'HW-20240099', 'Well-maintained townhome. 2BR/1.5BA with attached garage. Community pool and playground.', 1995, 2500.00),
			('e0000000-0000-0000-0000-000000000011', '%[1]s', '120 Shoreline Dr', 'Sausalito', 'CA', '94965', 1475000, 3, 2.5, 1900, 'condo', 'pending', 'sale', 'SAU-20240110', 'Waterfront condo with Golden Gate views. Open living, chef kitchen, private deck. Boat slip available.', 2015, NULL),
			('e0000000-0000-0000-0000-000000000012', '%[1]s', '3900 Broadway', 'Oakland', 'CA', '94611', 1250000, 4, 2.5, 2200, 'single_family', 'sold', 'sale', 'OAK-20240121', 'Craftsman beauty in Rockridge. Original details, chef kitchen, landscaped garden, detached studio.', 1915, 5800.00),
			('e0000000-0000-0000-0000-000000000013', '%[1]s', '789 The Alameda', 'San Jose', 'CA', '95126', 750000, 3, 2.0, 1450, 'single_family', 'active', 'sale', 'SJ-20240132', 'Charming bungalow near The Alameda. Hardwood floors, updated systems. Detached garage could be ADU.', 1948, 5200.00),
			('e0000000-0000-0000-0000-000000000014', '%[1]s', '1800 Market St #410', 'San Francisco', 'CA', '94102', 435000, 1, 1.0, 620, 'condo', 'active', 'sale', 'SF-20240143', 'South-facing Market St studio+ with alcove bedroom. Modern building, gym, rooftop. Steps to Whole Foods.', 2016, NULL),
			('e0000000-0000-0000-0000-000000000015', '%[1]s', '55 Corte Madera Ave', 'Mill Valley', 'CA', '94941', 1800000, 3, 2.5, 2100, 'single_family', 'active', 'sale', 'MV-20240154', 'Midcentury modern masterpiece. Post-and-beam, walls of glass, cathedral ceilings. Panoramic views.', 1958, 9500.00)
		ON CONFLICT DO NOTHING`, a),

		// Deals
		fmt.Sprintf(`INSERT INTO deals (id, contact_id, agent_id, stage_id, property_id, title, value, notes, created_at) VALUES
			('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Touring'), 'e0000000-0000-0000-0000-000000000001', 'Sarah Chen — Pacific Heights Condo', 1150000, 'Very interested after second showing. Wants to bring partner for third visit.', NOW() - INTERVAL '14 days'),
			('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Contacted'), 'e0000000-0000-0000-0000-000000000002', 'Marcus Johnson — Oakland Condo', 685000, 'Sent listings, scheduled call for Thursday.', NOW() - INTERVAL '7 days'),
			('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Offer'), 'e0000000-0000-0000-0000-000000000003', 'Emily Rodriguez — Fremont Family Home', 875000, 'Submitted offer at $860K. Seller countered at $870K.', NOW() - INTERVAL '20 days'),
			('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Under Contract'), NULL, 'James Park — Sunnyvale Townhouse', 950000, 'Contingencies cleared. Closing April 15th.', NOW() - INTERVAL '30 days'),
			('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Lead'), 'e0000000-0000-0000-0000-000000000008', 'Olivia Thompson — Castro Starter', 525000, 'New lead from website. Interested in Castro area.', NOW() - INTERVAL '3 days'),
			('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Closed'), 'e0000000-0000-0000-0000-000000000012', 'David Kim — Rockridge Investment', 1250000, 'Closed successfully! Commission: $37,500.', NOW() - INTERVAL '85 days'),
			('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Touring'), 'e0000000-0000-0000-0000-000000000005', 'Jessica Williams — Palo Alto Luxury', 2350000, 'Client loves the Lakeview Dr house. Second showing Tuesday.', NOW() - INTERVAL '10 days'),
			('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Lead'), NULL, 'Robert Garcia — Home Sale', 1100000, 'Wants to sell 4BR in Noe Valley. Need listing appointment.', NOW() - INTERVAL '8 days'),
			('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Offer'), 'e0000000-0000-0000-0000-000000000004', 'Amanda Patel — Mission Bay Condo', 1050000, 'All-cash offer at asking. Multiple offer situation.', NOW() - INTERVAL '5 days'),
			('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Closed'), NULL, 'Michael Brown — Daly City Flip', 680000, 'Closed Feb 1. Investor property, bought below market.', NOW() - INTERVAL '60 days'),
			('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000015', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Under Contract'), 'e0000000-0000-0000-0000-000000000011', 'Priya Sharma — Sausalito Waterfront', 1475000, 'Under contract. Inspection passed. Appraisal next week.', NOW() - INTERVAL '18 days'),
			('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000016', '%[1]s', (SELECT id FROM deal_stages WHERE name = 'Lost'), NULL, 'Thomas Wilson — Downtown Condo', 890000, 'Lost to competing offer. May re-engage for other properties.', NOW() - INTERVAL '40 days')
		ON CONFLICT DO NOTHING`, a),

		// Activities
		fmt.Sprintf(`INSERT INTO activities (id, contact_id, deal_id, agent_id, type, body, created_at, due_date, priority, completed_at) VALUES
			('ac000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '%[1]s', 'call', 'Initial discovery call. Sarah is relocating from NYC for a PM role at Stripe. Looking for 3BR condo in Pacific Heights or Marina.', NOW() - INTERVAL '40 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '%[1]s', 'call', 'Follow-up after first showing at 2847 Pacific. Loves the unit, wants to see garage. Scheduling third visit with partner.', NOW() - INTERVAL '10 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '%[1]s', 'call', 'Intro call. Marcus found listing on Zillow. First-time buyer at Salesforce. Wants to be near BART.', NOW() - INTERVAL '6 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', '%[1]s', 'call', 'Closing coordination. James confirmed wire transfer for April 12. Title company has all docs.', NOW() - INTERVAL '3 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', '%[1]s', 'call', 'Jessica wants to revisit Lakeview Dr. Discussing pool maintenance concerns.', NOW() - INTERVAL '2 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '%[1]s', 'email', 'Sent curated list of 5 Pacific Heights condos. Highlighted 2847 Pacific Ave as top pick.', NOW() - INTERVAL '35 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', '%[1]s', 'email', 'Sent counter-offer analysis to Emily. Recommended accepting at $870K.', NOW() - INTERVAL '4 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', '%[1]s', 'email', 'Sent offer package for 88 King St. Amanda all-cash, 14-day close, no contingencies.', NOW() - INTERVAL '4 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000011', NULL, '%[1]s', 'email', 'Welcome email to Lisa. Shared market overview and asked about timeline.', NOW() - INTERVAL '9 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000011', '%[1]s', 'email', 'Sent inspection report summary to Priya. Minor items only. Recommended moving forward.', NOW() - INTERVAL '5 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', '%[1]s', 'note', 'David wants 2 more investment properties this year. Interested in Oakland/Berkeley multi-family. Follow up Q2.', NOW() - INTERVAL '80 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000008', '%[1]s', 'note', 'Robert Noe Valley home: 4BR/2.5BA, ~2100 sqft. Needs staging. Comps suggest $1.05-1.15M.', NOW() - INTERVAL '6 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', '%[1]s', 'note', 'Michael closed Daly City flip. Reno plan: kitchen $30K, baths $20K, floors $10K. Target relist: $850K.', NOW() - INTERVAL '55 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000012', '%[1]s', 'note', 'Lost downtown condo deal. Thomas outbid by $50K. Still interested in downsizing.', NOW() - INTERVAL '38 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000020', NULL, '%[1]s', 'note', 'Met Andrew at AIA mixer. Architect, wants mid-century modern in Marin. Budget $1.2-1.8M.', NOW() - INTERVAL '62 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '%[1]s', 'showing', 'Showed 2847 Pacific Ave. Sarah loved kitchen reno and bay views. Concerned about parking.', NOW() - INTERVAL '12 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', '%[1]s', 'showing', 'Showed 4210 Mission Blvd. Emily and husband loved it. School is 0.3mi away. Want to make offer.', NOW() - INTERVAL '22 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', '%[1]s', 'showing', 'Tour day with Jessica: 3 Palo Alto properties. Ranked: 1) 755 Lakeview 2) 800 Waverley 3) 345 Alma.', NOW() - INTERVAL '8 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', '%[1]s', 'showing', 'Showed 88 King St #2105. Amanda said "I want it" in 5 min. Loved smart home features. Submitting offer.', NOW() - INTERVAL '6 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000020', NULL, '%[1]s', 'showing', 'Showed Andrew 1645 Pine Ridge and 55 Corte Madera. Passionate about the mid-century. Wants second look.', NOW() - INTERVAL '15 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '%[1]s', 'task', 'Schedule third showing at 2847 Pacific for Sarah + partner', NOW() - INTERVAL '2 days', CURRENT_DATE + INTERVAL '2 days', 'high', NULL),
			('ac000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '%[1]s', 'task', 'Send Marcus updated Oakland/Berkeley listing package', NOW() - INTERVAL '1 day', CURRENT_DATE + INTERVAL '1 day', 'medium', NULL),
			('ac000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', '%[1]s', 'task', 'Follow up on counter-offer response from Emily', NOW() - INTERVAL '3 days', CURRENT_DATE, 'high', NULL),
			('ac000000-0000-0000-0000-000000000024', 'c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', '%[1]s', 'task', 'Confirm wire transfer with James lender', NOW() - INTERVAL '5 days', CURRENT_DATE - INTERVAL '1 day', 'high', NOW() - INTERVAL '1 day'),
			('ac000000-0000-0000-0000-000000000025', 'c0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000008', '%[1]s', 'task', 'Schedule listing photos for Robert Noe Valley home', NOW() - INTERVAL '4 days', CURRENT_DATE + INTERVAL '3 days', 'medium', NULL),
			('ac000000-0000-0000-0000-000000000026', 'c0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', '%[1]s', 'task', 'Check on Amanda offer status — seller response expected today', NOW() - INTERVAL '1 day', CURRENT_DATE, 'high', NULL),
			('ac000000-0000-0000-0000-000000000027', 'c0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000011', '%[1]s', 'task', 'Coordinate appraisal for Priya Sausalito unit', NOW() - INTERVAL '3 days', CURRENT_DATE + INTERVAL '4 days', 'medium', NULL),
			('ac000000-0000-0000-0000-000000000028', 'c0000000-0000-0000-0000-000000000011', NULL, '%[1]s', 'task', 'Send Lisa personalized property recommendations', NOW() - INTERVAL '2 days', CURRENT_DATE + INTERVAL '1 day', 'low', NULL),
			('ac000000-0000-0000-0000-000000000029', 'c0000000-0000-0000-0000-000000000014', NULL, '%[1]s', 'task', 'Qualify Kevin — determine budget, timeline, and preferences', NOW() - INTERVAL '4 days', CURRENT_DATE - INTERVAL '2 days', 'medium', NULL),
			('ac000000-0000-0000-0000-000000000030', NULL, NULL, '%[1]s', 'task', 'Update CRM with Q1 pipeline report for broker meeting', NOW() - INTERVAL '1 day', CURRENT_DATE + INTERVAL '5 days', 'low', NULL),
			('ac000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', '%[1]s', 'task', 'Send David closing documents for Rockridge property', NOW() - INTERVAL '82 days', NOW() - INTERVAL '80 days', 'high', NOW() - INTERVAL '81 days'),
			('ac000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', '%[1]s', 'task', 'Order home inspection for Michael Daly City property', NOW() - INTERVAL '58 days', NOW() - INTERVAL '55 days', 'high', NOW() - INTERVAL '56 days'),
			('ac000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000017', NULL, '%[1]s', 'call', 'Sophia called about Pleasant Hill listings. Needs 15 min from John Muir Hospital. 3BR/2BA, garage.', NOW() - INTERVAL '1 day', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000034', 'c0000000-0000-0000-0000-000000000018', NULL, '%[1]s', 'email', 'Brandon interested in multi-family investment. Sent 3 Oakland duplexes $900K-$1.2M.', NOW() - INTERVAL '2 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000035', 'c0000000-0000-0000-0000-000000000019', NULL, '%[1]s', 'note', 'Michelle prefers Foster City for schools (Audubon Elementary 9/10). Needs 2BR min. Budget max $650K.', NOW() - INTERVAL '8 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000036', 'c0000000-0000-0000-0000-000000000012', NULL, '%[1]s', 'call', 'Daniel checking saving progress. $45K saved, needs $55K more for 10%% down on $550K. Targeting November.', NOW() - INTERVAL '15 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000037', 'c0000000-0000-0000-0000-000000000013', NULL, '%[1]s', 'email', 'Sent Rachel CMA for Sunset District home. Estimated $1.05-1.15M. Wants to list May after kitchen refresh.', NOW() - INTERVAL '20 days', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000038', 'c0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', '%[1]s', 'showing', 'Second showing 755 Lakeview. Jessica brought interior designer. Both impressed. Ready to write offer.', NOW() - INTERVAL '1 day', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000039', 'c0000000-0000-0000-0000-000000000020', NULL, '%[1]s', 'call', 'Andrew confirmed $1.2-1.8M budget. Loves 55 Corte Madera. Wants to offer at $1.65M (below asking).', NOW() - INTERVAL '1 day', NULL, NULL, NULL),
			('ac000000-0000-0000-0000-000000000040', 'c0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', '%[1]s', 'email', 'Sent Olivia market analysis for Castro condos under $600K. Three strong options. Showing Saturday.', NOW() - INTERVAL '1 day', NULL, NULL, NULL)
		ON CONFLICT DO NOTHING`, a),

		// AI Profiles
		`INSERT INTO ai_profiles (id, contact_id, summary) VALUES
			('a0000000-0000-0000-0001-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Sarah Chen is a highly motivated buyer relocating from NYC to SF for a PM role at Stripe. Pre-approved $1.1M through Chase. Wants modern 3BR condo in Pacific Heights or Marina with parking and in-unit laundry. Decisive but values partner input. Timeline: 3 months.'),
			('a0000000-0000-0000-0001-000000000002', 'c0000000-0000-0000-0000-000000000004', 'James Park is a methodical buyer — senior engineer at Google. Researches extensively, asks detailed questions about HOA finances and resale metrics. Under contract for Sunnyvale townhouse. Prefers email with data. Likely referral source.'),
			('a0000000-0000-0000-0001-000000000003', 'c0000000-0000-0000-0000-000000000006', 'David Kim is a seasoned investor with 5+ Bay Area properties. Thinks in cap rates and cash-on-cash returns. Recently closed $1.25M Rockridge property. Prefers off-market deals, moves fast with all-cash. Maintain quarterly check-ins.'),
			('a0000000-0000-0000-0001-000000000004', 'c0000000-0000-0000-0000-000000000009', 'Amanda Patel is a recently-exited startup founder. Significant liquidity, aggressive timeline. Strong preference for new construction with smart home features. Makes fast decisions — toured and offered same day. Direct communication style.'),
			('a0000000-0000-0000-0001-000000000005', 'c0000000-0000-0000-0000-000000000020', 'Andrew Foster is an architect with specific aesthetic preferences. Values design integrity over size or luxury finishes. Interested in mid-century modern homes in Marin. Comfortable with renovation projects. Treat as peer when discussing property potential.')
		ON CONFLICT DO NOTHING`,

		// Conversations
		fmt.Sprintf(`INSERT INTO conversations (id, contact_id, agent_id, title, created_at) VALUES
			('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '%[1]s', 'Sarah Chen property search', NOW() - INTERVAL '30 days'),
			('c1000000-0000-0000-0000-000000000002', NULL, '%[1]s', 'Pipeline review', NOW() - INTERVAL '2 days')
		ON CONFLICT DO NOTHING`, a),

		// Messages
		`INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES
			('00000000-0000-0000-0001-000000000001', 'c1000000-0000-0000-0000-000000000001', 'user', 'What properties do we have that match Sarah Chen''s criteria?', NOW() - INTERVAL '30 days'),
			('00000000-0000-0000-0001-000000000002', 'c1000000-0000-0000-0000-000000000001', 'assistant', 'Based on Sarah''s buyer profile, I found a great match: **2847 Pacific Ave** in Pacific Heights. 3BR/2BA condo at $1,150,000 — right in her budget. Updated kitchen, in-unit washer/dryer, and 1-car garage. Bay views are a bonus.', NOW() - INTERVAL '30 days' + INTERVAL '1 minute'),
			('00000000-0000-0000-0001-000000000003', 'c1000000-0000-0000-0000-000000000002', 'user', 'Give me a quick summary of my pipeline — what''s hot right now?', NOW() - INTERVAL '2 days'),
			('00000000-0000-0000-0001-000000000004', 'c1000000-0000-0000-0000-000000000002', 'assistant', 'Hot right now: Amanda Patel all-cash offer on Mission Bay (awaiting response), Emily Rodriguez counter-offer at $870K, Jessica Williams ready to write offer on Palo Alto. Under contract: Priya Sharma (Sausalito, appraisal next week), James Park (closing April 15). Total pipeline: ~$10.3M across 12 deals.', NOW() - INTERVAL '2 days' + INTERVAL '1 minute')
		ON CONFLICT DO NOTHING`,

		// Workflows
		fmt.Sprintf(`INSERT INTO workflows (id, agent_id, name, description, trigger_type, trigger_config, steps, enabled, created_at) VALUES
			('00000000-0000-0000-0004-000000000001', '%[1]s', 'New Lead Welcome', 'Send welcome task when a new contact is created', 'contact_created', '{}', '[{"type":"create_task","config":{"body":"Send welcome email and intro packet","priority":"high","due_days":1}},{"type":"log_activity","config":{"type":"note","body":"Automated: New lead added. Welcome workflow initiated."}}]', true, NOW() - INTERVAL '60 days'),
			('00000000-0000-0000-0004-000000000002', '%[1]s', 'Offer Follow-Up', 'Create follow-up task when deal moves to Offer', 'deal_stage_changed', '{"to_stage":"Offer"}', '[{"type":"create_task","config":{"body":"Follow up on offer status with listing agent","priority":"high","due_days":2}},{"type":"log_activity","config":{"type":"note","body":"Automated: Deal moved to Offer stage."}}]', true, NOW() - INTERVAL '45 days'),
			('00000000-0000-0000-0004-000000000003', '%[1]s', 'Post-Showing Check-in', 'Reminder to check in after a showing', 'activity_logged', '{"activity_type":"showing"}', '[{"type":"wait","config":{"minutes":1440}},{"type":"create_task","config":{"body":"Check in with client after showing","priority":"medium","due_days":1}}]', true, NOW() - INTERVAL '30 days')
		ON CONFLICT DO NOTHING`, a),

		// Workflow runs
		fmt.Sprintf(`INSERT INTO workflow_runs (id, workflow_id, agent_id, trigger_data, status, current_step, step_results, started_at, completed_at) VALUES
			('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0004-000000000001', '%[1]s', '{"contact_name":"Kevin O''Brien"}', 'completed', 2, '[{"step":0,"status":"completed"},{"step":1,"status":"completed"}]', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
			('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0004-000000000002', '%[1]s', '{"deal_title":"Emily Rodriguez — Fremont Family Home"}', 'completed', 1, '[{"step":0,"status":"completed"},{"step":1,"status":"completed"}]', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
			('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0004-000000000003', '%[1]s', '{"contact_name":"Jessica Williams"}', 'running', 0, '[{"step":0,"status":"running"}]', NOW() - INTERVAL '1 day', NULL)
		ON CONFLICT DO NOTHING`, a),
	}
}
