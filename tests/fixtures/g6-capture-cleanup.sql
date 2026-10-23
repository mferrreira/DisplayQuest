-- plan-v8 V8-8 (G6): desfaz g6-capture-seed.sql na base de teste (5433).
-- Rodar logo depois da captura, antes de qualquer roundtrip G4: as capturas usam dado de vida curta
-- e o estado que sobra não é o estado que o plano espera.

begin;

delete from month_history where "month" in ('2026-08', '2026-09');
delete from season_history where "year" = 2025;

delete from user_badges ub
  using badges b
 where ub."badgeId" = b.id and b.name = 'CAMPEÃO';

update user_badges set equipped = false;

update users
   set "xp" = 0, "coins" = 0, "elo" = 'BRONZE',
       "course" = null,
       "registrationNumber" = null,
       "scholarshipType" = null,
       "fundingAgency" = null,
       "fundingAgencyOther" = null,
       "level" = null
 where "email" in (
   'coordenador@lab.com', 'gerente@lab.com', 'gerente_projeto@lab.com',
   'laboratorista@lab.com', 'pesquisador@lab.com', 'colaborador@lab.com',
   'joana.voluntaria@lab.com', 'juninho.voluntario@lab.com', 'pendente@lab.com'
 );

commit;
