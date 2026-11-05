-- Construction and skilled-trade services (D-042).
--
-- QuickPro launched with commercial cleaning, pressure washing, landscaping
-- and facility services. This adds the construction trades that general
-- contractors hire and staff for commercial work, and the skills workers
-- list for them, so customers can request the work, contractors can list
-- the service, and businesses can post shifts for it.
--
-- Trades that need an individual license in Suffolk County (electrical,
-- plumbing, HVAC) are deliberately not added yet: QuickPro doesn't check
-- trade licenses, and listing them would suggest it does.
--
-- Reference data only: nothing is changed, dropped or deleted. Each insert
-- skips a slug that already exists, so the file is safe to re-run.

insert into public.service_categories (slug, name, description, sort_order) values
  ('general-construction', 'General construction and labor', 'Site labor, selective demolition, material handling, protection and site cleanup.', 5),
  ('carpentry', 'Carpentry', 'Rough framing, interior trim, doors and hardware, millwork and fixture installation.', 6),
  ('painting-drywall', 'Painting and drywall', 'Drywall hanging, taping and finishing, interior and exterior commercial painting.', 7),
  ('flooring', 'Flooring installation', 'Floor prep and leveling, tile, LVT, carpet tile and resilient flooring.', 8),
  ('masonry-concrete', 'Masonry and concrete', 'Concrete flatwork and finishing, curbs and sidewalks, block and brick repair.', 9)
on conflict (slug) do nothing;

insert into public.skills (category_id, slug, name, sort_order)
select c.id, s.slug, s.name, s.sort_order
from public.service_categories c
join (values
  ('general-construction', 'general-labor', 'General construction labor', 50),
  ('general-construction', 'selective-demolition', 'Selective demolition', 51),
  ('general-construction', 'material-handling', 'Material handling and staging', 52),
  ('carpentry', 'rough-framing', 'Rough framing (wood and metal stud)', 60),
  ('carpentry', 'finish-carpentry', 'Finish carpentry and trim', 61),
  ('carpentry', 'doors-hardware', 'Doors, frames and hardware', 62),
  ('painting-drywall', 'drywall-hanging', 'Drywall hanging', 70),
  ('painting-drywall', 'taping-finishing', 'Taping and finishing', 71),
  ('painting-drywall', 'commercial-painting', 'Commercial painting', 72),
  ('flooring', 'floor-prep', 'Floor prep and leveling', 80),
  ('flooring', 'tile-setting', 'Tile setting', 81),
  ('flooring', 'resilient-flooring', 'LVT, carpet tile and resilient flooring', 82),
  ('masonry-concrete', 'concrete-finishing', 'Concrete placement and finishing', 90),
  ('masonry-concrete', 'block-brick', 'Block and brick work', 91),
  ('masonry-concrete', 'formwork', 'Formwork', 92)
) as s (category_slug, slug, name, sort_order) on s.category_slug = c.slug
on conflict (slug) do nothing;
