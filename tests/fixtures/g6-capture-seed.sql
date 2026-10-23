-- plan-v8 V8-8 (G6): dado de vida curta para as capturas do guia.
--
-- O seed de desenvolvimento escreve o placar herdado (`points`) e nada mais: sem XP da temporada,
-- sem moeda, sem snapshot de mês, sem livro-caixa e sem troféu equipado. Fotografar esse estado
-- produziria a tela errada da tela certa — o guia sairia descrevendo colunas e blocos que nenhuma
-- foto mostra. É o mesmo desenho do dado semeado por SQL para as capturas do plan-v5.
--
-- Rodar SÓ na base de teste (5433), antes da captura, e desfazer com g6-capture-cleanup.sql.
-- As 5432 do dono não recebem este arquivo.

begin;

-- Trilhas vivas: XP da temporada (é dele que derivam elo e slots), moeda vitalícia da loja.
update users set "xp" = 1600, "coins" = 640 where "email" = 'coordenador@lab.com';
update users set "xp" = 520,  "coins" = 300 where "email" = 'gerente@lab.com';
update users set "xp" = 120,  "coins" = 90  where "email" = 'gerente_projeto@lab.com';
update users set "xp" = 900,  "coins" = 40  where "email" = 'laboratorista@lab.com';
update users set "xp" = 400,  "coins" = 130 where "email" = 'pesquisador@lab.com';
update users set "xp" = 0,    "coins" = 0   where "email" = 'colaborador@lab.com';

-- A conta de captura do participante: OURO (dois slots de troféu), moeda para a loja e os campos
-- de pessoa que fazem o bloco "Dados para os documentos" existir no cartão lido de fora.
update users
   set "xp" = 950, "coins" = 260,
       "course" = 'Sistemas de Informação',
       "registrationNumber" = '2024101500',
       "scholarshipType" = 'PIBIC',
       "fundingAgency" = 'CNPQ',
       "level" = 'GRADUACAO'
 where "email" = 'joana.voluntaria@lab.com';

-- O elo da coluna acompanha o XP pela escada do domínio (0 / 400 / 900 / 1500 / 2400 / 3600). A tela
-- lê o XP; a coluna é o que o motor de credit escreve. Coerentes, as duas descrevem o mesmo estado.
update users set "elo" = 'PLATINA' where "email" = 'coordenador@lab.com';
update users set "elo" = 'PRATA'   where "email" = 'gerente@lab.com';
update users set "elo" = 'PRATA'   where "email" = 'pesquisador@lab.com';
update users set "elo" = 'OURO'    where "email" = 'laboratorista@lab.com';
update users set "elo" = 'OURO'    where "email" = 'joana.voluntaria@lab.com';

-- Prateleira: um equipado e outro na prateleira (o par que a tela mostra) e o troféu da temporada
-- na prateleira de quem fechou o ano em primeiro, para o card de campeão aparecer na foto.
update user_badges ub
   set equipped = true
  from badges b
 where ub."badgeId" = b.id
   and b.name = 'Primeiras Tasks'
   and ub."userId" = (select id from users where "email" = 'joana.voluntaria@lab.com');

insert into user_badges ("userId", "badgeId", equipped, "earnedAt", "earnedBy")
select u.id, b.id, false, now() - interval '20 days', c.id
  from users u
  join badges b on b.name = 'CAMPEÃO'
  join users c on c."email" = 'coordenador@lab.com'
 where u."email" = 'joana.voluntaria@lab.com'
   and not exists (
     select 1 from user_badges x where x."userId" = u.id and x."badgeId" = b.id
   );

-- Ciclos fechados: o snapshot do mês (antes de zerar) e o livro-caixa do ano.
insert into month_history ("userId", "month", points, "completedTasks")
select u.id, m.month, m.points, m.tasks
  from users u
  join (values
    ('joana.voluntaria@lab.com', '2026-08', 120, 9),
    ('joana.voluntaria@lab.com', '2026-09',  90, 7),
    ('coordenador@lab.com',      '2026-08', 480, 21),
    ('gerente@lab.com',          '2026-08', 300, 14)
  ) as m(email, month, points, tasks) on m.email = u."email"
on conflict ("userId", "month") do nothing;

-- `position` 1 é o que reconhece a campeã (DEC-213), não o nome na tela.
insert into season_history ("userId", "year", points, "completedTasks", xp, elo, position)
select u.id, s.year, s.points, s.tasks, s.xp, s.elo, s.position
  from users u
  join (values
    ('joana.voluntaria@lab.com', 2025,  430, 24,  900, 'OURO',    1),
    ('coordenador@lab.com',      2025, 1800, 42, 1400, 'PLATINA', 2),
    ('gerente@lab.com',          2025, 1600, 34, 1200, 'PLATINA', 3)
  ) as s(email, year, points, tasks, xp, elo, position) on s.email = u."email"
on conflict ("userId", "year") do nothing;

commit;
