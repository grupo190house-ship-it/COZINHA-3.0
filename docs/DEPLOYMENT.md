# Implantação

## Nova instalação

1. Crie um projeto independente no Google Apps Script.
2. Ative a API do Google Apps Script na conta.
3. Copie `.clasp.json.example` para `.clasp.json` e informe o `scriptId`.
4. Execute `npm install`, `npm run clasp:login` e `npm run clasp:push`.
5. Abra o editor com `npm run clasp:open`.
6. Execute `setupSystem(...)` para criar o banco e o primeiro administrador.
7. Execute `healthCheck()`.
8. Publique como Aplicativo da Web.

Configuração inicial:

```javascript
setupSystem({
  companyName: 'Nome da Empresa',
  adminName: 'Administrador',
  adminEmail: 'admin@empresa.com',
  adminPassword: 'TroqueEstaSenha123'
});
```

O retorno inclui o ID e a URL da planilha criada. Trate esses dados como privados.

## Atualização

```bash
git pull
npm install
npm test
npm run clasp:push
```

No editor:

1. execute `repairInstallation()`;
2. execute `healthCheck()`;
3. corrija qualquer erro do relatório;
4. edite a implantação e selecione uma nova versão.

## Configuração da implantação

- Execute como o proprietário do sistema.
- Restrinja o público à organização quando o ambiente permitir.
- Revise os escopos de Sheets, Drive, Documentos, gatilhos e identificação de e-mail.
- Não compartilhe a planilha para edição com operadores.

## Reversão

O Apps Script mantém versões da implantação. Para reverter código, selecione uma versão anterior. Alterações de dados não são revertidas pelo deploy; mantenha backup periódico da planilha e da pasta de evidências.
