# Operação e manutenção

## Rotina diária

- acompanhe tarefas atrasadas e produções em andamento;
- registre entradas com quantidade, lote, validade e custo unitário;
- finalize produções com consumo real e quantidade produzida;
- registre perdas no momento em que ocorrerem;
- confira itens abaixo do mínimo e solicitações de compra;
- valide notificações e pendências de inventário.

## Tarefas

1. O administrador cria uma tarefa livre e escolhe o operador.
2. A tarefa aparece em **A fazer** somente para o responsável e para quem administra.
3. O operador toca em **Iniciar tarefa**.
4. Depois da execução, toca em **Concluir com foto**.
5. A conclusão exige checkbox e imagem.
6. O comprovante fica associado ao usuário, data e hora.

## Custos

Preencha o custo na entrada de estoque. Sem custo informado, o sistema tenta usar o custo médio ou o valor cadastrado no item. Revise custos zerados antes de analisar perdas ou custo de produção.

## Saúde e reparo

Execute `healthCheck()` depois de cada atualização e sempre que houver suspeita de estrutura incompleta. Execute `repairInstallation()` para reaplicar cabeçalhos, estilos e gatilhos sem apagar registros.

## Backup

Mantenha cópias periódicas:

- da planilha do banco;
- da pasta de evidências no Drive;
- do repositório Git;
- das propriedades necessárias para reconstruir a instalação.

Teste a restauração em um ambiente separado.
