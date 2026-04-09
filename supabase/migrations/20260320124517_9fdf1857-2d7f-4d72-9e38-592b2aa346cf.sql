
-- Table 1: inventory
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  sku text,
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  supplier text,
  created_at timestamptz DEFAULT now()
);

-- Table 2: orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  product_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  selling_price numeric NOT NULL DEFAULT 0,
  shipping_cost numeric NOT NULL DEFAULT 0,
  source text CHECK (source IN ('Instagram','Facebook','WhatsApp','Website','TikTok')),
  status text CHECK (status IN ('Pending','Processing','Shipped','Delivered','Cancelled')) DEFAULT 'Pending',
  date date NOT NULL DEFAULT current_date,
  profit_per_order numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table 3: expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text CHECK (type IN ('Ad Spend','Shipping','Miscellaneous')) NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  platform text,
  notes text,
  date date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

-- Table 4: notes
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  transcript text,
  type text CHECK (type IN ('manual','voice','ai_output')) DEFAULT 'manual',
  source_module text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table 5: marketing_outputs
CREATE TABLE public.marketing_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  platform text CHECK (platform IN ('Facebook','Instagram','TikTok')) NOT NULL,
  product_features text,
  target_audience text,
  hook text,
  value_proposition text,
  cta text,
  caption text,
  script text,
  hashtags text,
  created_at timestamptz DEFAULT now()
);

-- Table 6: notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Table 7: user_settings
CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dark_mode boolean DEFAULT false,
  font_style text DEFAULT 'inter',
  dashboard_filter text DEFAULT '7days',
  roas_threshold numeric DEFAULT 2.0,
  dead_product_days integer DEFAULT 30,
  notification_preferences jsonb DEFAULT '{"new_order":true,"cancelled_order":true,"low_stock":true,"critical_stock":true,"profit_drop":true,"roas_alert":true,"weekly_summary":true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables (no policies yet since no auth)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Allow anon/authenticated full access for now (no auth yet)
CREATE POLICY "Allow all on inventory" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on notes" ON public.notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on marketing_outputs" ON public.marketing_outputs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_settings" ON public.user_settings FOR ALL USING (true) WITH CHECK (true);

-- Trigger 1: Auto decrement stock on order insert
CREATE OR REPLACE FUNCTION public.fn_decrement_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.inventory
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_stock
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_decrement_stock();

-- Trigger 2: Auto restore stock on order cancelled
CREATE OR REPLACE FUNCTION public.fn_restore_stock_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'Cancelled' AND OLD.status != 'Cancelled' THEN
    UPDATE public.inventory
    SET stock_quantity = stock_quantity + NEW.quantity
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restore_stock_on_cancel
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_restore_stock_on_cancel();

-- Trigger 3: Auto calculate profit_per_order on insert
CREATE OR REPLACE FUNCTION public.fn_calculate_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cost numeric;
BEGIN
  SELECT cost_price INTO v_cost FROM public.inventory WHERE id = NEW.product_id;
  UPDATE public.orders
  SET profit_per_order = (NEW.selling_price * NEW.quantity) - (COALESCE(v_cost, 0) * NEW.quantity) - NEW.shipping_cost
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calculate_profit
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_calculate_profit();

-- Trigger 4: Auto notification on new order
CREATE OR REPLACE FUNCTION public.fn_notify_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (type, title, message)
  VALUES (
    'new_order',
    'New Order Received',
    'Order ' || NEW.order_number || ' from ' || COALESCE(NEW.source, 'unknown') || ' — ৳' || NEW.selling_price
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_new_order();

-- Trigger 5: Auto notification on low/critical stock
CREATE OR REPLACE FUNCTION public.fn_notify_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.stock_quantity = 0 THEN
    INSERT INTO public.notifications (type, title, message)
    VALUES ('critical_stock', 'Critical Stock!', NEW.product_name || ' is out of stock — 0 units remaining');
  ELSIF NEW.stock_quantity < NEW.low_stock_threshold AND NEW.stock_quantity > 0 THEN
    INSERT INTO public.notifications (type, title, message)
    VALUES ('low_stock', 'Low Stock Alert', NEW.product_name || ' is running low — ' || NEW.stock_quantity || ' units remaining');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_low_stock
AFTER UPDATE OF stock_quantity ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_low_stock();
