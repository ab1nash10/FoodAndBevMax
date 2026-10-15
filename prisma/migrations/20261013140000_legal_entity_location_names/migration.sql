-- Entities name the site they bill for, and the entity list is loaded. One company can bill for
-- several sites under one GST number, so rows are told apart by their location name and address.

-- AlterTable
ALTER TABLE "legal_entities" ADD COLUMN     "location_name" TEXT;

-- The entity list (Location, Entity Name, Entity Address, GST no.), as supplied. A row already
-- present with the same GST number and address is not added again.
INSERT INTO "legal_entities" ("id", "location_name", "entity_name", "entity_address", "gst_number", "updated_at")
SELECT gen_random_uuid(), v.location_name, v.entity_name, v.entity_address, v.gst_number, now()
FROM (VALUES
  ('DDF Saket', 'Devki Devi Foundation', '(DDF) 2, Press Enclave Road Saket, New Delhi, 110017', '07AAATD5283G1ZR'),
  ('MSSH SKT', 'MAX HEALTHCARE INSTITUTE LIMITED', '(MSSH) 1, Press Encalve Road, Saket, New Delhi- 110 017', '07AADCM0815B1Z4'),
  ('SMART', 'MAX SMART SUPER SPECIALITY HOSPITAL', 'Mandir Marg, Press Enclave Road, Saket, Delhi-110017.', '07AAATG2183J2ZN'),
  ('Gurgaon', 'Alps Hospital Limited', 'B Block Sushant Lok,Opposite Huda City Centre,Sushant Lok Phase 1,Gurugram,Haryana-122002', '06AAGCR9198D1Z0'),
  ('IMM PPN', 'MAX HEALTHCARE INSTITUTE LIMITED', '1st Floor 26A, Ring road, Lajpat Nagar, South Delhi, Delhi, 110024', '07AADCM0815B1Z4'),
  ('Panchsheel', 'MAX HEALTHCARE INSTITUTE LIMITED', 'N 110, Panchsheel Park, New Delhi- 110017.', '07AADCM0815B1Z4'),
  ('Patparganj', 'Balaji Medical and Diagnostic Research centre', '108 A, Indraprastha Extension, Patparganj, New Delhi -110092.', '07AAABB0018M1Z2'),
  ('Vaishali', 'Crosslay Remedies Limited', 'W-3, Sector-1 , Vaishali, Ghaziabad (U.P.)- 201012', '09AACCJ9811D1ZM'),
  ('NOIDA', 'Crosslay Remedies Limited', 'A- 364, Sector 19 Noida- 201 301.', '09AACCJ9811D1ZM'),
  ('SHALIMAR BAGH', 'MAX HEALTHCARE INSTITUTE LIMITED', 'FC - 50 , C & D Block, Shalimar Bagh, New Delhi- 110088.', '07AADCM0815B1Z4'),
  ('MOHALI', 'Hometrail Buildtech Pvt. LTD.', 'Near Civil Hospital, Phase - 6, Mohali, Punjab - 160 055.', '03AACCH1518B1ZG'),
  ('Dehradun', 'MAX HEALTHCARE INSTITUTE LIMITED', 'Khasra No 165, Mussoorie Diversion Road, Near Petrol Pump,Dehradhun - 248001', '05AADCM0815B1Z8'),
  ('Bhatinda', 'Hometrail Buildtech Pvt. LTD.', 'NH-64, Near District Civil Hospital, Mansa Road, Bhatinda, Punjab- 151001.', '03AACCH1518B1ZG'),
  ('Home Office', 'MAX HEALTHCARE INSTITUTE LIMITED', '2nd Floor,Capital cyberscape, sector-59 , golf course extension road, Gurugram, 122102.', '06AADCM0815B1Z6'),
  ('BLK', 'DR. B. L. KAPUR MEMORIAL HOSPITAL (A Unit of Lahore Hospital Society)', '5, Pusa Road, New Delhi, Delhi, 110005', '07AAATL0242R2ZE'),
  ('Nanavati', 'Dr. Balabhai Nanavati Hospital', 'S.V. Road, Vile Parle (W), Mumbai - 400056', '27AAATD0094K1ZP'),
  ('DWARKA', 'MUTHOOT HOSPITALS PRIVATE LIMITED', 'Plot no. 1 ,Sector-10 ,Dwarka,New Delhi-110075', '07AAECM0477C1ZR'),
  ('ALEXIS', 'Alexis Multispeciality Hospital Pvt. Ltd', 'Survey No. 232, House No. 1313, Mankapur Square, Koradi Road, Nagpur - 440 030, Maharashtra', '27AAHCA1186B1Z0'),
  ('Lucknow', 'STARLIT MEDICAL CENTRE PRIVATE LIMITED', 'Viraj Khand-1, Police Chowki Max Hospital,GOMTI NAGAR LUCKNOW-226010', '09ABLCS5721R1ZG'),
  ('Jaypee', 'Crosslay Remedies Limited', 'Sector 128 Noida Gautam Buddh Nagar - 201304', '09AACCJ9811D1ZM')
) AS v(location_name, entity_name, entity_address, gst_number)
WHERE NOT EXISTS (
  SELECT 1 FROM "legal_entities" e
  WHERE e."deleted_at" IS NULL
    AND e."gst_number" = v.gst_number
    AND lower(e."entity_address") = lower(v.entity_address)
);
