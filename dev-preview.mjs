/**
 * Pré-visualização local opcional. Este arquivo não é enviado pelo clasp.
 * Uso: node dev-preview.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PREVIEW_PORT || 41739);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function compose() {
  let html = read('index.html')
    .replace(/<\?!= include\('([^']+)'\); \?>/g, (_, name) => read(`${name}.html`))
    .replace(/<\?= appName \?>/g, 'CozinhaFlow ERP')
    .replace(/<\?= version \?>/g, '1.5.0');
  const mock = `<script>
    window.__COZINHA_PREVIEW__ = true;
    const previewWorkerMode = new URLSearchParams(location.search).get('role') === 'operator';
    if(location.search.includes('login=1') || location.pathname.includes('login-preview')) {
      localStorage.removeItem('cozinhaflow_token');
      sessionStorage.removeItem('cozinhaflow_token');
    }
    else localStorage.setItem('cozinhaflow_token','preview-token');
    const previewNow = new Date().toISOString();
    const previewLookups = {
      inputs:[{id:'i1',name:'Barra de queijo'},{id:'i2',name:'Calabresa inteira'},{id:'i3',name:'Embalagem plástica'}],
      products:[{id:'p1',name:'Queijo ralado 100 g'},{id:'p2',name:'Calabresa fatiada 500 g'}],
      suppliers:[{id:'f1',name:'Distribuidora Aurora'},{id:'f2',name:'Alimentos Nordeste'}],
      operators:[{id:'o1',name:'Lucas Almeida'},{id:'o2',name:'Paulo Lima'}],
      recipes:[],
      units:['kg','g','L','mL','un','cx','pct','porção'],
      roles:['Administrador','Supervisor','Operador','Comprador','Financeiro','Consulta']
    };
    const previewDashboard = {
      date:'2026-07-27',
      cards:{lowStock:2,productionToday:85,productionsInProgress:1,productsInStock:2,pendingPurchases:2,lossesToday:45,pendingInventories:1},
      lowStock:[
        {id:'i1',name:'Barra de queijo',balance:8,minimum:10,unit:'kg'},
        {id:'i2',name:'Calabresa inteira',balance:4,minimum:6,unit:'kg'}
      ],
      activeProductions:[{id:'pr1',code:'PRD-001',product:'Queijo ralado 100 g',operator:'Marina Souza',startedAt:'2026-07-27T14:00:00'}],
      alerts:[],
      onboarding:{complete:false,completed:4,total:5,steps:[
        {key:'inputs',label:'Cadastrar insumos',module:'insumos',complete:true},
        {key:'levels',label:'Definir estoques mínimo e máximo',module:'insumos',complete:true},
        {key:'products',label:'Cadastrar produtos produzidos',module:'produtos',complete:true},
        {key:'operators',label:'Cadastrar operadores',module:'operadores',complete:true},
        {key:'stock',label:'Registrar a primeira entrada de estoque',module:'estoque',complete:false}
      ]}
    };
    const previewRows = {
      'insumos.list':[
        {ID:'i1',CODIGO:'INS-001',NOME:'Barra de queijo',CATEGORIA:'Frios',UNIDADE:'kg',ESTOQUE_ATUAL:8,ESTOQUE_MINIMO:10,ESTOQUE_MAXIMO:30,PRECO_ATUAL:35,PRECO_MEDIO:34,STATUS:'Ativo'},
        {ID:'i2',CODIGO:'INS-002',NOME:'Calabresa inteira',CATEGORIA:'Frios',UNIDADE:'kg',ESTOQUE_ATUAL:4,ESTOQUE_MINIMO:6,ESTOQUE_MAXIMO:20,PRECO_ATUAL:23,PRECO_MEDIO:22,STATUS:'Ativo'}
      ],
      'produtos.list':[
        {ID:'p1',CODIGO:'PRO-001',NOME:'Queijo ralado 180 g',CATEGORIA:'Frios',UNIDADE:'pct',PESO_UNITARIO:180,UNIDADE_PESO:'g',ESTOQUE_ATUAL:85,ESTOQUE_MINIMO:20,ESTOQUE_MAXIMO:150,CUSTO:6.80,STATUS:'Ativo'},
        {ID:'p2',CODIGO:'PRO-002',NOME:'Calabresa fatiada 500 g',CATEGORIA:'Frios',UNIDADE:'pct',PESO_UNITARIO:500,UNIDADE_PESO:'g',ESTOQUE_ATUAL:24,ESTOQUE_MINIMO:10,ESTOQUE_MAXIMO:80,CUSTO:8.20,STATUS:'Ativo'}
      ],
      'estoque.overview':{type:'INSUMO',summary:{quantity:12,items:2,stocked:2,lowStock:2,lots:2},items:[
        {ID:'i1',CODIGO:'INS-001',NOME:'Barra de queijo',CATEGORIA:'Frios',UNIDADE:'kg',SALDO:8,ESTOQUE_MINIMO:10,ESTOQUE_MAXIMO:30,LOTES:1,ABAIXO_MINIMO:true,SITUACAO:'Abaixo do mínimo'},
        {ID:'i2',CODIGO:'INS-002',NOME:'Calabresa inteira',CATEGORIA:'Frios',UNIDADE:'kg',SALDO:4,ESTOQUE_MINIMO:6,ESTOQUE_MAXIMO:20,LOTES:1,ABAIXO_MINIMO:true,SITUACAO:'Abaixo do mínimo'}
      ],lots:[
        {ID:'l1',ITEM_ID:'i1',ITEM_CODIGO:'INS-001',ITEM_NOME:'Barra de queijo',LOTE:'QJ-260721',ENTRADA_EM:'2026-07-21T09:00:00',QUANTIDADE_INICIAL:20,QUANTIDADE_ATUAL:8,UNIDADE:'kg'},
        {ID:'l2',ITEM_ID:'i2',ITEM_CODIGO:'INS-002',ITEM_NOME:'Calabresa inteira',LOTE:'CL-260714',ENTRADA_EM:'2026-07-14T11:30:00',QUANTIDADE_INICIAL:12,QUANTIDADE_ATUAL:4,UNIDADE:'kg'}
      ]},
      'producoes.list':[
        {ID:'pr1',CODIGO:'PRD-001',INSUMO_NOME:'Barra de queijo',QTD_INSUMO:10,UNIDADE_INSUMO:'kg',CONSUMO_INSUMO:'10 kg',PRODUTO_ID:'p1',PRODUTO_NOME:'Queijo ralado 180 g',UNIDADE_PRODUTO:'pct',PESO_UNITARIO_PRODUTO:180,UNIDADE_PESO_PRODUTO:'g',CUSTO_ESTIMADO_INSUMOS:340,HORA_INICIO:'2026-07-27T14:00:00',OPERADOR_NOME:'Marina Souza',QTD_PRODUZIDA:0,RENDIMENTO_RESUMO:'',STATUS:'Em produção',OBSERVACOES:''},
        {ID:'pr0',CODIGO:'PRD-000',INSUMO_NOME:'Calabresa inteira',QTD_INSUMO:6,UNIDADE_INSUMO:'kg',CONSUMO_INSUMO:'6 kg',PRODUTO_ID:'p2',PRODUTO_NOME:'Calabresa fatiada 500 g',UNIDADE_PRODUTO:'pct',PESO_UNITARIO_PRODUTO:500,UNIDADE_PESO_PRODUTO:'g',CUSTO_TOTAL:132,CUSTO_UNITARIO_PRODUZIDO:11,HORA_INICIO:'2026-07-27T09:00:00',OPERADOR_NOME:'Paulo Lima',QTD_PRODUZIDA:12,RENDIMENTO_RESUMO:'2 pacotes/kg · 6 kg embalados · 100% de aproveitamento',STATUS:'Finalizada',OBSERVACOES:''}
      ],
      'compras.list':[
        {ID:'c1',CODIGO:'SOL-001',INSUMO_ID:'i1',INSUMO_NOME:'Barra de queijo',UNIDADE:'kg',ESTOQUE_ATUAL:8,ESTOQUE_MINIMO:10,ESTOQUE_MAXIMO:30,QUANTIDADE_SUGERIDA:22,QUANTIDADE_APROVADA:0,QUANTIDADE_COMPRAR:22,FORNECEDOR_ID:'f1',FORNECEDOR_NOME:'Distribuidora Aurora',STATUS:'Solicitado',STATUS_RESUMO:'Pendente',DATA:'2026-07-27'},
        {ID:'c2',CODIGO:'SOL-002',INSUMO_ID:'i2',INSUMO_NOME:'Calabresa inteira',UNIDADE:'kg',ESTOQUE_ATUAL:4,ESTOQUE_MINIMO:6,ESTOQUE_MAXIMO:20,QUANTIDADE_SUGERIDA:16,QUANTIDADE_APROVADA:16,QUANTIDADE_COMPRAR:16,FORNECEDOR_ID:'f2',FORNECEDOR_NOME:'Alimentos Nordeste',STATUS:'Comprado',STATUS_RESUMO:'Comprado',DATA:'2026-07-27'}
      ],
      'inventarios.list':[
        {ID:'iv1',NUMERO:'INV-001',TIPO:'Diário',ITEM_CODIGO:'INS-001',ITEM_NOME:'Barra de queijo',TIPO_ESTOQUE:'INSUMO',SALDO_ESPERADO:8,QUANTIDADE_CONTADA:'',DIFERENCA:'',DATA_HORA:'2026-07-27T18:00:00',STATUS:'Pendente'}
      ],
      'tarefas.assignees':[
        {id:'u2',name:'Lucas Almeida',email:'lucas@cozinha.local',role:'Operador'},
        {id:'u3',name:'Paulo Lima',email:'paulo@cozinha.local',role:'Supervisor'}
      ],
      'tarefas.list':[
        {ID:'t1',TITULO:'Limpar o forno industrial',DESCRICAO:'Retirar as grades, aplicar o desengordurante e limpar também a parte externa.',RESPONSAVEL_ID:'u2',RESPONSAVEL_NOME:'Lucas Almeida',PRIORIDADE:'Urgente',PRAZO:'2026-07-29T16:00',STATUS:'A fazer',CRIADO_POR_NOME:'Marina Souza',INICIADO_EM:'',CONCLUIDO_EM:'',OBSERVACAO_CONCLUSAO:'',TEM_FOTO:false,RECORRENCIA:'Diária',TURNO:'Fechamento',ORIENTACAO_FOTO:'Mostre o forno inteiro e a parte interna sem resíduos.',CRIADO_EM:previewNow},
        {ID:'t2',TITULO:'Conferir etiquetas da câmara fria',DESCRICAO:'Verificar validade e identificação dos recipientes abertos.',RESPONSAVEL_ID:'u3',RESPONSAVEL_NOME:'Paulo Lima',PRIORIDADE:'Alta',PRAZO:'2026-07-29T15:30',STATUS:'Em andamento',CRIADO_POR_NOME:'Marina Souza',INICIADO_EM:'2026-07-29T13:10:00',CONCLUIDO_EM:'',OBSERVACAO_CONCLUSAO:'',TEM_FOTO:false,CRIADO_EM:previewNow},
        {ID:'t4',TITULO:'Organizar a bancada de preparo',DESCRICAO:'Retirar itens sem uso e deixar a bancada pronta para o próximo turno.',RESPONSAVEL_ID:'u2',RESPONSAVEL_NOME:'Lucas Almeida',PRIORIDADE:'Alta',PRAZO:'2026-08-17T18:00',STATUS:'Em andamento',CRIADO_POR_NOME:'Marina Souza',INICIADO_EM:previewNow,CONCLUIDO_EM:'',OBSERVACAO_CONCLUSAO:'',TEM_FOTO:true,REVISAO_STATUS:'Devolvida',MOTIVO_REVISAO:'A foto anterior não mostrou a bancada inteira.',ORIENTACAO_FOTO:'Mostre toda a bancada, incluindo os cantos.',CRIADO_EM:previewNow},
        {ID:'t5',TITULO:'Higienizar área do fogão',DESCRICAO:'Retirar gordura e resíduos ao redor dos queimadores.',RESPONSAVEL_ID:'u2',RESPONSAVEL_NOME:'Lucas Almeida',PRIORIDADE:'Alta',PRAZO:'2026-08-16T19:30',STATUS:'Aguardando aprovação',CRIADO_POR_NOME:'Marina Souza',ENVIADO_REVISAO_EM:previewNow,OBSERVACAO_CONCLUSAO:'Área pronta para o fechamento.',TEM_FOTO:true,FOTO_THUMBNAIL_URL:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22320%22%3E%3Crect width=%22600%22 height=%22320%22 fill=%22%23d9d5e8%22/%3E%3Crect x=%2270%22 y=%2270%22 width=%22460%22 height=%22180%22 rx=%2220%22 fill=%22%239b92b8%22/%3E%3Ccircle cx=%22200%22 cy=%22160%22 r=%2250%22 fill=%22%235f5875%22/%3E%3Ccircle cx=%22400%22 cy=%22160%22 r=%2250%22 fill=%22%235f5875%22/%3E%3C/svg%3E',CRIADO_EM:previewNow},
        {ID:'t3',TITULO:'Higienizar bancada de montagem',DESCRICAO:'',RESPONSAVEL_ID:'u2',RESPONSAVEL_NOME:'Lucas Almeida',PRIORIDADE:'Normal',PRAZO:'2026-07-29T11:00',STATUS:'Concluída',CRIADO_POR_NOME:'Marina Souza',INICIADO_EM:'2026-07-29T10:00:00',CONCLUIDO_EM:'2026-07-29T10:35:00',OBSERVACAO_CONCLUSAO:'Bancada liberada para o próximo turno.',TEM_FOTO:true,CRIADO_EM:previewNow}
      ],
      'pontos.resgates':[
        {ID:'r1',RECOMPENSA_ID:'pizza_brotinho',RECOMPENSA_NOME:'Pizza brotinho',EMOJI:'🍕',PONTOS:180,USUARIO_ID:'u2',USUARIO_NOME:'Lucas Almeida',STATUS:'Solicitado',CRIADO_EM:previewNow}
      ],
      'usuarios.list':[
        {id:'u1',name:'Marina Souza',email:'admin@cozinha.local',role:'Administrador',status:'Ativo',lastAccess:previewNow},
        {id:'u2',name:'Lucas Almeida',email:'lucas@cozinha.local',role:'Operador',status:'Ativo',lastAccess:previewNow},
        {id:'u3',name:'Paulo Lima',email:'paulo@cozinha.local',role:'Supervisor',status:'Ativo',lastAccess:previewNow}
      ]
    };
    const mockData = action => {
      if(action==='session.me') return {user:previewWorkerMode?{id:'u2',name:'Lucas Almeida',email:'lucas@cozinha.local',role:'Operador',status:'Ativo'}:{id:'u1',name:'Marina Souza',email:'admin@cozinha.local',role:'Administrador',status:'Ativo'},acl:previewWorkerMode?['tarefas','notificacoes']:['tarefas','operadores','notificacoes'],config:{APP_NAME:'CozinhaFlow ERP',COMPANY_NAME:'Cozinha Industrial Aurora',CURRENCY:'BRL',VERSION:'1.5.0'},enums:{},notifications:[]};
      if(action==='lookups.get') return previewLookups;
      if(action==='dashboard.get') return previewDashboard;
      if(action==='compras.refresh') return {created:0,updated:2};
      if(action==='tarefas.list' && previewWorkerMode) return previewRows[action].filter(row=>row.RESPONSAVEL_ID==='u2');
      if(action==='pontos.resgates' && previewWorkerMode) return previewRows[action].filter(row=>row.USUARIO_ID==='u2');
      if(action==='pontos.resgatar' || action==='pontos.entregar' || action==='pontos.recompensa.salvar') return {ok:true};
      if(action==='tarefas.evidence') return {title:'Comprovante da tarefa',dataUrl:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22320%22%3E%3Crect width=%22600%22 height=%22320%22 fill=%22%23d9d5e8%22/%3E%3C/svg%3E',operator:'Lucas Almeida',completedAt:previewNow,observation:'Foto de demonstração'};
      return previewRows[action] || [];
    };
    const makeRunner=(success,failure)=>new Proxy({},{
      get(target,prop){
        if(prop==='withSuccessHandler') return handler=>makeRunner(handler,failure);
        if(prop==='withFailureHandler') return handler=>makeRunner(success,handler);
        return (...args)=>setTimeout(()=>{
          if(prop==='publicBootstrap') success?.({ok:true,data:{installed:true,appName:'CozinhaFlow ERP',companyName:'Cozinha Industrial Aurora',version:'1.5.0'}});
          else if(prop==='apiRequest') success?.({ok:true,data:mockData(args[0])});
          else success?.({ok:true,data:null});
        },80);
      }
    });
    window.google={script:{run:makeRunner()}};
  </script>`;
  return html.replace('</head>', `${mock}</head>`);
}

http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`).pathname;
  if (pathname === '/' || pathname === '/index.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(compose());
    return;
  }
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  if (filePath.startsWith(root + path.sep) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const type = path.extname(filePath) === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(filePath));
    return;
  }
  response.writeHead(404);
  response.end('Not found');
}).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
