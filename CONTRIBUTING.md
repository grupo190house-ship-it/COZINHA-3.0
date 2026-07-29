# Como contribuir

Crie uma branch curta a partir de `main`, faça mudanças focadas e abra um pull request explicando o impacto operacional e nos dados.

## Fluxo recomendado

```bash
git checkout -b tipo/descricao-curta
npm install
npm test
npm run preview
```

Use mensagens de commit como:

- `feat: adiciona filtro de tarefas por prazo`
- `fix: corrige cartão de produção no celular`
- `docs: atualiza implantação`

Antes do pull request:

- confirme que `npm test` passa;
- teste a interface no celular quando alterar HTML ou CSS;
- teste mudanças de servidor em uma cópia de desenvolvimento;
- documente novas abas e colunas;
- nunca envie `.clasp.json`, senhas, tokens ou dados reais.

Mudanças de esquema devem ser compatíveis com instalações existentes e incorporadas a `repairInstallation()`.
