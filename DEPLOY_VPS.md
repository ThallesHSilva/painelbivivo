# Implantação na VPS

O projeto roda como uma aplicação única, com SQLite e arquivos processados no volume Docker
`mapa-parque-data`. Não é necessário contratar banco ou armazenamento externo.

As bases comerciais não fazem parte do repositório. Após a primeira inicialização, carregue-as
pela página **Alimentar dados** ou restaure um backup do volume.

## Requisitos

- VPS Linux com Docker Engine e Docker Compose;
- pelo menos 4 GB de RAM para processar bases grandes;
- domínio ou túnel apontando para `http://127.0.0.1:8000`.

## Primeira implantação

```bash
git clone https://github.com/ThallesHSilva/vista-park-now.git
cd vista-park-now
cp .env.example .env
```

Edite `.env` e defina `AUTH_EMAIL`, `AUTH_PASSWORD_HASH`, `AUTH_SECRET` e `APP_ORIGIN`.
Gere uma chave de sessão com:

```bash
openssl rand -base64 48
```

Depois, suba a aplicação:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f mapa-parque
```

## Confirmação de e-mail pelo Gmail

Configure `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASSWORD` e
`MAIL_FROM="Painel executivo <seu-email@gmail.com>"`. Use uma senha de app do Google em
`SMTP_PASSWORD`. A conta Google precisa ter verificação em duas etapas habilitada para
gerar essa senha. Defina `APP_ORIGIN` com a URL HTTPS pública do painel.

O relay do Google Workspace também é suportado com `SMTP_HOST=smtp-relay.gmail.com`,
`SMTP_PORT=587`, `SMTP_AUTH=auto` e `SMTP_FROM` com o remetente autorizado. Nesse modo,
a conexão usa TLS e a autenticação é feita pelo IP da VPS autorizado no Google Workspace.
O envio pelo relay usa o IPv4 da VPS e identifica o servidor com o domínio de `APP_ORIGIN`.
`MAIL_FROM`, quando definido, tem prioridade sobre `SMTP_FROM`.

Em uma implantação pelo Coolify, cadastre essas variáveis em **Environment Variables**,
disponíveis no contêiner de produção. O arquivo `.env` local é ignorado pelo Git e pela
imagem Docker. Na implantação por Docker Compose, o arquivo `.env` é lido pelo serviço.

Após o cadastro, o usuário recebe um link válido por 1 hora. O login exige confirmação do
e-mail e aprovação do administrador. Contas existentes também precisam confirmar seu
endereço no próximo login. O administrador pode acompanhar essa confirmação em **Acessos**.
Alterar o e-mail de uma conta exige uma nova confirmação. O reenvio está disponível no login,
com intervalo de 1 minuto e limite de 10 mensagens por conta a cada 24 horas.

## Atualização da aplicação

```bash
git pull
docker compose up -d --build
```

O banco, os uploads QSC e os snapshots processados permanecem no volume mesmo quando o
container é recriado.

## Backup

Pare brevemente a aplicação para obter uma cópia consistente e compacte o volume:

```bash
docker compose stop mapa-parque
docker run --rm -v mapa-parque-data:/data -v "$PWD:/backup" alpine \
  tar -czf /backup/mapa-parque-backup.tar.gz -C /data .
docker compose start mapa-parque
```

O arquivo `mapa-parque-backup.tar.gz` contém usuários, vínculos, histórico das cargas e dados
processados. Guarde-o fora da VPS.
