-- ============================================================
-- RouteWatch Ottawa-Gatineau — Supabase Database Schema
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- ── 1. ISSUES TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.issues (
  id              BIGSERIAL PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('pothole','crack','flooding','signage','sidewalk','other')),
  severity        TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  city            TEXT NOT NULL CHECK (city IN ('Ottawa','Gatineau')),
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  addr            TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  votes           INTEGER NOT NULL DEFAULT 0,
  resolve_votes   INTEGER NOT NULL DEFAULT 0,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  photo_urls      TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. INDEXES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_issues_city     ON public.issues(city);
CREATE INDEX IF NOT EXISTS idx_issues_type     ON public.issues(type);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON public.issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_resolved ON public.issues(resolved);
CREATE INDEX IF NOT EXISTS idx_issues_created  ON public.issues(created_at DESC);
-- Spatial index for map bounding-box queries
CREATE INDEX IF NOT EXISTS idx_issues_latlng   ON public.issues(lat, lng);

-- ── 3. AUTO-UPDATE updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.issues;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. RPC: INCREMENT VOTES (atomic, no race conditions) ─────
CREATE OR REPLACE FUNCTION increment_votes(issue_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.issues
  SET votes = votes + 1
  WHERE id = issue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. RPC: INCREMENT RESOLVE VOTES + AUTO-RESOLVE ───────────
CREATE OR REPLACE FUNCTION increment_resolve_votes(issue_id BIGINT, threshold INTEGER DEFAULT 50)
RETURNS BOOLEAN AS $$
DECLARE
  new_count INTEGER;
  did_resolve BOOLEAN := FALSE;
BEGIN
  UPDATE public.issues
  SET resolve_votes = resolve_votes + 1
  WHERE id = issue_id AND resolved = FALSE
  RETURNING resolve_votes INTO new_count;

  -- Auto-resolve when threshold reached
  IF new_count IS NOT NULL AND new_count >= threshold THEN
    UPDATE public.issues
    SET resolved = TRUE, resolved_at = NOW()
    WHERE id = issue_id;
    did_resolve := TRUE;
  END IF;

  RETURN did_resolve;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. ROW LEVEL SECURITY ────────────────────────────────────
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

-- Anyone can read issues (public map)
CREATE POLICY "Public read access"
  ON public.issues FOR SELECT
  USING (TRUE);

-- Anyone can insert new issues (anonymous reporting)
CREATE POLICY "Public insert access"
  ON public.issues FOR INSERT
  WITH CHECK (TRUE);

-- Only service role can update/delete (votes go through RPC)
CREATE POLICY "Service role update"
  ON public.issues FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role delete"
  ON public.issues FOR DELETE
  USING (auth.role() = 'service_role');

-- ── 7. REALTIME ───────────────────────────────────────────────
-- Enable realtime for live map updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.issues;

-- ── 8. STATS VIEW ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.issue_stats AS
SELECT
  COUNT(*) FILTER (WHERE NOT resolved)                    AS total_open,
  COUNT(*) FILTER (WHERE resolved)                        AS total_resolved,
  COUNT(*) FILTER (WHERE severity = 'critical' AND NOT resolved) AS critical_open,
  SUM(votes)                                              AS total_votes,
  COUNT(*) FILTER (WHERE city = 'Ottawa')                 AS ottawa_count,
  COUNT(*) FILTER (WHERE city = 'Gatineau')               AS gatineau_count,
  COUNT(*) FILTER (WHERE type = 'pothole')                AS pothole_count,
  COUNT(*) FILTER (WHERE type = 'crack')                  AS crack_count,
  COUNT(*) FILTER (WHERE type = 'flooding')               AS flooding_count,
  COUNT(*) FILTER (WHERE type = 'signage')                AS signage_count,
  COUNT(*) FILTER (WHERE type = 'sidewalk')               AS sidewalk_count,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last_7_days,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30_days
FROM public.issues;

GRANT SELECT ON public.issue_stats TO anon, authenticated;

-- ── 9. WEEKLY 311 EXPORT FUNCTION ────────────────────────────
-- Call this with a scheduled Supabase Edge Function (see guide)
CREATE OR REPLACE FUNCTION get_weekly_311_report()
RETURNS TABLE(
  id BIGINT, type TEXT, severity TEXT, city TEXT,
  addr TEXT, description TEXT, votes INTEGER,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id, i.type, i.severity, i.city,
    i.addr, i.description, i.votes,
    i.lat, i.lng, i.created_at
  FROM public.issues i
  WHERE
    i.created_at >= NOW() - INTERVAL '7 days'
    AND i.resolved = FALSE
  ORDER BY
    CASE i.severity
      WHEN 'critical' THEN 1
      WHEN 'high'     THEN 2
      WHEN 'medium'   THEN 3
      WHEN 'low'      THEN 4
    END,
    i.votes DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_weekly_311_report() TO anon, authenticated;

-- ── 10. SAMPLE TEST (remove after verifying) ─────────────────
-- INSERT INTO public.issues (type, severity, city, lat, lng, addr, description)
-- VALUES ('pothole', 'high', 'Ottawa', 45.4215, -75.6972, 'Bank St & Slater St', 'Test entry');
-- SELECT * FROM public.issues;
-- DELETE FROM public.issues WHERE addr = 'Bank St & Slater St';
