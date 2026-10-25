# Meu espaço

Organização pessoal com Estudos, Biblioteca e Learn. Aplicação privada para **uma pessoa**, hospedada no próprio servidor, com React/TypeScript/Vite, Fastify, SQLite e arquivos locais.

## O que está disponível

- **Estudos:** calendário anual por minutos estudados, escolha do ano, sessões manuais com matéria/caminho/etapa, edição, exclusão, dias ativos e progresso. Datas seguem `America/Sao_Paulo`. Notas e conclusões não geram tempo automaticamente.
- **Biblioteca:** livros, papers e listas de exercícios; arquivos PDF, PNG, JPEG, GIF e WebP até 25 MB ou links HTTP/HTTPS. Busca por título/autor e filtros por tipo, matéria e etiqueta. Um material pode ser usado por várias etapas.
- **Learn:** matérias e caminhos editáveis e arquiváveis. Escolha entre módulos/etapas ordenados ou mapas com ramificações. Conexões não bloqueiam estudo; ciclos e conexões duplicadas são recusados. Mapas têm lista alternativa e conexões por formulário para uso por teclado/celular.
- **Anotações:** Tiptap, blocos pelo menu `/`, títulos, formatação, listas, tarefas, código, citações, links, imagens e fórmulas LaTeX. Clique em uma fórmula para editá-la. Salvamento automático, rascunho local e resolução explícita de conflitos entre abas/dispositivos.
- **Organização:** visão geral, treinos, lembretes e calendário continuam disponíveis, agora persistidos no servidor.

## Produção: Docker Compose em Linux

Requisitos: Docker com Compose, um domínio apontando para o servidor e portas 80 e 443 disponíveis. O Caddy emite e renova os certificados HTTPS. Não há dependência de hospedagem Sites, Notion ou TryHackMe.

1. Copie `.env.example` para `.env`.
2. Preencha `DOMAIN` (somente o hostname), `ACME_EMAIL`, `ADMIN_USERNAME` e `ADMIN_PASSWORD` com uma senha única de pelo menos 12 caracteres. Proteja o arquivo com `chmod 600 .env` e não o versione.
3. Inicie a aplicação:

```sh
docker compose up -d --build
```

4. Abra `https://SEU_DOMINIO`, entre e crie a primeira matéria no Learn.

A senha inicial é definida somente na criação do banco. Alterar `.env` depois não altera a senha existente: use o procedimento administrativo abaixo. Também é possível fornecer `ADMIN_PASSWORD_FILE` ao processo em vez de `ADMIN_PASSWORD` para usar um arquivo de segredo.

O Caddy atende o acesso pelo domínio. A porta 3000 do aplicativo fica acessível somente no próprio servidor (`127.0.0.1`), para permitir um proxy privado como Tailscale Serve sem expor essa porta na rede. O aplicativo executa como usuário `node`, com cookie HttpOnly/Secure/SameSite e arquivos acessíveis mediante login. Não existe cadastro público. O endpoint `/api/health` é público e não retorna dados pessoais. O diretório SQLite deve estar em disco local, não em NFS; execute uma única instância do aplicativo.

### Acesso privado com Tailscale (incluindo CGNAT)

Use esta opção para acessar o app apenas pelos seus dispositivos autenticados no mesmo tailnet, mesmo quando o provedor usa CGNAT. Não é preciso encaminhar portas no roteador. O Compose acima mantém a porta 3000 limitada ao próprio servidor; o Tailscale Serve cria o endereço HTTPS privado.

No servidor Debian, instale e conecte o Tailscale:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Abra o link de autenticação que o comando mostrar e entre na conta Tailscale que usará nos outros dispositivos. Depois que o app estiver iniciado com `docker compose up -d --build`, configure o proxy privado:

```sh
sudo tailscale serve --bg 3000
sudo tailscale serve status
```

O comando mostra um endereço HTTPS `https://NOME-DO-SERVIDOR.NOME-DO-TAILNET.ts.net`. Instale o Tailscale no computador ou celular de onde vai acessar e entre na mesma conta; então abra esse endereço. O primeiro uso pode pedir para habilitar HTTPS no tailnet. Mantenha o acesso do tailnet restrito aos seus próprios dispositivos.

### Atualizar a instalação no servidor

