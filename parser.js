/**
 * js/parser.js - Extrator de Dados da NF-e (Informações Adicionais, Pagamento e Ambiente)
 */
const NfeParser = {
  parseXML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // Identificação básica e Chave
    const chNFe = xmlDoc.querySelector('chNFe')?.textContent || xmlDoc.querySelector('infNFe')?.getAttribute('Id')?.replace('NFe', '') || 'CHAVE-' + Math.random().toString(36).substr(2, 9);
    const nNF = xmlDoc.querySelector('nNF')?.textContent || '000000';
    const serie = xmlDoc.querySelector('serie')?.textContent || '0';
    const natOp = xmlDoc.querySelector('natOp')?.textContent || 'Não informada';
    const dhEmi = xmlDoc.querySelector('dhEmi')?.textContent || xmlDoc.querySelector('dEmi')?.textContent || new Date().toISOString();
    
    // Identificação do Ambiente (1=Produção, 2=Homologação)
    const tpAmbNode = xmlDoc.querySelector('tpAmb')?.textContent;
    const ambiente = tpAmbNode === '1' ? 'Produção' : tpAmbNode === '2' ? 'Homologação' : 'Desconhecido';

    // [REQUISITO: Direção da Nota] tpNF: 0 = Entrada (Despesa), 1 = Saída (Venda) — código oficial da NF-e
    const tpNF = xmlDoc.querySelector('ide tpNF')?.textContent || null;

    // Forma de Pagamento (tPag)
    const tPagNode = xmlDoc.querySelector('detPag tPag')?.textContent || xmlDoc.querySelector('tPag')?.textContent;
    const formasPagamento = {
      '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de Crédito', '04': 'Cartão de Débito',
      '05': 'Crédito Loja', '10': 'Vale Alimentação', '11': 'Vale Refeição', '12': 'Vale Presente',
      '13': 'Vale Combustível', '14': 'Duplicata Mercantil', '15': 'Boleto Bancário', '90': 'Sem Pagamento', '99': 'Outros'
    };
    const formaPagamento = formasPagamento[tPagNode] || 'Outros / Não Informado';

    // Informações Complementares / Adicionais
    const infAdFisco = xmlDoc.querySelector('infAdic infAdFisco')?.textContent || '';
    const infCpl = xmlDoc.querySelector('infAdic infCpl')?.textContent || '';
    const infoComplementares = [infAdFisco, infCpl].filter(Boolean).join(' | ') || 'Sem informações complementares.';

    // Emitente e Destinatário
    const xEmit = xmlDoc.querySelector('emit xNome')?.textContent || 'Desconhecido';
    const cnpjEmit = xmlDoc.querySelector('emit CNPJ')?.textContent || xmlDoc.querySelector('emit CPF')?.textContent || '';
    const ufEmit = xmlDoc.querySelector('emit enderEmit UF')?.textContent || '';
    const munEmit = xmlDoc.querySelector('emit enderEmit xMun')?.textContent || '';

    const xDest = xmlDoc.querySelector('dest xNome')?.textContent || 'Desconhecido';
    const cnpjDest = xmlDoc.querySelector('dest CNPJ')?.textContent || xmlDoc.querySelector('dest CPF')?.textContent || '';
    const ufDest = xmlDoc.querySelector('dest enderDest UF')?.textContent || '';
    const munDest = xmlDoc.querySelector('dest enderDest xMun')?.textContent || '';

    // Totais
    const vBC = xmlDoc.querySelector('total vBC')?.textContent || '0.00';
    const vICMS = xmlDoc.querySelector('total vICMS')?.textContent || '0.00';
    const vBCST = xmlDoc.querySelector('total vBCST')?.textContent || '0.00';
    const vST = xmlDoc.querySelector('total vST')?.textContent || '0.00';
    const vProd = xmlDoc.querySelector('total vProd')?.textContent || '0.00';
    const vFrete = xmlDoc.querySelector('total vFrete')?.textContent || '0.00';
    const vSeg = xmlDoc.querySelector('total vSeg')?.textContent || '0.00';
    const vDesc = xmlDoc.querySelector('total vDesc')?.textContent || '0.00';
    const vIPI = xmlDoc.querySelector('total vIPI')?.textContent || '0.00';
    const vPIS = xmlDoc.querySelector('total vPIS')?.textContent || '0.00';
    const vCOFINS = xmlDoc.querySelector('total vCOFINS')?.textContent || '0.00';
    const vOutro = xmlDoc.querySelector('total vOutro')?.textContent || '0.00';
    const vNF = xmlDoc.querySelector('total vNF')?.textContent || '0.00';

    // Transporte
    const modFrete = xmlDoc.querySelector('transp modFrete')?.textContent || '9';
    const transpNome = xmlDoc.querySelector('transp transporta xNome')?.textContent || '';
    const transpCnpj = xmlDoc.querySelector('transp transporta CNPJ')?.textContent || '';
    const qVol = xmlDoc.querySelector('transp vol qVol')?.textContent || '';
    const esp = xmlDoc.querySelector('transp vol esp')?.textContent || '';
    const pesoB = xmlDoc.querySelector('transp vol pesoB')?.textContent || '';

    // Itens
    const itens = [];
    let cfopDominante = '';
    xmlDoc.querySelectorAll('det').forEach(det => {
      const prod = det.querySelector('prod');
      if (prod) {
        const itemCfop = prod.querySelector('CFOP')?.textContent || '';
        if (!cfopDominante && itemCfop) cfopDominante = itemCfop;
        itens.push({
          nItem: det.getAttribute('nItem') || '1',
          cProd: prod.querySelector('cProd')?.textContent || '',
          xProd: prod.querySelector('xProd')?.textContent || '',
          NCM: prod.querySelector('NCM')?.textContent || '',
          CFOP: itemCfop,
          uCom: prod.querySelector('uCom')?.textContent || '',
          qCom: prod.querySelector('qCom')?.textContent || '0',
          vUnCom: prod.querySelector('vUnCom')?.textContent || '0.00',
          vProd: prod.querySelector('vProd')?.textContent || '0.00'
        });
      }
    });

    let statusTriagem = 'Aprovada';
    const totalFloat = parseFloat(vNF);
    if(totalFloat > 10000) statusTriagem = 'Crítica';
    else if(totalFloat > 2500) statusTriagem = 'Em Análise';

    return {
      chave: chNFe, numero: nNF, serie: serie, naturezaOperacao: natOp,
      dataEmissao: new Date(dhEmi).toLocaleDateString('pt-BR'), rawDate: dhEmi,
      status: statusTriagem, cfop: cfopDominante, ambiente, formaPagamento, infoComplementares, tpNF,
      emitente: xEmit, cnpjEmit, uf: ufEmit, municipio: munEmit,
      destinatario: xDest, cnpjDest, ufDest, municipioDest: munDest,
      vBC, vICMS, vBCST, vST, vProd, vFrete, vSeg, vDesc, vIPI, vPIS, vCOFINS, vOutro, valorTotal: vNF,
      modFrete, transpNome, transpCnpj, qVol, esp, pesoB, itensList: itens, rawXml: xmlText
    };
  }
};

export { NfeParser };
