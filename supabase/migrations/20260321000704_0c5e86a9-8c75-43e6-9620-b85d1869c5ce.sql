ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ad_cost numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fn_calculate_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
BEGIN
  SELECT cost_price INTO v_cost FROM public.inventory WHERE id = NEW.product_id;
  UPDATE public.orders
  SET profit_per_order = (NEW.selling_price * NEW.quantity) - (COALESCE(v_cost, 0) * NEW.quantity) - NEW.shipping_cost - NEW.ad_cost
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;