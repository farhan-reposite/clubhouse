-- ============================================================
-- Clubhouse Desktop → Supabase Migration
-- Run this ENTIRE script in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. CREATE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS racket (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  racket_name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  image TEXT DEFAULT '',
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

CREATE TABLE IF NOT EXISTS fnb_stock (
  id SERIAL PRIMARY KEY,
  fnb_name TEXT NOT NULL,
  fnb_desc TEXT DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  categ INTEGER NOT NULL DEFAULT 1,
  fnb_image TEXT DEFAULT '',
  safety_stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  member_name TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta'),
  edited_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE IF NOT EXISTS fnb_stock_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES fnb_stock(id) ON DELETE CASCADE,
  prev_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  diff INTEGER NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'system',
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

CREATE TABLE IF NOT EXISTS fnb_log (
  id SERIAL PRIMARY KEY,
  id_member INTEGER REFERENCES members(id) ON DELETE SET NULL,
  guest_name TEXT DEFAULT '',
  total_price INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

CREATE TABLE IF NOT EXISTS fnb_log_items (
  id SERIAL PRIMARY KEY,
  log_id INTEGER NOT NULL REFERENCES fnb_log(id) ON DELETE CASCADE,
  fnb_id INTEGER NOT NULL,
  fnb_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rent_log (
  id SERIAL PRIMARY KEY,
  id_member INTEGER REFERENCES members(id) ON DELETE SET NULL,
  id_racket INTEGER NOT NULL REFERENCES racket(id),
  guest_name TEXT DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  start TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  duration INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

-- 2. ROW LEVEL SECURITY (allow all for now — add auth later)
-- ============================================================

ALTER TABLE racket ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_stock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_log_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON racket FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON fnb_stock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON fnb_stock_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON fnb_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON fnb_log_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON rent_log FOR ALL USING (true) WITH CHECK (true);

-- 3. RPC FUNCTIONS (for complex queries)
-- ============================================================

-- Dashboard: F&B revenue by day
CREATE OR REPLACE FUNCTION get_fnb_revenue(date_from date, date_to date)
RETURNS TABLE(day date, revenue bigint, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT created_at::date AS day,
         SUM(total_price)::bigint AS revenue,
         COUNT(*)::bigint AS count
  FROM fnb_log
  WHERE created_at::date BETWEEN date_from AND date_to
  GROUP BY day ORDER BY day ASC;
$$;

-- Dashboard: Racket revenue by day
CREATE OR REPLACE FUNCTION get_racket_revenue(date_from date, date_to date)
RETURNS TABLE(day date, revenue bigint, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT created_at::date AS day,
         SUM(total_price)::bigint AS revenue,
         COUNT(*)::bigint AS count
  FROM rent_log
  WHERE created_at::date BETWEEN date_from AND date_to
  GROUP BY day ORDER BY day ASC;
$$;

-- Dashboard: Stock adjustments by day
CREATE OR REPLACE FUNCTION get_stock_adjustments(date_from date, date_to date, p_product_id integer DEFAULT NULL)
RETURNS TABLE(day date, added bigint, reduced bigint)
LANGUAGE sql STABLE AS $$
  SELECT created_at::date AS day,
         SUM(CASE WHEN diff > 0 THEN diff ELSE 0 END)::bigint AS added,
         SUM(CASE WHEN diff < 0 THEN ABS(diff) ELSE 0 END)::bigint AS reduced
  FROM fnb_stock_history
  WHERE created_at::date BETWEEN date_from AND date_to
    AND (p_product_id IS NULL OR product_id = p_product_id)
  GROUP BY day ORDER BY day;
$$;

-- Racket: Stats (available vs rented now)
CREATE OR REPLACE FUNCTION get_racket_stats()
RETURNS TABLE(available bigint, rented bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    SUM(CASE WHEN busy = 0 THEN 1 ELSE 0 END)::bigint AS available,
    SUM(CASE WHEN busy = 1 THEN 1 ELSE 0 END)::bigint AS rented
  FROM (
    SELECT r.id,
      CASE WHEN EXISTS (
        SELECT 1 FROM rent_log rl
        WHERE rl.id_racket = r.id AND rl.status = 0
          AND rl.start - interval '1 hour' < (now() AT TIME ZONE 'Asia/Jakarta') + interval '1 hour'
          AND rl.start + rl.duration * interval '1 hour' > (now() AT TIME ZONE 'Asia/Jakarta')
      ) THEN 1 ELSE 0 END AS busy
    FROM racket r WHERE r.status <> 2
  ) sub;
$$;

-- Racket: Full list with busy status and countdown end time
CREATE OR REPLACE FUNCTION get_racket_list()
RETURNS TABLE(
  id integer, name text, racket_name text, use_count integer, status integer,
  price integer, image text, busy integer, current_end_str timestamp
)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.name, r.racket_name, r.use_count, r.status, r.price,
    COALESCE(r.image, '')::text AS image,
    (CASE WHEN EXISTS (
      SELECT 1 FROM rent_log rl
      WHERE rl.id_racket = r.id AND rl.status = 0
        AND rl.start - interval '1 hour' < (now() AT TIME ZONE 'Asia/Jakarta') + interval '1 hour'
        AND rl.start + rl.duration * interval '1 hour' > (now() AT TIME ZONE 'Asia/Jakarta')
    ) THEN 1 ELSE 0 END)::integer AS busy,
    (SELECT rl2.start + rl2.duration * interval '1 hour'
     FROM rent_log rl2
     WHERE rl2.id_racket = r.id AND rl2.status = 0
       AND (now() AT TIME ZONE 'Asia/Jakarta') >= rl2.start - interval '1 hour'
       AND (now() AT TIME ZONE 'Asia/Jakarta') < rl2.start + rl2.duration * interval '1 hour'
     ORDER BY rl2.start ASC LIMIT 1)::timestamp AS current_end_str
  FROM racket r ORDER BY r.name ASC;
$$;

-- Racket: Rent history for a specific date
CREATE OR REPLACE FUNCTION get_rent_history(p_date date)
RETURNS TABLE(
  id integer, guest_name text, start timestamp, duration integer,
  unit_price integer, total_price integer, status integer, id_racket integer,
  id_member integer, racket_name text, racket_model text, member_name text
)
LANGUAGE sql STABLE AS $$
  SELECT rl.id, rl.guest_name, rl.start, rl.duration, rl.unit_price, rl.total_price,
    rl.status, rl.id_racket, rl.id_member,
    r.name AS racket_name, r.racket_name AS racket_model,
    COALESCE(m.member_name, '')::text AS member_name
  FROM rent_log rl
  JOIN racket r ON r.id = rl.id_racket
  LEFT JOIN members m ON m.id = rl.id_member
  WHERE rl.start::date = p_date
  ORDER BY rl.start ASC;
$$;

-- Racket: Available rackets for a time slot
CREATE OR REPLACE FUNCTION get_available_rackets(p_start timestamp, p_end timestamp, p_exclude_id integer DEFAULT 0)
RETURNS TABLE(id integer, name text, racket_name text, price integer, image text)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.name, r.racket_name, r.price, COALESCE(r.image, '')::text AS image
  FROM racket r
  WHERE r.status <> 2
    AND NOT EXISTS (
      SELECT 1 FROM rent_log rl
      WHERE rl.id_racket = r.id AND rl.status = 0
        AND (p_exclude_id = 0 OR rl.id <> p_exclude_id)
        AND rl.start < p_end
        AND rl.start + rl.duration * interval '1 hour' > p_start
    )
  ORDER BY r.name ASC;
$$;

-- Racket: Check booking overlap
CREATE OR REPLACE FUNCTION check_rent_overlap(p_racket_id integer, p_start timestamp, p_end timestamp, p_exclude_id integer DEFAULT 0)
RETURNS TABLE(id integer)
LANGUAGE sql STABLE AS $$
  SELECT rent_log.id FROM rent_log
  WHERE id_racket = p_racket_id AND status = 0
    AND (p_exclude_id = 0 OR rent_log.id <> p_exclude_id)
    AND start < p_end
    AND start + duration * interval '1 hour' > p_start;
$$;

-- FnB POS: Recent sales with member name
CREATE OR REPLACE FUNCTION get_recent_sales()
RETURNS TABLE(
  id integer, total_price integer, created_at timestamp, guest_name text, member_name text
)
LANGUAGE sql STABLE AS $$
  SELECT fl.id, fl.total_price, fl.created_at, fl.guest_name, m.member_name
  FROM fnb_log fl LEFT JOIN members m ON m.id = fl.id_member
  ORDER BY fl.created_at DESC LIMIT 8;
$$;

-- Transactions: F&B
CREATE OR REPLACE FUNCTION get_fnb_transactions(date_from date, date_to date)
RETURNS TABLE(
  id integer, id_member integer, guest_name text, total_price integer,
  created_at timestamp, member_name text
)
LANGUAGE sql STABLE AS $$
  SELECT fl.id, fl.id_member, fl.guest_name, fl.total_price, fl.created_at,
    m.member_name
  FROM fnb_log fl
  LEFT JOIN members m ON m.id = fl.id_member
  WHERE fl.created_at::date BETWEEN date_from AND date_to
  ORDER BY fl.created_at DESC;
$$;

-- Transactions: Racket Rentals
CREATE OR REPLACE FUNCTION get_rental_transactions(date_from date, date_to date)
RETURNS TABLE(
  id integer, id_member integer, guest_name text, total_price integer, status integer,
  start timestamp, duration integer, unit_price integer, created_at timestamp,
  racket_name text, racket_model text, member_name text
)
LANGUAGE sql STABLE AS $$
  SELECT rl.id, rl.id_member, rl.guest_name, rl.total_price, rl.status,
    rl.start, rl.duration, rl.unit_price, rl.created_at,
    r.name AS racket_name, r.racket_name AS racket_model,
    m.member_name
  FROM rent_log rl
  JOIN racket r ON r.id = rl.id_racket
  LEFT JOIN members m ON m.id = rl.id_member
  WHERE rl.created_at::date BETWEEN date_from AND date_to
  ORDER BY rl.created_at DESC;
$$;

-- 4. USER ROLES (for multi-level auth)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT ''
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON user_roles FOR ALL USING (true) WITH CHECK (true);

-- RPC: look up email by role (called before login, no auth needed)
CREATE OR REPLACE FUNCTION get_email_by_role(p_role text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT email FROM user_roles WHERE role = p_role LIMIT 1;
$$;

-- ============================================================
-- MIGRATIONS (run these if you already have the tables above)
-- ============================================================

-- Add image column to members (safe to run multiple times)
ALTER TABLE members ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';

-- Add user_roles table (safe to run multiple times)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT ''
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON user_roles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION get_email_by_role(p_role text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT email FROM user_roles WHERE role = p_role LIMIT 1;
$$;
