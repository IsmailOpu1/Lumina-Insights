-- Input limits enforced by the database itself, so data sent straight to the
-- API (skipping the app's forms) can't store huge text or nonsense numbers.
-- The limits sit well above anything the app or the importer writes (the
-- importer already trims names to 200 characters, SKUs to 100, notes to 500)
-- and match the forms: quantities of at least 1, money never negative.
-- Stock counts are left alone: they can legitimately dip during sales.

alter table public.orders
  add constraint orders_order_number_len check (char_length(order_number) <= 50),
  add constraint orders_customer_name_len check (char_length(customer_name) <= 500),
  add constraint orders_product_name_len check (product_name is null or char_length(product_name) <= 500),
  add constraint orders_external_ref_len check (external_ref is null or char_length(external_ref) <= 200),
  add constraint orders_quantity_positive check (quantity >= 1),
  add constraint orders_money_not_negative check (
    selling_price >= 0 and shipping_cost >= 0 and ad_cost >= 0 and coalesce(unit_cost, 0) >= 0);

alter table public.inventory
  add constraint inventory_product_name_len check (char_length(product_name) <= 500),
  add constraint inventory_sku_len check (sku is null or char_length(sku) <= 200),
  add constraint inventory_supplier_len check (supplier is null or char_length(supplier) <= 500),
  add constraint inventory_money_not_negative check (cost_price >= 0 and selling_price >= 0),
  add constraint inventory_threshold_not_negative check (low_stock_threshold is null or low_stock_threshold >= 0);

alter table public.expenses
  add constraint expenses_amount_not_negative check (amount >= 0),
  add constraint expenses_platform_len check (platform is null or char_length(platform) <= 200),
  add constraint expenses_notes_len check (notes is null or char_length(notes) <= 5000);

alter table public.notes
  add constraint notes_title_len check (title is null or char_length(title) <= 500),
  add constraint notes_transcript_len check (transcript is null or char_length(transcript) <= 50000),
  add constraint notes_source_module_len check (source_module is null or char_length(source_module) <= 100);

alter table public.marketing_outputs
  add constraint marketing_outputs_text_len check (
    char_length(coalesce(product_name, '')) <= 500
    and char_length(coalesce(product_features, '')) <= 5000
    and char_length(coalesce(target_audience, '')) <= 2000
    and char_length(coalesce(hook, '')) <= 5000
    and char_length(coalesce(value_proposition, '')) <= 5000
    and char_length(coalesce(cta, '')) <= 2000
    and char_length(coalesce(caption, '')) <= 10000
    and char_length(coalesce(script, '')) <= 20000
    and char_length(coalesce(hashtags, '')) <= 2000);

alter table public.user_settings
  add constraint user_settings_text_len check (
    char_length(coalesce(business_name, '')) <= 200
    and char_length(coalesce(business_type, '')) <= 200
    and char_length(coalesce(business_description, '')) <= 5000
    and char_length(coalesce(full_name, '')) <= 200
    and char_length(coalesce(user_full_name, '')) <= 200
    and char_length(coalesce(avatar_url, '')) <= 2000),
  add constraint user_settings_roas_not_negative check (roas_threshold is null or roas_threshold >= 0);