Depois de receber uma alteração publicada no GitHub, atualize o clone existente no servidor. Não é necessário clonar novamente:

```sh
cd ~/Central-Pitaya-dev/sites/meu-espaco
git pull --ff-only
docker compose up -d --build
docker compose ps
```

O banco e os uploads permanecem nos volumes do Docker. Faça o backup descrito abaixo antes de atualizar.

Volumes persistentes:

| Volume                        | Conteúdo                                            |
| ----------------------------- | --------------------------------------------------- |
| `app_data`                    | Banco `space.sqlite`, arquivos WAL/SHM e `uploads/` |
| `app_backups`                 | Backups consistentes com manifesto SHA-256          |
| `caddy_data` / `caddy_config` | Certificados e configuração do proxy                |

Não execute `docker compose down -v` sobre uma instalação com dados a preservar.

### Atualizar

Faça o backup abaixo antes de atualizar. Depois de atualizar o código:

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 app
```

Os volumes são reutilizados. O banco inicializa o esquema de forma idempotente e identifica sua versão com `PRAGMA user_version`. Os arquivos `.openai/` são metadados históricos do protótipo; não são usados na implantação Docker.

### Backup completo

O backup exige uma breve parada para copiar banco e uploads no mesmo estado. O utilitário usa a API de backup do SQLite, não copia apenas o arquivo principal de um banco em uso.

```sh
docker compose stop app
docker compose run --rm --no-deps app npm run backup
docker compose start app
```

O comando informa o nome do diretório gerado em `/backups`. Para obter uma cópia fora do servidor/volume:

```sh
mkdir -p backups
docker compose cp app:/backups/NOME_DO_BACKUP ./backups/
```

Copie o diretório inteiro, incluindo `manifest.json` e `uploads/`. O botão **Exportar dados** gera JSON de registros para consulta e portabilidade; ele não inclui os bytes dos arquivos e não substitui este backup completo.

### Restaurar sem sobrescrever os dados atuais

A restauração só aceita um diretório de destino vazio, confere todos os hashes e executa `integrity_check`. Preserve o volume atual e use um volume novo. Com a aplicação parada:

1. Disponibilize o diretório de backup em `/backups/NOME_DO_BACKUP` (no mesmo servidor, ele já está no volume; vindo de fora, use `docker compose cp ./backups/NOME_DO_BACKUP app:/backups/`).
2. Crie `compose.restore.yaml` com um volume de dados novo:

```yaml
services:
  app:
    volumes:
      - restored_data:/data
volumes:
  restored_data:
```

3. Restaure e inicie usando o mesmo conjunto de arquivos Compose:

```sh
docker compose stop app
docker compose -f compose.yaml -f compose.restore.yaml run --rm --no-deps app npm run restore -- /backups/NOME_DO_BACKUP
docker compose -f compose.yaml -f compose.restore.yaml up -d
```

Use esses dois arquivos também nas operações futuras enquanto esse for o volume ativo. O volume anterior continua disponível para recuperação. O backup contém o hash da senha e sessões; trate-o como informação privada.

### Trocar a senha no ambiente local

`npm start` e os comandos de manutenção leem `.env.local` automaticamente. `.env.example` é apenas um modelo e deve permanecer sem uma senha real.

Na primeira inicialização, `ADMIN_PASSWORD` cria a conta. Para trocar a senha de uma conta existente, pare o servidor e execute `npm run admin:password`; digite a nova senha de pelo menos 12 caracteres quando solicitado e depois execute `npm start`. Alterar somente o arquivo de configuração não muda a senha já armazenada no banco.

### Redefinir a senha administrativa

Pare o aplicativo e execute o comando interativo. A senha não aparece na tela nem nos argumentos e todas as sessões existentes são revogadas.

```sh
docker compose stop app
docker compose run --rm --no-deps app npm run admin:password
docker compose start app
```

Para operação sem terminal interativo, envie a senha pela entrada padrão ou defina `NEW_PASSWORD_FILE` apontando para um arquivo de segredo montado no contêiner. Não passe a senha como argumento de linha de comando.

Se um encerramento abrupto deixar `server.lock`, o servidor verifica o processo na inicialização. Para manutenção, confirme primeiro que o serviço está parado antes de remover um marcador antigo. Não remova um lock de uma instância em execução.

## Desenvolvimento local

Requisito: Node.js 24 ou superior. Instale com `npm ci`. Crie `.env.local`, ignorado pelo Git:

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=PREENCHA_COM_UMA_SENHA_LOCAL_DE_12_CARACTERES_OU_MAIS
COOKIE_SECURE=false
HOST=127.0.0.1
DATA_DIR=./data
```

