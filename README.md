# Kitty — finanças a dois

Uma app para registar despesas e receitas a dois, com budgets, contas entre vocês, poupanças, desejos, refeições e aniversários. Funciona no telemóvel como uma app normal.

**A vossa cópia é só vossa.** Fica em contas criadas por vocês (gratuitas). Os vossos dados ficam na vossa base de dados: mais ninguém lhes tem acesso, nem quem fez a app.

## Antes de começar

- **Tempo:** cerca de 20 minutos, uma vez só.
- **Precisam de:** um computador (é mais fácil do que no telemóvel) e um email.
- **Custo:** zero. Tudo usa planos gratuitos, sem cartão de crédito.

Vão criar três contas gratuitas. Usem o mesmo email nas três, para ser fácil:

| Conta | Para quê |
|---|---|
| **GitHub** | guarda a vossa cópia da app |
| **Supabase** | guarda os vossos dados |
| **Vercel** | põe a app online, com um endereço vosso |

---

## Passo 1 — A vossa cópia da app (GitHub, 3 min)

1. Criem conta em [github.com](https://github.com/signup).
2. Abram a página da app (o link que vos deram) e carreguem em **Fork** (canto superior direito).
3. Na página seguinte carreguem em **Create fork**. Pronto: têm uma cópia vossa.

## Passo 2 — A vossa base de dados (Supabase, 8 min)

1. Criem conta em [supabase.com](https://supabase.com/dashboard/sign-up) (podem entrar com a conta GitHub).
2. Carreguem em **New project**:
   - **Name:** `kitty`
   - **Database password:** carreguem em *Generate a password* e guardem-na num sítio seguro (não vão precisar dela no dia a dia).
   - **Region:** escolham a mais perto (ex.: *West EU*).
   - Carreguem em **Create new project** e esperem 1–2 minutos.
3. **Preparar a base de dados:**
   - Na vossa cópia no GitHub, abram a pasta `supabase` e o ficheiro **`setup.sql`**. Carreguem no botão **Copy raw file** (ícone de dois quadrados, à direita).
   - No Supabase, no menu da esquerda, abram **SQL Editor**, colem tudo e carreguem em **Run**. Deve aparecer *Success*.
4. **Fechar a porta a estranhos** (importante):
   - Menu **Authentication → Sign In / Providers**.
   - Desliguem **Allow new users to sign up** e carreguem em **Save**.
   - Assim, só as contas que vocês criarem a seguir conseguem entrar.
5. **Criar as vossas duas contas de acesso:**
   - Menu **Authentication → Users → Add user → Create new user**.
   - Escrevam o email e uma palavra-passe de um de vocês, marquem **Auto Confirm User** e carreguem em **Create user**.
   - Repitam para a outra pessoa.
6. **Copiar os dois dados de ligação** (vão precisar deles no passo 3):
   - Carreguem no botão **Connect** no topo da página (ou **Project Settings → API Keys**).
   - Copiem o **Project URL** (algo como `https://abcdefgh.supabase.co`).
   - Copiem a **Publishable key** (começa por `sb_publishable_`).

> ⚠️ Usem **só** a *Publishable key*. Nunca copiem nem partilhem a **Secret key** (`sb_secret_…`): essa dá acesso total aos vossos dados.

## Passo 3 — Pôr a app online (Vercel, 5 min)

1. Criem conta em [vercel.com](https://vercel.com/signup) com **Continue with GitHub**.
2. Carreguem em **Add New… → Project** e, na lista, em **Import** ao lado de `kitty`.
3. Abram **Environment Variables** e adicionem estas duas (o nome tem de ser exatamente este):

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | o *Project URL* do passo 2.6 |
   | `VITE_SUPABASE_ANON_KEY` | a *Publishable key* do passo 2.6 |

4. Carreguem em **Deploy** e esperem 1–2 minutos.
5. No fim aparece o endereço da vossa app (algo como `kitty-abc.vercel.app`). Podem mudá-lo em **Settings → Domains**.

## Passo 4 — No telemóvel de cada um (2 min)

1. Abram o endereço da app.
2. Entrem com o email e a palavra-passe do passo 2.5.
3. Na primeira vez, a app pergunta **Como te chamas?** É o nome que aparece para os dois.
4. Instalem no ecrã principal:
   - **iPhone (Safari):** botão **Partilhar** (quadrado com seta) → **Adicionar ao ecrã principal**.
   - **Android (Chrome):** menu **⋮** → **Instalar app**.

Está feito! 🎉 Comecem pelo separador **Novo**. As categorias podem ser mudadas tocando na vossa inicial (canto superior direito).

---

## Receber as novidades

Quando houver uma versão nova da app:

1. Abram a vossa cópia no GitHub.
2. Carreguem em **Sync fork → Update branch**.

A Vercel publica a nova versão sozinha em cerca de 1 minuto. Os vossos dados não mudam. Se a novidade precisar de mudanças na base de dados, isso vem explicado na própria novidade.

## Privacidade, em poucas palavras

- **Os vossos dados estão na vossa conta Supabase.** Só vocês os conseguem ler, depois de entrar na app. Quem fez a app não tem acesso nenhum.
- **A app não envia dados a mais ninguém.** Não tem anúncios nem estatísticas.
- **Cópia de segurança:** na app, toquem na vossa inicial → **Exportar tudo**, para guardar um ficheiro Excel com tudo.

## Custos

Zero, nos planos gratuitos. Um detalhe: se a app ficar **uma semana sem ser usada**, o Supabase pausa o projeto. Para o reativar, entrem em [supabase.com](https://supabase.com/dashboard) e carreguem em **Restore project**. Os dados ficam lá.

## Se algo correr mal

| A app mostra… | O que fazer |
|---|---|
| **"Falta um passo — ainda não está ligada à vossa base de dados"** | Faltam as duas *Environment Variables* na Vercel (passo 3.3). Depois de as juntar: **Deployments → ⋯ → Redeploy**. |
| **"Falta um passo — a base de dados ainda está vazia"** | Falta correr o `setup.sql` (passo 2.3). Depois recarreguem a página. |
| **"Email ou palavra-passe errados"** | Confirmem o utilizador em *Authentication → Users* (passo 2.5). Lá podem também mudar a palavra-passe. |
| **"Esta app já tem duas pessoas."** | Já há duas contas ligadas à app. Entrem com uma dessas duas. |
| **Nada carrega / erro estranho** | O projeto Supabase pode estar pausado: vejam *Custos* acima. |
