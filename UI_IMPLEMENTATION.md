# CozinhaFlow ERP — Implementação visual editorial

## Objetivo

Aplicar ao CozinhaFlow uma linguagem visual baseada na análise do site de referência MotherDuck, mantendo a implementação original, a estrutura funcional do ERP e a acessibilidade básica.

A implementação não reutiliza código-fonte proprietário do site de referência. Os estilos e componentes foram recriados em CSS, HTML e JavaScript sobre a arquitetura atual do projeto.

## Estrutura dos arquivos visuais

- `index.html` — carregador principal, dependências, acessibilidade e ordem dos estilos.
- `motherduck-kitchen-theme.html` — design tokens e substituição visual global.
- `dashboard.html` — abertura editorial, arte SVG original e indicadores operacionais.
- `login.html` — tela de acesso editorial com arte SVG original.
- `styles.html` — estrutura base do aplicativo.
- `theme.html` — suporte legado do tema.
- `trello-theme.html` — camada anterior preservada por compatibilidade.
- `mobile-polish.html` e `mobile-v2.html` — correções responsivas anteriores.
- `mobile-menu-fix.html` — rolagem e área segura do menu móvel.
- `simple-modern.html` — simplificação dos fluxos.
- `producao-compact.html` — cartões e modais compactos da produção.
- `estoque-compact-style.html` — formulário compacto de entrada.

`motherduck-kitchen-theme.html` é carregado por último para substituir a identidade anterior sem alterar IDs, eventos ou regras de negócio.

## Dependências

### Externas

- Bootstrap 5.3.3
- Firebase JS SDK 10.14.1 Compatibility API
- Google Fonts:
  - Inter
  - IBM Plex Mono
  - Material Symbols Rounded

### Internas

- Firebase Realtime Database para dados operacionais.
- Google Apps Script e Google Drive para fotos/evidências.
- JavaScript sem framework para navegação e módulos do ERP.

## Tipografia

A referência utiliza uma fonte monoespaçada proprietária semelhante a Aeonik Mono. Como o arquivo da fonte não foi fornecido, foi adotada `IBM Plex Mono`, disponibilizada sob licença aberta.

- Títulos e elementos estruturais: IBM Plex Mono, pesos 500–700.
- Texto corrido e formulários: Inter, pesos 400–800.
- Ícones: Material Symbols Rounded.

## Design tokens

Todos os tokens estão definidos no início de `motherduck-kitchen-theme.html`.

### Cores

- Fundo creme: `#f4efea` / implementação `#f5f0e8`
- Papel branco: `#fffdf8`
- Texto e bordas: `#292825`
- Azul principal: `#63b7f4`
- Azul de ação: `#1686d9`
- Amarelo: `#ffe44f`
- Laranja: `#ff8a3d`
- Verde: `#73c69c`
- Vermelho: `#f2685b`
- Lilás: `#bca7ef`

### Bordas e sombras

- Borda principal: `1.5px` ou `2px solid #292825`
- Sombra rígida pequena: `2px 2px 0 #292825`
- Sombra rígida grande: `4px 4px 0 #292825`
- Arredondamento padrão: `8px`
- Arredondamentos grandes foram evitados, exceto chips, avatares e ilustrações.

### Espaçamento

A escala aplicada usa principalmente:

- 4 px
- 8 px
- 12 px
- 16 px
- 20 px
- 24 px
- 32 px
- 48 px

## Componentes recriados

- Cabeçalho fixo com busca, notificações e identificação do usuário.
- Menu lateral desktop e drawer móvel.
- Barra de navegação inferior para celular.
- Hero editorial do dashboard.
- Artes SVG originais para dashboard e login.
- Botões primários, secundários, links e botões de ícone.
- Cards de indicadores.
- Cards de ação rápida.
- Cards de produção, estoque, compras e tarefas.
- Formulários, selects, inputs, textareas e estados de foco.
- Modais e rodapés fixos de ação.
- Dropdowns e resultados de busca.
- Tabelas, cabeçalhos e paginação.
- Toasts e indicador de conexão.
- Quadro de tarefas em desktop e lista segmentada no celular.
- Estados vazio, carregando, alerta, sucesso, erro e desabilitado.