Em dois terminais:

```sh
npm run dev:server
```

```sh
npm run dev
```

Abra o endereço informado pelo Vite. `/api` é encaminhado ao backend em `127.0.0.1:3000`. A distribuição é gerada em `build/`. Para testá-la:

```sh
npm run build
node --env-file=.env.local server/index.mjs
```

`COOKIE_SECURE=false` é somente para HTTP local. Em produção, o Compose mantém `true`. Os dados locais ficam em `data/`, ignorado pelo Git. Backups nativos usam `DATA_DIR` e `BACKUP_DIR`; pare o servidor antes de `npm run backup` ou `npm run restore -- DIRETORIO`.

## Migrar o protótipo

- Na mesma origem e no mesmo navegador, uma faixa oferece importar a chave antiga `meu-espaco-v1`.
- Se trocar de domínio, exporte o JSON no site antigo e use **Importar dados antigos** no rodapé do novo site. Um site não consegue ler o localStorage de outro domínio.
- Os identificadores originais são preservados: repetir a importação ignora os itens já importados.
- Estudos antigos viram atividades planejadas, preservando título, data, horário, notas e conclusão; não geram sessões ou minutos presumidos.
- A importação do rodapé aceita o array legado ou o campo `items` do JSON exportado. Para restauração completa de notas, caminhos e uploads, use o backup administrativo.

## Contratos da API

Toda rota de dados exige o cookie de sessão. Mutações exigem `X-App-Request: 1`; requisições de origem cruzada são recusadas e não há CORS aberto. JSON inválido retorna 400; sessão ausente, 401; registro ausente, 404.

| Recurso         | Rotas principais                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Conta           | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`                            |
| Organização     | `GET/POST /api/items`, `PATCH/DELETE /api/items/:id`, `POST /api/import`, `GET /api/export`    |
| Matérias        | `GET/POST /api/subjects`, `PATCH /api/subjects/:id`                                            |
| Caminhos        | `GET/POST /api/paths`, `GET/PATCH /api/paths/:id`                                              |
| Módulos e ordem | `POST /api/paths/:id/modules`, `PATCH /api/modules/:id`, `PUT /api/paths/:id/order`            |
| Etapas          | `POST /api/paths/:id/steps`, `GET/PATCH /api/steps/:id`                                        |
| Mapas           | `POST /api/paths/:id/edges`, `DELETE /api/edges/:id`                                           |
| Notas           | `GET/PUT /api/steps/:id/note`                                                                  |
| Sessões         | `GET/POST /api/sessions`, `PUT/DELETE /api/sessions/:id`                                       |
| Atividade       | `GET /api/activity?year=2026`                                                                  |
| Biblioteca      | `GET/POST /api/materials`, `GET/PUT/DELETE /api/materials/:id`, `PUT /api/steps/:id/materials` |
| Arquivos        | `POST /api/files` (multipart), `GET /api/files/:id`, `?download=1`                             |

Uma nota é `{ step_id, content, revision, updated_at }`, com `content` em JSON Tiptap. O `PUT` recebe `{ content, revision }` e incrementa a revisão atomicamente. Em conflito, retorna 409 com a nota atual em `current`; o editor preserva o rascunho e pede uma escolha explícita. Edições realizadas durante um envio são serializadas para evitar perda de alterações.

Excluir um material remove seus vínculos das etapas. Os arquivos permanecem no armazenamento para não quebrar referências presentes em notas; não há coleta automática de arquivos órfãos nesta versão.

## Verificação

```sh
npm test
npm run build
npm audit
npm run format:check
docker build -t meu-espaco:local .
npm run test:docker
```

Os testes usam diretórios temporários e cobrem autenticação, origens, uploads, biblioteca reutilizável, módulos e ordem, mapas/ciclos, sessões/datas, migração, revisões concorrentes, rascunhos e backup/restauração. Não há colaboração, cronômetro, integração automática com serviços externos ou funcionamento offline completo.
