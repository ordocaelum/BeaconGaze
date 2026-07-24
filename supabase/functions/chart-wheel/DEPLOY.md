# Chart Wheel Engine — Deploy & Integration

## 1 · One-time Supabase setup

```sql
-- SQL Editor:
alter table public.orders
  add column if not exists chart_wheel_pdf_url text;
```

Dashboard → **Storage → New bucket** → name `chart-wheels`, **Public** ON.
No anon policies needed — only the function (service role) writes.

## 2 · Deploy the function

```bash
npm i -g supabase
supabase login
supabase link --project-ref ekjodzzcrrgatzudbvvr
supabase secrets set FULFILLMENT_KEY=<generate-a-long-random-string>
supabase functions deploy chart-wheel
```

Endpoint: `https://ekjodzzcrrgatzudbvvr.supabase.co/functions/v1/chart-wheel`

## 3 · Make integration (Full/Premium routes, after "mark paid")

HTTP module → **Make a request**
- URL: endpoint above · Method: POST
- Headers: `x-beacon-key: <FULFILLMENT_KEY>` · `Content-Type: application/json`
- Body type: Raw / JSON:

```json
{
  "order_id": "{{2.order_ref}}",
  "name": "{{2.name}}",
  "birth_date": "{{2.birth_date}}",
  "birth_time": "{{2.birth_time}}",
  "birth_place": "{{2.birth_place}}",
  "planets": [
    {"id":"sun","name":"Sun","degree":123.45,"sign":"Leo","house":5,"speed":1},
    {"id":"moon","name":"Moon","degree":210.2,"sign":"Scorpio","house":8,"speed":13}
  ],
  "houses": [],
  "aspects": []
}
```

- `aspects` empty → the function computes them from planet degrees.
- `houses` empty → house ring omitted; ascendant falls back to planets[1].
- Response: `{"status":"success","url":"..."}` → map `{{body.url}}` into the
  email's `{{CHART_WHEEL_PDF_URL}}` button. Done.

## 4 · Where do the planet degrees come from?

The function renders whatever coordinates it is given — it does not run an
ephemeris. Three options, in order of effort:

1. **Launch-now:** the site already computes planet longitudes client-side
   for the live natal wheel. Add one line to the order-modal submit that
   copies the computed positions array into the `orders` insert (new jsonb
   column `planet_data`), and Make passes `{{2.planet_data}}` straight
   through. ~20 lines total, exact accuracy, zero new services.
2. Compute in Make with formulas — not realistic for planets. Skip.
3. External ephemeris API — only if option 1 is ever insufficient.

## 5 · Security checklist (already enforced in code)

- [x] Shared-secret header; unauthenticated calls → 401
- [x] Service role key only in function env (never repo/Make/client)
- [x] All strings HTML-escaped, control chars stripped, length-capped
- [x] All numbers validated + clamped; arrays capped (15/12/60)
- [x] Embedded JSON island `</script>`-escaped
- [x] Filename sanitized to `[a-zA-Z0-9_-]`
- [x] Generated page: `noindex`, no external requests, no cookies, no storage
