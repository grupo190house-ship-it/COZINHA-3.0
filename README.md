# CozinhaFlow Tarefas

Aplicativo mobile-first para distribuir e acompanhar tarefas da equipe. Os dados ficam no Firebase ou Google Sheets, conforme a implantação atual, e as fotos de conclusão continuam armazenadas no Google Drive.

O administrador escreve a atividade, escolhe o funcionário e define prioridade e prazo. Cada funcionário recebe apenas as próprias tarefas e só conclui depois de confirmar a execução e enviar uma foto.

## Principais recursos

- Quadro de tarefas com etapas **A fazer**, **Em andamento** e **Concluídas**.
- Navegação por listas no celular, sem cartões ultrapassando a tela.
- Tarefas livres: o texto digitado pelo administrador vira a atividade.
- Confirmação de execução com usuário, data, hora e foto obrigatória.
- Cadastro de funcionários pelo administrador.
- Cada funcionário visualiza somente as tarefas atribuídas a ele.
- Fotos de conclusão armazenadas no Google Drive pelo fluxo já configurado.
- Perfis principais: Administrador, Supervisor e Funcionário.
- Interface responsiva com navegação inferior no celular.

## Tecnologia

- Google Apps Script V8
- Google Sheets
- Google Drive
- HTML, CSS e JavaScript sem etapa de compilação
- `clasp` para sincronização com o Apps Script
- Node.js para preview e validações

## Começar

### Pré-requisitos

- Node.js 20 ou superior
- Conta Google com acesso ao Apps Script
- API do Google Apps Script habilitada na conta

### 1. Preparar o projeto local

```bash
git clone URL_DO_SEU_REPOSITORIO
cd CozinhaFlow-ERP
npm install
npm run clasp:login
```

### 2. Vincular ao Apps Script

Crie um projeto em [script.google.com](https://script.google.com), copie o ID em **Configurações do projeto → IDs** e prepare o arquivo local:

```bash
cp .clasp.json.example .clasp.json
```

Substitua o valor de `scriptId` no novo `.clasp.json`. Esse arquivo é privado e já está protegido pelo `.gitignore`.

### 3. Enviar o código

```bash
npm run clasp:push
npm run clasp:open
```

No editor do Apps Script, execute uma vez:

```javascript
setupSystem({
  companyName: 'Nome da Empresa',
  adminName: 'Administrador',
  adminEmail: 'admin@empresa.com',
  adminPassword: 'TroqueEstaSenha123'
});
```

Depois:

1. Autorize os acessos solicitados.
2. Execute `healthCheck()` e confirme que `ok` é `true`.
3. Acesse **Implantar → Nova implantação → Aplicativo da Web**.
4. Configure para executar como o proprietário do sistema.
5. Defina o público adequado à organização e implante.

Nunca grave a senha do administrador no repositório.

## Atualizar uma instalação existente

Depois de enviar uma nova versão:

```bash
npm run clasp:push
```

Execute `repairInstallation()` no editor do Apps Script. A função cria abas e colunas novas sem apagar os dados existentes. Depois, execute `healthCheck()` e publique uma nova versão da implantação.

## Desenvolvimento

Para validar a estrutura, a sintaxe dos arquivos `.gs`, os JavaScripts da interface, os includes e IDs HTML:

```bash
npm test
```

Para abrir a interface com dados simulados:

```bash
npm run preview
```

Acesse `http://127.0.0.1:41739`.

## Organização do repositório

```text
.
├── *.gs                       # serviços e regras do Apps Script
├── *.html                     # telas, estilos e JavaScript do navegador
├── appsscript.json            # manifesto e permissões Google
├── dev-preview.mjs            # preview local com dados simulados
├── scripts/                   # validações automatizadas
├── docs/                      # arquitetura, dados e implantação
└── .github/                   # CI, issues e pull requests
```

O Apps Script trabalha com os arquivos na raiz. A separação funcional continua pelos nomes dos módulos, sem build e sem conversão antes do `clasp push`.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Modelo de dados](docs/DATA_MODEL.md)
- [Implantação](docs/DEPLOYMENT.md)
- [Operação e manutenção](docs/OPERATIONS.md)
- [Como contribuir](CONTRIBUTING.md)
- [Política de segurança](SECURITY.md)
- [Histórico de versões](CHANGELOG.md)

## Licenciamento

Este repositório não inclui uma licença de código aberto. Defina a licença e a titularidade antes de torná-lo público.
