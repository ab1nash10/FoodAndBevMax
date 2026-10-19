-- An item's category and type are now set on the Item Mapping screens (a store makes it MRP,
-- a kitchen READYMADE), so a new item has neither until it is first mapped. Existing items keep
-- theirs.
ALTER TABLE "items" ALTER COLUMN "category_id" DROP NOT NULL;
ALTER TABLE "items" ALTER COLUMN "item_type" DROP NOT NULL;