## Estados de interação

- `hover`: deslocamento de 1 px e aumento da sombra rígida.
- `focus`: borda escura e sombra azul rígida.
- `active`: redução da sombra e deslocamento do controle.
- `disabled`: opacidade reduzida, cursor bloqueado e ausência de transformação.
- `selected`: fundo amarelo ou azul-claro e borda escura.
- `error`: vermelho/coral.
- `success`: verde/mint.
- `warning`: amarelo ou laranja.

## Breakpoints

- Desktop amplo: acima de 1200 px.
- Desktop/tablet horizontal: 901–1200 px.
- Tablet e celular: até 900 px.
- Celular: até 560 px.
- Celular estreito: até 390 px, usando as regras existentes do módulo móvel.

## Responsividade

### Desktop

- Menu lateral fixo.
- Cabeçalho horizontal.
- Hero dividido entre texto e arte.
- Grades de cartões com múltiplas colunas.
- Tabelas completas.

### Tablet

- Menos colunas por grade.
- Hero com proporção ajustada.
- Busca reduzida.
- Menu lateral convertido em drawer.

### Celular

- Hero empilhado.
- Atalhos em duas colunas.
- Indicadores em duas colunas.
- Tabelas convertidas ou roláveis conforme o módulo.
- Modais no formato de painel inferior.
- Navegação inferior fixa.
- Inputs com 16 px para impedir zoom automático do Safari.
- Menu móvel com rolagem própria e área segura do iPhone.

## Acessibilidade

- Elementos interativos continuam sendo `button`, `input`, `select` e links semânticos.
- `aria-label` foi mantido/adicionado em botões de ícone.
- Toasts usam `aria-live="polite"`.
- O modal possui associação com `modalTitle`.
- Contraste foi mantido alto com texto `#292825` sobre superfícies claras.
- Foco visual explícito para teclado.
- A estrutura funcional anterior foi preservada para não interromper a navegação por teclado.

## Instalação e execução

O projeto é estático no GitHub Pages e utiliza Firebase/Apps Script como backend.

1. Clone ou baixe o repositório.
2. Não é necessário executar `npm install` para o frontend atual.
3. Configure o Firebase no adaptador existente.
4. Configure a URL da implantação do Apps Script no adaptador do Google Drive.
5. Publique os arquivos no branch `main`.
6. Ative o GitHub Pages para o branch `main`, diretório raiz.
7. Abra a URL do GitHub Pages.

Para desenvolvimento local, use qualquer servidor HTTP estático, por exemplo:

```bash
python -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Recursos que precisam ser fornecidos para reprodução exata

- Arquivos licenciados da fonte original Aeonik Mono/Aeonik Fono.
- Logotipo oficial e arquivos vetoriais da marca, caso devam ser usados.
- Ilustrações oficiais autorizadas em SVG/PNG/WebP.
- Especificação oficial de movimento, caso existam animações não observáveis na navegação pública.

Sem esses recursos, o projeto utiliza IBM Plex Mono, Material Symbols e ilustrações SVG originais de cozinha.

## Diferenças objetivas em relação ao site de referência

- A aplicação é um ERP autenticado, enquanto a referência é um site institucional; a arquitetura de navegação foi adaptada ao fluxo operacional.
- A fonte original proprietária foi substituída por IBM Plex Mono.
- O logotipo e as ilustrações de pato não foram copiados; foram criadas artes originais de cozinha.
- O conteúdo e a hierarquia das páginas continuam sendo do CozinhaFlow.
- Animações complexas da referência foram traduzidas para transições leves, adequadas a uma aplicação operacional.
- O modo escuro foi desativado para preservar a identidade creme da referência e evitar inconsistência de contraste.
